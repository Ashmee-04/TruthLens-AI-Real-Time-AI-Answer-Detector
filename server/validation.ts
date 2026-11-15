import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getServerConfig } from './config.ts';
import { RateLimitError, ValidationError } from './errors.ts';

export interface ValidatedVerifyInput {
  answer: string;
  title: string | null;
  context: string | null;
}

export function validateVerifyRequestBody(body: unknown): ValidatedVerifyInput {
  const config = getServerConfig();

  const schema = z.object({
    answer: z
      .string({ error: 'Submitted AI answer text is required.' })
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, {
        message: 'Please paste an AI-generated answer to verify. Empty submissions cannot be processed.',
      })
      .refine((s) => s.length >= 15, {
        message: 'Submitted answer is too short (minimum 15 characters) to contain verifiable factual claims.',
      })
      .refine((s) => s.length <= config.maxInputChars, {
        message: `Submitted answer exceeds the maximum limit of ${config.maxInputChars.toLocaleString()} characters.`,
      }),
    title: z
      .string()
      .max(config.maxTitleChars, `Title cannot exceed ${config.maxTitleChars} characters.`)
      .optional()
      .nullable(),
    context: z
      .string()
      .max(config.maxContextChars, `Context cannot exceed ${config.maxContextChars} characters.`)
      .optional()
      .nullable(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new ValidationError(firstIssue?.message || 'Invalid verification input.');
  }

  return {
    answer: sanitizeUntrustedText(parsed.data.answer),
    title: parsed.data.title?.trim() ? sanitizeUntrustedText(parsed.data.title.trim()) : null,
    context: parsed.data.context?.trim() ? sanitizeUntrustedText(parsed.data.context.trim()) : null,
  };
}

/**
 * Strips control characters and neutralizes delimiter tags so untrusted text
 * (user input or external webpage snippets) cannot break prompt boundaries.
 */
export function sanitizeUntrustedText(input: string, maxLength?: number): string {
  const cleaned = input
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<\/?(untrusted_submitted_answer|untrusted_web_evidence|system|instructions)>/gi, (match) =>
      match.replace(/</g, '[').replace(/>/g, ']')
    );

  if (maxLength && cleaned.length > maxLength) {
    return `${cleaned.slice(0, maxLength)}...`;
  }
  return cleaned;
}

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractJsonFromModelText(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      return JSON.parse(fenceMatch[1].trim());
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Model response did not contain valid JSON.');
  }
}

// Simple sliding-window rate limiter per client IP
const requestBuckets = new Map<string, number[]>();

export function verifyRateLimiter(windowMs = 10 * 60 * 1000, maxRequests = 25) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (requestBuckets.get(ip) || []).filter((ts) => now - ts < windowMs);

    if (recent.length >= maxRequests) {
      const oldest = recent[0];
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      next(
        new RateLimitError(
          `Rate limit reached (${maxRequests} verifications per 10 minutes). Please wait ${retryAfterSec}s before retrying.`,
          'server'
        )
      );
      return;
    }

    recent.push(now);
    requestBuckets.set(ip, recent);
    next();
  };
}
