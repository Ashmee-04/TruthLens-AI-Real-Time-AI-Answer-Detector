import {
  AlertCircle,
  ArrowRight,
  Cpu,
  Globe,
  Scale,
  ScanSearch,
  Settings as SettingsIcon,
} from 'lucide-react';
import type {
  DashboardMetrics,
  HealthResponse,
  VerificationRecord,
} from '../../shared/types.ts';
import { formatDateTime } from './StatusIndicator.tsx';

interface OverviewPageProps {
  metrics: DashboardMetrics;
  recentRecords: VerificationRecord[];
  loading: boolean;
  error: string | null;
  health: HealthResponse | null;
  onNewVerification: () => void;
  onOpenRecord: (record: VerificationRecord) => void;
  onOpenSettings: () => void;
}

export function OverviewPage({
  metrics,
  recentRecords,
  loading,
  error,
  health,
  onNewVerification,
  onOpenRecord,
  onOpenSettings,
}: OverviewPageProps) {
  const bifrostMissing = health && !health.integrations.bifrost.configured;
  const tavilyMissing = health && !health.integrations.tavily.configured;
  const needsSetup = bifrostMissing || tavilyMissing;

  return (
    <div className="space-y-8">
      {/* Welcome & Primary CTA */}
      <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 pb-6 border-b border-[#1F2B42]">
        <div className="space-y-2 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-100 text-balance">
            Know whether an AI answer is still true.
          </h1>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            TruthLens AI extracts discrete factual claims from AI-generated responses, identifies
            time-sensitive assertions, verifies them against live web sources via Tavily, and
            evaluates freshness through Bifrost.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewVerification}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ScanSearch className="h-4 w-4" aria-hidden="true" />
          <span>New Verification</span>
        </button>
      </section>

      {/* Honest Server Configuration Notice if credentials missing */}
      {needsSetup && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-200">
                Server API credentials require configuration
              </p>
              <p className="text-xs text-amber-300/90 leading-relaxed">
                {bifrostMissing && 'Bifrost gateway variables (BIFROST_BASE_URL, BIFROST_API_KEY, BIFROST_MODEL) are unset. '}
                {tavilyMissing && 'Tavily Search variable (TAVILY_API_KEY) is unset. '}
                Live verification requires both server-side environment variables.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            <span>Inspect Settings</span>
          </button>
        </div>
      )}

      {/* Backend error banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Real Computed Metrics Strip */}
      <section aria-label="Verification metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard
          label="Total Verifications"
          value={metrics.totalVerifications}
          caption="Completed verification runs stored"
          loading={loading}
        />
        <DashboardStatCard
          label="Claims Processed"
          value={metrics.totalClaimsProcessed}
          caption="Factual assertions extracted across runs"
          loading={loading}
        />
        <DashboardStatCard
          label="Potentially Outdated"
          value={metrics.potentiallyOutdatedClaims}
          caption="Claims contradicted by newer evidence"
          accent="text-red-400"
          loading={loading}
        />
        <DashboardStatCard
          label="Unverifiable Claims"
          value={metrics.unverifiableClaims}
          caption="Claims lacking sufficient live evidence"
          accent="text-slate-300"
          loading={loading}
        />
      </section>

      {/* Recent Verification Activity */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Recent Verification Activity</h2>
          {recentRecords.length > 0 && (
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Showing latest {Math.min(recentRecords.length, 5)} of {metrics.totalVerifications}
            </span>
          )}
        </div>

        {loading ? (
          <div className="bg-[#111827] border border-[#1F2B42] rounded-xl divide-y divide-[#1F2B42]">
            {[1, 2, 3].map((row) => (
              <div key={row} className="p-4 h-16 animate-pulse flex items-center justify-between">
                <div className="h-4 w-1/3 bg-slate-800 rounded" />
                <div className="h-4 w-24 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : recentRecords.length === 0 ? (
          <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-8 sm:p-10 text-center space-y-3">
            <h3 className="text-base font-semibold text-slate-100">No verifications recorded yet</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              Submit an AI-generated answer to inspect claim extraction, live Tavily web evidence,
              and freshness scoring. Metrics above reflect only real stored verification runs.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onNewVerification}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <span>Run First Verification</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#111827] border border-[#1F2B42] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1F2B42] text-xs font-medium text-slate-400">
                    <th className="py-3 px-4">Verification</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Claims</th>
                    <th className="py-3 px-4 text-right">Outdated</th>
                    <th className="py-3 px-4 text-right">Conflicting</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2B42] text-sm">
                  {recentRecords.slice(0, 5).map((rec) => (
                    <tr
                      key={rec.id}
                      className="hover:bg-[#162033]/60 transition-colors"
                    >
                      <td className="py-3.5 px-4 max-w-md">
                        <div className="font-medium text-slate-100 truncate">
                          {rec.title || rec.originalAnswer.slice(0, 80)}
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">{rec.id}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {formatDateTime(rec.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                        {rec.summary.totalClaims}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-red-400">
                        {rec.summary.potentiallyOutdatedCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-400">
                        {rec.summary.conflictingCount}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenRecord(rec)}
                          className="text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* How TruthLens AI Works */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">How TruthLens AI Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <WorkflowStepCard
            step="01. Claim Extraction"
            Icon={Cpu}
            description="Bifrost AI isolates verifiable factual assertions verbatim while filtering out opinions, questions, and generic advice."
          />
          <WorkflowStepCard
            step="02. Time-Sensitivity Triage"
            Icon={Scale}
            description="Classifies claims by volatility tier (API versions, pricing, leadership, policies) vs. static historical facts."
          />
          <WorkflowStepCard
            step="03. Live Web Retrieval"
            Icon={Globe}
            description="Tavily executes targeted web searches for each time-sensitive claim, preserving source URLs, snippets, and publication dates."
          />
          <WorkflowStepCard
            step="04. Evidence & Freshness"
            Icon={ScanSearch}
            description="Evaluates source agreement and recency via Bifrost, reporting freshness and evidence confidence separately with full citations."
          />
        </div>
      </section>
    </div>
  );
}

function DashboardStatCard({
  label,
  value,
  caption,
  accent = 'text-slate-100',
  loading,
}: {
  label: string;
  value: number;
  caption: string;
  accent?: string;
  loading: boolean;
}) {
  return (
    <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 space-y-2">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      {loading ? (
        <div className="h-8 w-16 bg-slate-800 rounded animate-pulse" />
      ) : (
        <div className={`text-3xl font-semibold font-mono tabular-nums ${accent}`}>{value}</div>
      )}
      <div className="text-xs text-slate-500">{caption}</div>
    </div>
  );
}

function WorkflowStepCard({
  step,
  Icon,
  description,
}: {
  step: string;
  Icon: typeof Cpu;
  description: string;
}) {
  return (
    <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 space-y-2.5">
      <div className="flex items-center gap-2 text-indigo-300">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-100">{step}</h3>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
