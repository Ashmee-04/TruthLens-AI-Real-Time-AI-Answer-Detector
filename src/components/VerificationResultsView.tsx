import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Info,
} from 'lucide-react';
import { useState } from 'react';
import type {
  AppPreferences,
  ClaimStatus,
  VerificationRecord,
  VerifiedClaimResult,
} from '../../shared/types.ts';
import { downloadReportPdf, formatReportSummaryText } from '../utils/exportReport.ts';
import { StatusIndicator, formatDateTime, formatShortDate } from './StatusIndicator.tsx';

interface VerificationResultsViewProps {
  record: VerificationRecord;
  preferences: AppPreferences;
  onOpenReport?: (record: VerificationRecord) => void;
  onStartNew?: () => void;
}

type StatusFilter = 'ALL' | 'ATTENTION' | ClaimStatus;

export function VerificationResultsView({
  record,
  preferences,
  onOpenReport,
  onStartNew,
}: VerificationResultsViewProps) {
  const { report } = record;
  const s = report.summary;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const c of report.claims) {
      initial[c.id] =
        preferences.expandAllClaimsByDefault ||
        c.status === 'POTENTIALLY_OUTDATED' ||
        c.status === 'CONFLICTING_EVIDENCE' ||
        c.status === 'VERIFICATION_FAILED';
    }
    return initial;
  });
  const [copied, setCopied] = useState(false);
  const [showOriginalAnswer, setShowOriginalAnswer] = useState(true);

  const toggleClaim = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of report.claims) {
      next[c.id] = open;
    }
    setExpandedIds(next);
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(formatReportSummaryText(record));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const filteredClaims = report.claims.filter((c) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ATTENTION') {
      return (
        c.status === 'POTENTIALLY_OUTDATED' ||
        c.status === 'CONFLICTING_EVIDENCE' ||
        c.status === 'VERIFICATION_FAILED'
      );
    }
    return c.status === statusFilter;
  });

  const attentionCount =
    s.potentiallyOutdatedCount + s.conflictingCount + s.verificationFailedCount;

  return (
    <div className="space-y-6">
      {/* Verification Metadata & Action Header */}
      <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
              <span className="font-mono text-indigo-300">{record.id}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatDateTime(record.completedAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{report.metadata.bifrostModel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {(report.metadata.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-100 break-words">
              {report.reportTitle}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
              {report.executiveSummary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#283552] bg-[#162033] hover:bg-[#1C2942] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>{copied ? 'Summary Copied' : 'Copy Summary'}</span>
            </button>

            <button
              type="button"
              onClick={() => downloadReportPdf(record)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#283552] bg-[#162033] hover:bg-[#1C2942] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              <span>Download PDF</span>
            </button>

            {onOpenReport && (
              <button
                type="button"
                onClick={() => onOpenReport(record)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>View Detailed Report</span>
              </button>
            )}

            {onStartNew && (
              <button
                type="button"
                onClick={onStartNew}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#283552] text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Verify Another</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-5 border-t border-[#1F2B42]">
          <MetricCell label="Claims Extracted" value={s.totalClaims} tone="text-slate-100" />
          <MetricCell label="Claims Checked" value={s.claimsChecked} tone="text-indigo-300" />
          <MetricCell label="Verified / Current" value={s.verifiedCount} tone="text-emerald-400" />
          <MetricCell label="Potentially Outdated" value={s.potentiallyOutdatedCount} tone="text-red-400" />
          <MetricCell label="Conflicting" value={s.conflictingCount} tone="text-amber-400" />
          <MetricCell
            label="Unverifiable / Static"
            value={s.unverifiableCount + s.insufficientEvidenceCount + s.notTimeSensitiveCount}
            tone="text-slate-300"
          />
        </div>
      </div>

      {/* Original Submitted Answer */}
      <div className="bg-[#111827] border border-[#1F2B42] rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowOriginalAnswer((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-[#162033]/50 transition-colors cursor-pointer"
        >
          <span className="text-sm font-medium text-slate-200">
            Original Submitted Answer
            {record.context ? ' · Context Supplied' : ''}
          </span>
          {showOriginalAnswer ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>
        {showOriginalAnswer && (
          <div className="px-5 pb-5 pt-1 border-t border-[#1F2B42] space-y-3">
            {record.context && (
              <p className="text-xs text-slate-400">
                <span className="font-medium text-slate-300">Context:</span> {record.context}
              </p>
            )}
            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
              {record.originalAnswer}
            </p>
          </div>
        )}
      </div>

      {/* Claims Section Header & Interactive Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#111827] border border-[#1F2B42] rounded-lg">
          <FilterTab
            active={statusFilter === 'ALL'}
            onClick={() => setStatusFilter('ALL')}
            label={`All (${report.claims.length})`}
          />
          {attentionCount > 0 && (
            <FilterTab
              active={statusFilter === 'ATTENTION'}
              onClick={() => setStatusFilter('ATTENTION')}
              label={`Needs Attention (${attentionCount})`}
            />
          )}
          <FilterTab
            active={statusFilter === 'VERIFIED'}
            onClick={() => setStatusFilter('VERIFIED')}
            label={`Current (${s.verifiedCount})`}
          />
          <FilterTab
            active={statusFilter === 'POTENTIALLY_OUTDATED'}
            onClick={() => setStatusFilter('POTENTIALLY_OUTDATED')}
            label={`Outdated (${s.potentiallyOutdatedCount})`}
          />
          <FilterTab
            active={statusFilter === 'CONFLICTING_EVIDENCE'}
            onClick={() => setStatusFilter('CONFLICTING_EVIDENCE')}
            label={`Conflicting (${s.conflictingCount})`}
          />
          <FilterTab
            active={statusFilter === 'UNVERIFIABLE'}
            onClick={() => setStatusFilter('UNVERIFIABLE')}
            label={`Unverifiable (${s.unverifiableCount + s.insufficientEvidenceCount})`}
          />
          <FilterTab
            active={statusFilter === 'NOT_TIME_SENSITIVE'}
            onClick={() => setStatusFilter('NOT_TIME_SENSITIVE')}
            label={`Static (${s.notTimeSensitiveCount})`}
          />
        </div>

        {report.claims.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => expandAll(true)}
              className="text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              Expand all
            </button>
            <span className="text-slate-600" aria-hidden="true">
              /
            </span>
            <button
              type="button"
              onClick={() => expandAll(false)}
              className="text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      {/* Claim Cards List or Empty Claims State */}
      {report.claims.length === 0 ? (
        <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-8 text-center space-y-2">
          <Info className="h-6 w-6 text-indigo-400 mx-auto" />
          <h3 className="text-base font-semibold text-slate-100">No Factual Claims Detected</h3>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            Bifrost analysis found no discrete verifiable factual claims in the submitted text
            (opinions, questions, hypotheticals, and generic advice are intentionally excluded).
          </p>
        </div>
      ) : filteredClaims.length === 0 ? (
        <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-8 text-center space-y-2">
          <p className="text-sm text-slate-300">No claims match the selected status filter.</p>
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClaims.map((claim) => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              expanded={Boolean(expandedIds[claim.id])}
              onToggle={() => toggleClaim(claim.id)}
              showMethodology={preferences.showMethodologyNotes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-semibold font-mono tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
        active
          ? 'bg-[#1D2840] text-slate-100'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
      }`}
    >
      {label}
    </button>
  );
}

function ClaimCard({
  claim,
  expanded,
  onToggle,
  showMethodology,
}: {
  claim: VerifiedClaimResult;
  expanded: boolean;
  onToggle: () => void;
  showMethodology: boolean;
}) {
  return (
    <article className="bg-[#111827] border border-[#1F2B42] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full p-5 text-left hover:bg-[#162033]/40 transition-colors cursor-pointer"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
              <span className="font-mono text-slate-300">{claim.id}</span>
              <span aria-hidden="true">·</span>
              <span>{claim.category}</span>
              <span aria-hidden="true">·</span>
              <span>{claim.isTimeSensitive ? 'Time-Sensitive' : 'Not Time-Sensitive'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {claim.sources.length} {claim.sources.length === 1 ? 'source' : 'sources'}
              </span>
            </div>
            <p className="text-[15px] font-medium text-slate-100 leading-relaxed break-words">
              “{claim.originalText}”
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-0.5">
            <StatusIndicator status={claim.status} />
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-4 border-t border-[#1F2B42] space-y-5">
          {/* Explanation & Suggested Action */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-slate-400">Verification Explanation</h4>
              <p className="text-sm text-slate-200 leading-relaxed">{claim.explanation}</p>
              {claim.contextNote && (
                <p className="text-xs text-slate-400 pt-1">
                  <span className="text-slate-300 font-medium">Context Note:</span> {claim.contextNote}
                </p>
              )}
              <p className="text-xs text-slate-400 pt-0.5">
                <span className="text-slate-300 font-medium">Why Checked:</span> {claim.whyVerify}
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-slate-400">Suggested Action</h4>
              <p className="text-sm text-slate-200 leading-relaxed">{claim.suggestedAction}</p>
              {claim.errorDetail && (
                <p className="text-xs text-rose-400 pt-1 font-mono break-words">
                  API Error: {claim.errorDetail}
                </p>
              )}
            </div>
          </div>

          {/* Separated Freshness Assessment vs Evidence Confidence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-[#1F2B42]">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-medium text-slate-400">Freshness Assessment</h4>
                <span className="text-sm font-mono tabular-nums font-medium text-slate-100">
                  {claim.freshness.score !== null ? `${claim.freshness.score}/100 · ` : ''}
                  {claim.freshness.label}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{claim.freshness.explanation}</p>
              {showMethodology && (
                <p className="text-xs text-slate-400 leading-relaxed">
                  {claim.freshness.methodologyNote}
                </p>
              )}
              {claim.freshness.limitations.length > 0 && (
                <ul className="space-y-1 text-xs text-amber-300/90 pt-1">
                  {claim.freshness.limitations.map((lim, idx) => (
                    <li key={idx}>• {lim}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-medium text-slate-400">Evidence Confidence</h4>
                <span className="text-sm font-mono tabular-nums font-medium text-slate-100">
                  {claim.confidence.level}
                  {claim.confidence.score !== null ? ` (${claim.confidence.score}/100)` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {claim.confidence.explanation}
              </p>
              {claim.confidence.limitations.length > 0 && (
                <ul className="space-y-1 text-xs text-slate-400 pt-1">
                  {claim.confidence.limitations.map((lim, idx) => (
                    <li key={idx}>• {lim}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Supporting Web Sources */}
          <div className="pt-4 border-t border-[#1F2B42] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-medium text-slate-400">
                Retrieved Web Evidence ({claim.sources.length})
              </h4>
              {claim.queriesExecuted.length > 0 && (
                <span className="text-xs text-slate-500 font-mono truncate max-w-xl">
                  Query: {claim.queriesExecuted.join(' | ')}
                </span>
              )}
            </div>

            {claim.sources.length === 0 ? (
              <p className="text-xs text-slate-400">
                No external web sources were retrieved for this claim.
              </p>
            ) : (
              <div className="divide-y divide-[#1F2B42] border border-[#1F2B42] rounded-lg bg-[#0D1322]">
                {claim.sources.map((src) => (
                  <div key={src.id} className="p-3.5 space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-300 hover:text-indigo-200 hover:underline break-words"
                      >
                        <span>{src.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </a>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs font-mono tabular-nums text-slate-400 shrink-0">
                        <span>Published: {formatShortDate(src.publishedDate)}</span>
                        <span aria-hidden="true">·</span>
                        <span>Retrieved: {formatShortDate(src.retrievedAt)}</span>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-500 truncate">{src.url}</div>
                    {src.snippet && (
                      <p className="text-xs text-slate-300 leading-relaxed">{src.snippet}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
