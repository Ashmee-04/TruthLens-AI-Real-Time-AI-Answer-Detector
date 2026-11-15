import type {
  ClaimCategory,
  ClaimStatus,
  EvidenceConfidence,
  EvidenceConfidenceLevel,
  FreshnessAssessment,
  FreshnessLabel,
  VolatilityTier,
  WebEvidenceSource,
} from '../shared/types.ts';

interface FreshnessAnalysisInput {
  status: ClaimStatus;
  category: ClaimCategory;
  volatilityTier: VolatilityTier;
  isTimeSensitive: boolean;
  sources: WebEvidenceSource[];
  relevantSourceCount: number;
  credibleSourceCount: number;
  sourceAgreement: 'consistent' | 'conflicting' | 'contradicting' | 'insufficient';
  indicatesRecentChange: boolean;
  evaluationConfidence: 'high' | 'moderate' | 'low';
}

const CATEGORY_WINDOW_DAYS: Record<ClaimCategory, number> = {
  'API versions': 90,
  'Product pricing': 120,
  'Company leadership': 180,
  'Policies': 180,
  'Software features': 270,
  'Technology updates': 270,
  'Regulations': 365,
  'Statistics': 365,
  'Other factual information': 540,
};

function parseValidDates(sources: WebEvidenceSource[]): number[] {
  const timestamps: number[] = [];
  for (const s of sources) {
    if (!s.publishedDate) continue;
    const ms = Date.parse(s.publishedDate);
    if (!Number.isNaN(ms)) {
      timestamps.push(ms);
    }
  }
  return timestamps.sort((a, b) => b - a);
}

export function analyzeFreshnessAndConfidence(input: FreshnessAnalysisInput): {
  freshness: FreshnessAssessment;
  confidence: EvidenceConfidence;
} {
  const validDates = parseValidDates(input.sources);
  const newestSourceDate = validDates.length > 0 ? new Date(validDates[0]).toISOString() : null;
  const oldestSourceDate =
    validDates.length > 0 ? new Date(validDates[validDates.length - 1]).toISOString() : null;

  // Non-time-sensitive claims do not get artificial freshness scores
  if (!input.isTimeSensitive || input.status === 'NOT_TIME_SENSITIVE') {
    return {
      freshness: {
        score: null,
        label: 'Not applicable (static factual claim)',
        explanation:
          'This claim describes a static or historical fact that does not decay over time, so freshness scoring is not applicable.',
        methodologyNote:
          'Static claims are excluded from temporal decay scoring to avoid misleading freshness numbers.',
        limitations: ['Static classification relies on claim semantics rather than live source verification.'],
        factors: {
          categoryVolatility: 'static',
          hasPublishedDates: false,
          newestSourceDate: null,
          oldestSourceDate: null,
          sourceCount: input.sources.length,
          agreementState: 'not_applicable',
        },
      },
      confidence: {
        level: 'Moderate',
        score: null,
        explanation: 'Classified as non-time-sensitive based on claim structure and category heuristics.',
        limitations: ['Live web search was skipped because the claim was classified as non-time-sensitive.'],
      },
    };
  }

  // Missing or failed evidence: refuse to calculate a numerical freshness score
  if (
    input.status === 'UNVERIFIABLE' ||
    input.status === 'INSUFFICIENT_EVIDENCE' ||
    input.status === 'VERIFICATION_FAILED' ||
    input.status === 'NOT_CHECKED' ||
    input.relevantSourceCount === 0
  ) {
    const reasonText =
      input.status === 'VERIFICATION_FAILED'
        ? 'Evidence retrieval or evaluation failed before sufficient sources could be assessed.'
        : 'No sufficiently relevant live web sources were available to evaluate current accuracy.';

    return {
      freshness: {
        score: null,
        label: 'Insufficient evidence for scoring',
        explanation: `${reasonText} TruthLens AI does not compute a numerical freshness score when supporting evidence is missing.`,
        methodologyNote:
          'Requires at least one relevant retrieved source and completed evidence evaluation before computing a freshness index.',
        limitations: [
          'Missing or insufficient live web evidence prevents a defensible freshness measurement.',
        ],
        factors: {
          categoryVolatility: input.volatilityTier,
          hasPublishedDates: validDates.length > 0,
          newestSourceDate,
          oldestSourceDate,
          sourceCount: input.sources.length,
          agreementState: 'insufficient',
        },
      },
      confidence: {
        level: 'None',
        score: null,
        explanation:
          input.status === 'VERIFICATION_FAILED'
            ? 'Verification could not be completed due to an API or processing failure.'
            : 'Available search snippets did not contain enough direct, credible evidence.',
        limitations: ['Cannot establish whether the claim is current or outdated without direct evidence.'],
      },
    };
  }

  // Transparent, deterministic calculation for evaluated claims with relevant sources:
  // 1. Base score from status & source agreement (0-55 pts)
  // 2. Recency score relative to category volatility window (0-30 pts)
  // 3. Corroboration & relevance bonus (0-15 pts)
  const limitations: string[] = [];
  const windowDays = CATEGORY_WINDOW_DAYS[input.category];

  let statusComponent = 0;
  if (input.status === 'VERIFIED' && !input.indicatesRecentChange) {
    statusComponent = input.sourceAgreement === 'consistent' ? 55 : 42;
  } else if (input.status === 'CONFLICTING_EVIDENCE') {
    statusComponent = 28;
    limitations.push('Retrieved sources contain conflicting or materially differing statements.');
  } else if (input.status === 'POTENTIALLY_OUTDATED' || input.indicatesRecentChange) {
    statusComponent = 10;
  }

  let recencyComponent = 0;
  if (validDates.length > 0) {
    const newestAgeDays = Math.max(0, (Date.now() - validDates[0]) / (1000 * 60 * 60 * 24));
    const ratio = Math.max(0, 1 - newestAgeDays / windowDays);
    recencyComponent = Math.round(ratio * 30);
    if (newestAgeDays > windowDays) {
      limitations.push(
        `Newest dated source is ${Math.round(newestAgeDays)} days old, exceeding the ${windowDays}-day ${input.category} reference window.`
      );
    }
  } else {
    // No publication dates supplied by sources: explicitly record limitation and award conservative midpoint
    recencyComponent = 12;
    limitations.push(
      'Source publication dates were not supplied in search metadata; recency component uses a conservative neutral baseline.'
    );
  }

  const corroborationComponent = Math.min(
    15,
    input.credibleSourceCount * 5 + Math.min(input.relevantSourceCount, 3) * 2
  );

  const rawScore = Math.max(0, Math.min(100, statusComponent + recencyComponent + corroborationComponent));

  let label: FreshnessLabel;
  if (input.status === 'POTENTIALLY_OUTDATED') {
    label = 'Potentially Outdated';
  } else if (input.status === 'CONFLICTING_EVIDENCE') {
    label = 'Conflicting Signals';
  } else if (rawScore >= 80) {
    label = 'Current';
  } else if (rawScore >= 60) {
    label = 'Likely Current';
  } else {
    label = 'Aging / Monitor';
  }

  const explanation = `Freshness index ${rawScore}/100 (${label}) derived from evidence alignment (${statusComponent}/55), source recency vs. ${windowDays}-day ${input.category} window (${recencyComponent}/30), and source corroboration (${corroborationComponent}/15). This index reflects evidence freshness, not a mathematical probability of truth.`;

  // Separate Evidence Confidence calculation (never merged into Freshness Score)
  const confidence = computeEvidenceConfidence({
    sourceCount: input.sources.length,
    relevantSourceCount: input.relevantSourceCount,
    credibleSourceCount: input.credibleSourceCount,
    hasPublishedDates: validDates.length > 0,
    sourceAgreement: input.sourceAgreement,
    evaluationConfidence: input.evaluationConfidence,
  });

  return {
    freshness: {
      score: rawScore,
      label,
      explanation,
      methodologyNote: `Additive 100-point rubric: Alignment (55) + Category-window recency against ${windowDays}d (${input.category}) (30) + Credible corroboration (15). Not a probability of correctness.`,
      limitations,
      factors: {
        categoryVolatility: input.volatilityTier,
        hasPublishedDates: validDates.length > 0,
        newestSourceDate,
        oldestSourceDate,
        sourceCount: input.sources.length,
        agreementState: input.sourceAgreement,
      },
    },
    confidence,
  };
}

