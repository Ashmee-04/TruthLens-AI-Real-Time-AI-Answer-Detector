import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { useState } from 'react';
import type { VerificationRecord, WebEvidenceSource } from '../../shared/types.ts';
import { downloadReportPdf, formatReportSummaryText } from '../utils/exportReport.ts';
import { StatusIndicator, formatDateTime, formatShortDate } from './StatusIndicator.tsx';

interface ReportsPageProps {
  records: VerificationRecord[];
  selectedRecord: VerificationRecord | null;
  onSelectRecord: (record: VerificationRecord) => void;
  onOpenClaimsView: (record: VerificationRecord) => void;
  onStartNew: () => void;
}

export function ReportsPage({
  records,
  selectedRecord,
  onSelectRecord,
  onOpenClaimsView,
  onStartNew,
}: ReportsPageProps) {
  const [copied, setCopied] = useState(false);

  const active = selectedRecord || records[0] || null;

  if (!active) {
    return (
      <div className="space-y-6">
        <div className="pb-4 border-b border-[#1F2B42]">
          <h1 className="text-2xl font-semibold text-slate-100">Reports</h1>
          <p className="text-sm text-slate-400">
            Comprehensive verification reports generated from real claim evaluations and cited web sources.
          </p>
        </div>

        <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-10 text-center space-y-3">
          <FileText className="h-7 w-7 text-slate-500 mx-auto" />
          <h2 className="text-base font-semibold text-slate-100">No reports available</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Run a verification first to generate an evidence-backed report with source references,
            freshness assessments, and PDF export.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onStartNew}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
            >
              Run First Verification
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { report } = active;
  const s = report.summary;

  // Deduplicate all unique cited sources across claims
  const uniqueSources: WebEvidenceSource[] = [];
  const seenUrls = new Set<string>();
  for (const claim of report.claims) {
    for (const src of claim.sources) {
      if (!seenUrls.has(src.url)) {
        seenUrls.add(src.url);
        uniqueSources.push(src);
      }
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatReportSummaryText(active));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Record Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-4 border-b border-[#1F2B42]">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-100">Verification Reports</h1>
          <p className="text-sm text-slate-400">
            Structured audit report generated strictly from live verification records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {records.length > 1 && (
            <select
              aria-label="Select verification report"
              value={active.id}
              onChange={(e) => {
                const found = records.find((r) => r.id === e.target.value);
                if (found) onSelectRecord(found);
              }}
              className="px-3.5 py-2 rounded-lg bg-[#111827] border border-[#24324D] text-xs text-slate-200 focus:outline-none focus:border-indigo-500 max-w-xs"
            >
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.title || r.originalAnswer.slice(0, 40)}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#283552] bg-[#162033] hover:bg-[#1C2942] text-xs font-medium text-slate-200 cursor-pointer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>{copied ? 'Copied Summary' : 'Copy Report Summary'}</span>
          </button>

          <button
            type="button"
            onClick={() => downloadReportPdf(active)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Report Document Surface */}
      <article className="bg-[#111827] border border-[#1F2B42] rounded-xl p-6 sm:p-8 space-y-8">
        {/* 1-3. Title, ID, Date */}
        <header className="space-y-3 pb-6 border-b border-[#1F2B42]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 font-mono">
              <span className="text-indigo-300">{report.verificationId}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatDateTime(report.completedAt)}</span>
              <span aria-hidden="true">·</span>
              <span>{report.metadata.bifrostModel}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenClaimsView(active)}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              Open Interactive Claim Cards
            </button>
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-100">
            {report.reportTitle}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">{report.executiveSummary}</p>
        </header>

        {/* 4. Original Answer */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-100">Original Submitted Answer</h3>
          {report.context && (
            <p className="text-xs text-slate-400">
              <span className="font-medium text-slate-300">Context:</span> {report.context}
            </p>
          )}
          <div className="p-4 rounded-lg bg-[#0C1222] border border-[#1F2B42] text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {report.originalAnswer}
          </div>
        </section>

        {/* 5. Claim Extraction Summary */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">Claim Extraction Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-[#0C1222] border border-[#1F2B42]">
            <div>
              <div className="text-xs text-slate-400">Total Extracted</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                {s.totalClaims}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Verified / Current</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-emerald-400 mt-0.5">
                {s.verifiedCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Potentially Outdated</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-red-400 mt-0.5">
                {s.potentiallyOutdatedCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Conflicting / Unverifiable</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-amber-400 mt-0.5">
                {s.conflictingCount + s.unverifiableCount + s.insufficientEvidenceCount}
              </div>
            </div>
          </div>
        </section>

        {/* 6, 7, 9. Claim-by-Claim Findings, Evidence Summaries & Freshness Assessments */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Claim-by-Claim Findings & Freshness Assessments
          </h3>

          {report.claims.length === 0 ? (
            <p className="text-sm text-slate-400">
              No verifiable factual claims were extracted from the submitted answer.
            </p>
          ) : (
            <div className="divide-y divide-[#1F2B42] border border-[#1F2B42] rounded-lg bg-[#0C1222]">
              {report.claims.map((c) => (
                <div key={c.id} className="p-4 sm:p-5 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2">
                      <span className="font-mono text-slate-200">{c.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.isTimeSensitive ? 'Time-Sensitive' : 'Static'}</span>
                    </div>
                    <StatusIndicator status={c.status} />
                  </div>

                  <p className="text-sm font-medium text-slate-100">“{c.originalText}”</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{c.explanation}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-400 pt-1">
                    <span>
                      Freshness: {c.freshness.label}
                      {c.freshness.score !== null ? ` (${c.freshness.score}/100)` : ''}
                    </span>
                    <span>
                      Confidence: {c.confidence.level}
                      {c.confidence.score !== null ? ` (${c.confidence.score}/100)` : ''}
                    </span>
                    <span>Sources: {c.sources.length}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 10 & 11. Conflicting Evidence & Unverifiable Claims */}
        {(report.conflictingFindings.length > 0 || report.unverifiableFindings.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {report.conflictingFindings.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-amber-300">Conflicting Evidence</h3>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  {report.conflictingFindings.map((f) => (
                    <li key={f.claimId} className="p-3.5 rounded-lg bg-[#0C1222] border border-[#1F2B42] space-y-1">
                      <div className="font-mono text-amber-300">{f.claimId}</div>
                      <div className="font-medium text-slate-100">“{f.claimText}”</div>
                      <p className="text-slate-400">{f.explanation}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.unverifiableFindings.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-200">
                  Unverifiable / Insufficient Evidence Claims
                </h3>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  {report.unverifiableFindings.map((f) => (
                    <li key={f.claimId} className="p-3.5 rounded-lg bg-[#0C1222] border border-[#1F2B42] space-y-1">
                      <div className="font-mono text-slate-400">{f.claimId}</div>
                      <div className="font-medium text-slate-100">“{f.claimText}”</div>
                      <p className="text-slate-400">{f.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* 8. Cited Source References */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Source References ({uniqueSources.length})
          </h3>
          {uniqueSources.length === 0 ? (
            <p className="text-xs text-slate-400">
              No external web sources were cited for this report.
            </p>
          ) : (
            <div className="divide-y divide-[#1F2B42] border border-[#1F2B42] rounded-lg bg-[#0C1222]">
              {uniqueSources.map((src) => (
                <div
                  key={src.url}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200 hover:underline break-all"
                    >
                      <span>{src.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <div className="text-[11px] font-mono text-slate-500 truncate">{src.url}</div>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    Published: {formatShortDate(src.publishedDate)} · Retrieved:{' '}
                    {formatShortDate(src.retrievedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 12 & 13. Recommended Actions & Verification Limitations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-[#1F2B42]">
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-100">Recommended Actions</h3>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
              {report.recommendedActions.map((act, idx) => (
                <li key={idx}>• {act}</li>
              ))}
            </ul>
          </section>

          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-100">Verification Limitations</h3>
            <ul className="space-y-2 text-xs text-slate-400 leading-relaxed">
              {report.limitations.map((lim, idx) => (
                <li key={idx}>• {lim}</li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </div>
  );
}
