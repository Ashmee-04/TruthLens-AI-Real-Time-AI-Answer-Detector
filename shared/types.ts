export const CLAIM_CATEGORIES = [
  'Product pricing',
  'API versions',
  'Software features',
  'Company leadership',
  'Regulations',
  'Policies',
  'Technology updates',
  'Statistics',
  'Other factual information',
] as const;

export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export type ClaimStatus =
  | 'VERIFIED'
  | 'POTENTIALLY_OUTDATED'
  | 'CONFLICTING_EVIDENCE'
  | 'UNVERIFIABLE'
  | 'NOT_TIME_SENSITIVE'
  | 'VERIFICATION_FAILED'
  | 'NOT_CHECKED'
  | 'INSUFFICIENT_EVIDENCE';

export type VolatilityTier = 'high' | 'medium' | 'low' | 'static';

export type FreshnessLabel =
  | 'Current'
  | 'Likely Current'
  | 'Aging / Monitor'
  | 'Potentially Outdated'
  | 'Conflicting Signals'
  | 'Insufficient evidence for scoring'
  | 'Not applicable (static factual claim)';

export type EvidenceConfidenceLevel = 'High' | 'Moderate' | 'Low' | 'None';

export interface WebEvidenceSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedDate: string | null;
  retrievedAt: string;
  relevanceScore: number | null;
  queryUsed: string;
}

export interface FreshnessAssessment {
  score: number | null;
  label: FreshnessLabel;
  explanation: string;
  methodologyNote: string;
  limitations: string[];
  factors: {
    categoryVolatility: VolatilityTier;
    hasPublishedDates: boolean;
    newestSourceDate: string | null;
    oldestSourceDate: string | null;
    sourceCount: number;
    agreementState: 'consistent' | 'conflicting' | 'contradicting' | 'insufficient' | 'not_applicable';
  };
}

export interface EvidenceConfidence {
  level: EvidenceConfidenceLevel;
  score: number | null;
  explanation: string;
  limitations: string[];
}

export interface ExtractedClaim {
  id: string;
  originalText: string;
  category: ClaimCategory;
  isTimeSensitive: boolean;
  volatilityTier: VolatilityTier;
  whyVerify: string;
  contextNote: string | null;
  suggestedQueries: string[];
}

export interface VerifiedClaimResult {
  id: string;
  originalText: string;
  category: ClaimCategory;
  isTimeSensitive: boolean;
  volatilityTier: VolatilityTier;
  whyVerify: string;
  contextNote: string | null;
  status: ClaimStatus;
  explanation: string;
  suggestedAction: string;
  freshness: FreshnessAssessment;
  confidence: EvidenceConfidence;
  sources: WebEvidenceSource[];
  queriesExecuted: string[];
  errorDetail: string | null;
}

export interface VerificationSummaryCounts {
  totalClaims: number;
  claimsChecked: number;
  verifiedCount: number;
  potentiallyOutdatedCount: number;
  conflictingCount: number;
  unverifiableCount: number;
  insufficientEvidenceCount: number;
  notTimeSensitiveCount: number;
  verificationFailedCount: number;
  notCheckedCount: number;
}

export interface VerificationReport {
  reportTitle: string;
  verificationId: string;
  createdAt: string;
  completedAt: string;
  title: string | null;
  context: string | null;
  originalAnswer: string;
  summary: VerificationSummaryCounts;
  executiveSummary: string;
  claims: VerifiedClaimResult[];
  conflictingFindings: {
    claimId: string;
    claimText: string;
    explanation: string;
    sourceUrls: string[];
  }[];
  unverifiableFindings: {
    claimId: string;
    claimText: string;
    reason: string;
  }[];
  recommendedActions: string[];
  limitations: string[];
  processingStatus: 'completed' | 'partial' | 'no_claims';
  metadata: {
    bifrostModel: string;
    totalSourcesRetrieved: number;
    durationMs: number;
  };
}

export interface VerificationRecord {
  id: string;
  createdAt: string;
  completedAt: string;
  title: string | null;
  context: string | null;
  originalAnswer: string;
  summary: VerificationSummaryCounts;
  report: VerificationReport;
}

export type VerificationStage =
  | 'validating'
  | 'extracting_claims'
  | 'classifying_time_sensitivity'
  | 'searching_web'
  | 'evaluating_evidence'
  | 'generating_report'
  | 'completed'
  | 'error';

export interface VerificationProgressEvent {
  stage: VerificationStage;
  message: string;
  detail?: string;
  completedSteps?: number;
  totalSteps?: number;
  record?: VerificationRecord;
  error?: {
    code: string;
    message: string;
    provider?: 'bifrost' | 'tavily' | 'server';
    retryable?: boolean;
  };
}

export interface IntegrationStatus {
  configured: boolean;
  status: 'unconfigured' | 'untested' | 'connected' | 'disconnected';
  endpointHost: string | null;
  model: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
  error: string | null;
  missingVars: string[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  maxInputChars: number;
  persistence: {
    mode: 'server_filesystem';
    pathLabel: string;
    encryptedAtRest: false;
  };
  integrations: {
    bifrost: IntegrationStatus;
    tavily: IntegrationStatus;
  };
}

export interface DashboardMetrics {
  totalVerifications: number;
  totalClaimsProcessed: number;
  potentiallyOutdatedClaims: number;
  conflictingClaims: number;
  unverifiableClaims: number;
  verifiedClaims: number;
}

export interface HistoryListResponse {
  records: VerificationRecord[];
  metrics: DashboardMetrics;
}

export interface AppPreferences {
  expandAllClaimsByDefault: boolean;
  showMethodologyNotes: boolean;
  compactTableRows: boolean;
}