function computeEvidenceConfidence(params: {
  sourceCount: number;
  relevantSourceCount: number;
  credibleSourceCount: number;
  hasPublishedDates: boolean;
  sourceAgreement: 'consistent' | 'conflicting' | 'contradicting' | 'insufficient';
  evaluationConfidence: 'high' | 'moderate' | 'low';
}): EvidenceConfidence {
  const limitations: string[] = [];
  let score = 20;

  score += Math.min(35, params.relevantSourceCount * 12);
  score += Math.min(25, params.credibleSourceCount * 10);

  if (params.hasPublishedDates) {
    score += 10;
  } else {
    limitations.push('Publication dates unavailable on one or more retrieved sources.');
  }

  if (params.sourceAgreement === 'consistent') {
    score += 10;
  } else if (params.sourceAgreement === 'conflicting') {
    score -= 10;
    limitations.push('Sources do not fully agree on current details.');
  } else if (params.sourceAgreement === 'insufficient') {
    score -= 15;
    limitations.push('Retrieved snippets only partially address the claim.');
  }

  if (params.evaluationConfidence === 'low') {
    score = Math.min(score, 45);
    limitations.push('Evidence directly addressing the exact claim phrasing was limited.');
  } else if (params.relevantSourceCount < 2) {
    limitations.push('Only one directly relevant source was retrieved; independent corroboration is limited.');
  }

  const clamped = Math.max(5, Math.min(95, score));
  let level: EvidenceConfidenceLevel = 'Low';
  if (clamped >= 75) level = 'High';
  else if (clamped >= 50) level = 'Moderate';

  return {
    level,
    score: clamped,
    explanation: `${level} evidence confidence (${clamped}/100) based on ${params.relevantSourceCount} relevant source(s), ${params.credibleSourceCount} credible/authoritative match(es), and ${params.sourceAgreement} source agreement.`,
    limitations,
  };
}
