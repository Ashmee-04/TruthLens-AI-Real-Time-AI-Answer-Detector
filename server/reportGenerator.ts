import type {
  VerificationRecord,
  VerificationReport,
  VerificationSummaryCounts,
  VerifiedClaimResult,
} from '../shared/types.ts';

export function buildVerificationRecord(params: {
  verificationId: string;
  createdAt: string;
  title: string | null;
  context: string | null;
  originalAnswer: string;
  claims: VerifiedClaimResult[];
  bifrostModel: string;
  durationMs: number;
}): VerificationRecord {
  const completedAt = new Date().toISOString();
  const { claims } = params;

  const summary: VerificationSummaryCounts = {
    totalClaims: claims.length,
    claimsChecked: claims.filter(
      (c) => c.status !== 'NOT_TIME_SENSITIVE' && c.status !== 'NOT_CHECKED'
    ).length,
    verifiedCount: claims.filter((c) => c.status === 'VERIFIED').length,
    potentiallyOutdatedCount: claims.filter((c) => c.status === 'POTENTIALLY_OUTDATED').length,
    conflictingCount: claims.filter((c) => c.status === 'CONFLICTING_EVIDENCE').length,
    unverifiableCount: claims.filter((c) => c.status === 'UNVERIFIABLE').length,
    insufficientEvidenceCount: claims.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,
    notTimeSensitiveCount: claims.filter((c) => c.status === 'NOT_TIME_SENSITIVE').length,
    verificationFailedCount: claims.filter((c) => c.status === 'VERIFICATION_FAILED').length,
    notCheckedCount: claims.filter((c) => c.status === 'NOT_CHECKED').length,
  };

  const conflictingFindings = claims
    .filter((c) => c.status === 'CONFLICTING_EVIDENCE')
    .map((c) => ({
      claimId: c.id,
      claimText: c.originalText,
      explanation: c.explanation,
      sourceUrls: c.sources.map((s) => s.url),
    }));

  const unverifiableFindings = claims
    .filter(
      (c) =>
        c.status === 'UNVERIFIABLE' ||
        c.status === 'INSUFFICIENT_EVIDENCE' ||
        c.status === 'VERIFICATION_FAILED'
    )
    .map((c) => ({
      claimId: c.id,
      claimText: c.originalText,
      reason: c.errorDetail || c.explanation,
    }));

  const totalSourcesRetrieved = claims.reduce((sum, c) => sum + c.sources.length, 0);

  let processingStatus: VerificationReport['processingStatus'] = 'completed';
  if (claims.length === 0) {
    processingStatus = 'no_claims';
  } else if (summary.verificationFailedCount > 0) {
    processingStatus = 'partial';
  }

  const executiveSummary = buildExecutiveSummary(summary);
  const recommendedActions = buildRecommendedActions(claims, summary);
  const limitations = buildLimitations(claims, summary, totalSourcesRetrieved);

  const reportTitle =
    params.title ||
    `Verification Report · ${new Date(params.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;

  const report: VerificationReport = {
    reportTitle,
    verificationId: params.verificationId,
    createdAt: params.createdAt,
    completedAt,
    title: params.title,
    context: params.context,
    originalAnswer: params.originalAnswer,
    summary,
    executiveSummary,
    claims,
    conflictingFindings,
    unverifiableFindings,
    recommendedActions,
    limitations,
    processingStatus,
    metadata: {
      bifrostModel: params.bifrostModel,
      totalSourcesRetrieved,
      durationMs: params.durationMs,
    },
  };

  return {
    id: params.verificationId,
    createdAt: params.createdAt,
    completedAt,
    title: params.title,
    context: params.context,
    originalAnswer: params.originalAnswer,
    summary,
    report,
  };
}

function buildExecutiveSummary(s: VerificationSummaryCounts): string {
  if (s.totalClaims === 0) {
    return 'No verifiable factual claims were detected in the submitted text (content consisted of opinions, questions, hypotheticals, or general advice).';
  }

  const parts: string[] = [
    `Extracted ${s.totalClaims} factual claim${s.totalClaims === 1 ? '' : 's'} (${s.claimsChecked} time-sensitive checked against live web sources, ${s.notTimeSensitiveCount} static/non-time-sensitive).`,
  ];

  if (s.potentiallyOutdatedCount > 0) {
    parts.push(
      `Detected ${s.potentiallyOutdatedCount} potentially outdated claim${s.potentiallyOutdatedCount === 1 ? '' : 's'} where retrieved evidence indicates recent changes.`
    );
  }
  if (s.conflictingCount > 0) {
    parts.push(
      `Found ${s.conflictingCount} claim${s.conflictingCount === 1 ? '' : 's'} with conflicting evidence across sources.`
    );
  }
  if (s.unverifiableCount + s.insufficientEvidenceCount > 0) {
    const count = s.unverifiableCount + s.insufficientEvidenceCount;
    parts.push(
      `${count} claim${count === 1 ? '' : 's'} could not be conclusively verified due to missing or insufficient web evidence.`
    );
  }
  if (s.verificationFailedCount > 0) {
    parts.push(
      `${s.verificationFailedCount} claim${s.verificationFailedCount === 1 ? '' : 's'} failed verification due to upstream API errors.`
    );
  }
  if (
    s.verifiedCount > 0 &&
    s.potentiallyOutdatedCount === 0 &&
    s.conflictingCount === 0 &&
    s.unverifiableCount + s.insufficientEvidenceCount + s.verificationFailedCount === 0
  ) {
    parts.push(
      `All ${s.verifiedCount} checked claim${s.verifiedCount === 1 ? ' is' : 's are'} supported by the retrieved web sources at the time of retrieval.`
    );
  }

  return parts.join(' ');
}

function buildRecommendedActions(
  claims: VerifiedClaimResult[],
  summary: VerificationSummaryCounts
): string[] {
  const actions: string[] = [];

  if (summary.potentiallyOutdatedCount > 0) {
    actions.push(
      `Update or remove the ${summary.potentiallyOutdatedCount} potentially outdated claim(s) using the primary vendor or official sources cited in the claim findings.`
    );
  }
  if (summary.conflictingCount > 0) {
    actions.push(
      `Review the ${summary.conflictingCount} conflicting claim(s) by opening the diverging source URLs directly before relying on the answer.`
    );
  }
  if (summary.unverifiableCount + summary.insufficientEvidenceCount > 0) {
    actions.push(
      `Do not treat the ${summary.unverifiableCount + summary.insufficientEvidenceCount} unverifiable/insufficient-evidence claim(s) as verified; check primary documentation directly.`
    );
  }
  if (summary.verificationFailedCount > 0) {
    actions.push(
      `Resolve upstream API connectivity issues in Settings and re-run verification for the ${summary.verificationFailedCount} failed claim(s).`
    );
  }

  for (const c of claims) {
    if (
      (c.status === 'POTENTIALLY_OUTDATED' || c.status === 'CONFLICTING_EVIDENCE') &&
      actions.length < 6
    ) {
      actions.push(`${c.id}: ${c.suggestedAction}`);
    }
  }

  if (actions.length === 0) {
    actions.push('Review the cited source links and publication dates to confirm alignment with your target timeframe.');
  }

  return actions;
}

function buildLimitations(
  claims: VerifiedClaimResult[],
  summary: VerificationSummaryCounts,
  totalSources: number
): string[] {
  const limitations: string[] = [
    'Verification reflects web search snippets retrieved at the recorded retrieval timestamp and does not inspect paywalled or private internal documentation.',
    'AI evidence evaluation assists with synthesis but is not independent proof; users should inspect the linked primary sources directly.',
  ];

  const missingDatesCount = claims.filter(
    (c) => c.sources.length > 0 && !c.freshness.factors.hasPublishedDates
  ).length;
  if (missingDatesCount > 0) {
    limitations.push(
      `${missingDatesCount} checked claim(s) relied on sources whose web metadata did not include a verifiable publication date.`
    );
  }

  if (summary.unverifiableCount + summary.insufficientEvidenceCount > 0) {
    limitations.push(
      'Some claims lacked sufficient direct public web evidence and remain unverified rather than assumed accurate.'
    );
  }

  if (summary.verificationFailedCount > 0) {
    limitations.push(
      `Partial verification: ${summary.verificationFailedCount} claim(s) encountered API errors during retrieval or evaluation.`
    );
  }

  if (totalSources === 0 && summary.claimsChecked > 0) {
    limitations.push('No external web sources were retrieved for the checked claims.');
  }

  return limitations;
}
