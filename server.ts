import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import type { VerificationProgressEvent, VerifiedClaimResult } from './shared/types.ts';
import { assertBifrostConfigured, getBifrostStatus } from './server/bifrostClient.ts';
import { extractClaimsFromAnswer } from './server/claimExtractionService.ts';
import { getServerConfig } from './server/config.ts';
import { errorHandlerMiddleware, serializeSafeError } from './server/errors.ts';
import { verifySingleClaim } from './server/evidenceEvaluator.ts';
import {
  computeDashboardMetrics,
  deleteVerification,
  getVerificationById,
  listHistory,
  saveVerification,
} from './server/historyService.ts';
import { buildVerificationRecord } from './server/reportGenerator.ts';
import { assertTavilyConfigured, getTavilyStatus } from './server/tavilyClient.ts';
import { refineTimeSensitivityAndQueries } from './server/timeSensitivityClassifier.ts';
import { validateVerifyRequestBody, verifyRateLimiter } from './server/validation.ts';

async function startServer(): Promise<void> {
  const app = express();
  const cfg = getServerConfig();

  app.set('trust proxy', true);
  app.use(express.json({ limit: '256kb' }));

  // Health & API integration status endpoint
  app.get('/api/health', async (req, res, next) => {
    try {
      const liveTest = req.query.live === 'true';
      const [bifrost, tavily] = await Promise.all([
        getBifrostStatus(liveTest),
        getTavilyStatus(liveTest),
      ]);

      const currentCfg = getServerConfig();
      const overallOk =
        bifrost.configured &&
        tavily.configured &&
        bifrost.status !== 'disconnected' &&
        tavily.status !== 'disconnected';

      res.json({
        status: overallOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        maxInputChars: currentCfg.maxInputChars,
        persistence: {
          mode: 'server_filesystem',
          pathLabel: 'Server JSON store (data/verifications.json)',
          encryptedAtRest: false,
        },
        integrations: {
          bifrost,
          tavily,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/health/test', async (_req, res, next) => {
    try {
      const [bifrost, tavily] = await Promise.all([
        getBifrostStatus(true),
        getTavilyStatus(true),
      ]);

      const currentCfg = getServerConfig();
      const overallOk = bifrost.status === 'connected' && tavily.status === 'connected';

      res.json({
        status: overallOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        maxInputChars: currentCfg.maxInputChars,
        persistence: {
          mode: 'server_filesystem',
          pathLabel: 'Server JSON store (data/verifications.json)',
          encryptedAtRest: false,
        },
        integrations: {
          bifrost,
          tavily,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Verification history & metrics
  app.get('/api/history', async (_req, res, next) => {
    try {
      const records = await listHistory();
      const metrics = computeDashboardMetrics(records);
      res.json({ records, metrics });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/history/:id', async (req, res, next) => {
    try {
      const deleted = await deleteVerification(req.params.id);
      if (!deleted) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Verification record "${req.params.id}" was not found.`,
            provider: 'server',
          },
        });
        return;
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  // Individual verification report
  app.get('/api/reports/:id', async (req, res, next) => {
    try {
      const record = await getVerificationById(req.params.id);
      if (!record) {
        res.status(404).json({
          error: {
            code: 'REPORT_NOT_FOUND',
            message: `Report "${req.params.id}" was not found.`,
            provider: 'server',
          },
        });
        return;
      }
      res.json(record);
    } catch (err) {
      next(err);
    }
  });

  // Main verification workflow (supports SSE streaming when ?stream=true or Accept: text/event-stream)
  app.post('/api/verify', verifyRateLimiter(), async (req, res, next) => {
    const wantsStream =
      req.query.stream === 'true' ||
      (req.headers.accept && req.headers.accept.includes('text/event-stream'));

    const emitProgress = (event: VerificationProgressEvent) => {
      if (wantsStream && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
      // 1. Validate input before initiating SSE stream so invalid requests get clean 400 JSON
      const validated = validateVerifyRequestBody(req.body);

      // 2. Verify required integrations are configured before starting pipeline
      const bifrostCfg = assertBifrostConfigured();
      assertTavilyConfigured();

      if (wantsStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
      }

      const startTime = Date.now();
      const verificationId = `VER-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;
      const createdAt = new Date().toISOString();

      emitProgress({
        stage: 'validating',
        message: 'Validated input and server API configuration.',
      });

      // Step 2: Claim extraction via Bifrost
      emitProgress({
        stage: 'extracting_claims',
        message: `Extracting factual claims via Bifrost (${bifrostCfg.model})...`,
      });
      const extractedClaims = await extractClaimsFromAnswer(validated.answer, validated.context);

      // Step 3: Time-sensitivity classification
      emitProgress({
        stage: 'classifying_time_sensitivity',
        message:
          extractedClaims.length === 0
            ? 'No verifiable factual claims detected in submitted text.'
            : `Identified ${extractedClaims.length} factual claim(s); classifying time sensitivity...`,
        detail: `${extractedClaims.length} claim(s) extracted`,
      });
      const classifiedClaims = refineTimeSensitivityAndQueries(extractedClaims);
      const timeSensitiveCount = classifiedClaims.filter((c) => c.isTimeSensitive).length;

      // Step 4 & 5: Live web verification + evidence evaluation per claim
      const verifiedClaims: VerifiedClaimResult[] = [];
      for (let i = 0; i < classifiedClaims.length; i++) {
        const claim = classifiedClaims[i];
        if (claim.isTimeSensitive) {
          emitProgress({
            stage: 'searching_web',
            message: `Searching live web sources for claim ${i + 1} of ${classifiedClaims.length}...`,
            detail: claim.originalText.slice(0, 120),
            completedSteps: i,
            totalSteps: classifiedClaims.length,
          });
        }

        const result = await verifySingleClaim(claim);
        verifiedClaims.push(result);

        if (claim.isTimeSensitive) {
          emitProgress({
            stage: 'evaluating_evidence',
            message: `Evaluated evidence for claim ${i + 1} of ${classifiedClaims.length} (${result.sources.length} source(s) reviewed).`,
            detail: `${claim.id}: ${result.status}`,
            completedSteps: i + 1,
            totalSteps: classifiedClaims.length,
          });
        }
      }

      // Step 6: Generate report & persist record
      emitProgress({
        stage: 'generating_report',
        message: `Generating verification report (${timeSensitiveCount} time-sensitive claim(s) checked)...`,
      });

      const record = buildVerificationRecord({
        verificationId,
        createdAt,
        title: validated.title,
        context: validated.context,
        originalAnswer: validated.answer,
        claims: verifiedClaims,
        bifrostModel: bifrostCfg.model,
        durationMs: Date.now() - startTime,
      });

      await saveVerification(record);

      if (wantsStream) {
        emitProgress({
          stage: 'completed',
          message: 'Verification complete.',
          record,
        });
        res.end();
        return;
      }

      res.status(200).json(record);
    } catch (err) {
      if (wantsStream && res.headersSent) {
        const safe = serializeSafeError(err);
        emitProgress({
          stage: 'error',
          message: safe.message,
          error: {
            code: safe.code,
            message: safe.message,
            provider: safe.provider,
            retryable: safe.retryable,
          },
        });
        res.end();
        return;
      }
      next(err);
    }
  });

  // Centralized error handler for API routes
  app.use('/api', errorHandlerMiddleware);

  // Vite middleware in development or static dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(cfg.port, '0.0.0.0', () => {
    console.log(`TruthLens AI server listening on http://0.0.0.0:${cfg.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TruthLens AI server:', err);
  process.exit(1);
});
