import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import type { AppPreferences, HealthResponse, IntegrationStatus } from '../../shared/types.ts';
import { formatDateTime } from './StatusIndicator.tsx';

interface SettingsPageProps {
  health: HealthResponse | null;
  healthError: string | null;
  onTestConnections: () => Promise<void>;
  preferences: AppPreferences;
  onUpdatePreferences: (next: AppPreferences) => void;
}

export function SettingsPage({
  health,
  healthError,
  onTestConnections,
  preferences,
  onUpdatePreferences,
}: SettingsPageProps) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      await onTestConnections();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-[#1F2B42]">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-100">Settings & Connections</h1>
          <p className="text-sm text-slate-400">
            Inspect server-side Bifrost and Tavily integration health, UI preferences, and data
            handling policies.
          </p>
        </div>

        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span>{testing ? 'Testing Connections...' : 'Test API Connections'}</span>
        </button>
      </div>

      {healthError && (
        <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {healthError}
        </div>
      )}

      {/* Integration Status Cards */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-100">Server-Side API Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IntegrationCard
            name="Bifrost by Maxim AI"
            role="Model Gateway (Claim Extraction & Evidence Evaluation)"
            status={health?.integrations.bifrost || null}
            envVars={['BIFROST_BASE_URL', 'BIFROST_API_KEY', 'BIFROST_MODEL']}
          />
          <IntegrationCard
            name="Tavily Search API"
            role="Live Web Evidence Retrieval"
            status={health?.integrations.tavily || null}
            envVars={['TAVILY_API_KEY']}
          />
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Credentials are read exclusively from server-side environment variables and are never sent
          to or stored in the browser. A green Connected status appears only after a live connection
          test succeeds.
        </p>
      </section>

      {/* Application Preferences */}
      <section className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-100">Application Preferences</h2>

        <div className="divide-y divide-[#1F2B42]">
          <PreferenceToggle
            id="pref-expand"
            label="Expand all claim cards by default"
            description="Automatically expand every verified, static, and unverifiable claim card on the results screen."
            checked={preferences.expandAllClaimsByDefault}
            onChange={(val) =>
              onUpdatePreferences({ ...preferences, expandAllClaimsByDefault: val })
            }
          />
          <PreferenceToggle
            id="pref-methodology"
            label="Show freshness scoring methodology notes"
            description="Display the additive rubric explanation inside each claim's freshness assessment."
            checked={preferences.showMethodologyNotes}
            onChange={(val) =>
              onUpdatePreferences({ ...preferences, showMethodologyNotes: val })
            }
          />
          <PreferenceToggle
            id="pref-compact"
            label="Compact history row spacing"
            description="Reduce vertical row padding in Verification History for higher density."
            checked={preferences.compactTableRows}
            onChange={(val) =>
              onUpdatePreferences({ ...preferences, compactTableRows: val })
            }
          />
        </div>
      </section>

      {/* Security & Data Handling */}
      <section className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100">
          <ShieldCheck className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          <h2 className="text-base font-semibold">Security & Data Handling</h2>
        </div>

        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            <span className="font-semibold text-slate-100">Data Sent to Bifrost:</span> Your
            submitted answer text, optional context, and retrieved Tavily web snippets are sent to
            your configured Bifrost gateway endpoint for claim extraction and evidence evaluation.
          </p>
          <p>
            <span className="font-semibold text-slate-100">Data Sent to Tavily:</span> Only focused
            search queries derived from time-sensitive claims are sent to Tavily Search API. Your
            full submitted answer is not sent to Tavily.
          </p>
          <p>
            <span className="font-semibold text-slate-100">Prompt-Injection Defenses:</span>{' '}
            User-submitted text and retrieved webpage snippets are sanitized and isolated inside
            explicit untrusted-data boundaries before model evaluation. Only validated HTTP/HTTPS
            URLs are rendered.
          </p>
          <p>
            <span className="font-semibold text-slate-100">Storage Disclosure:</span> Verification
            records are stored locally on the application server in{' '}
            <span className="font-mono text-slate-200">
              {health?.persistence.pathLabel || 'data/verifications.json'}
            </span>{' '}
            as unencrypted JSON so you can revisit and delete records. Do not submit sensitive
            regulated secrets or confidential PII unless your deployment environment provides disk
            encryption and access controls.
          </p>
        </div>
      </section>
    </div>
  );
}

function IntegrationCard({
  name,
  role,
  status,
  envVars,
}: {
  name: string;
  role: string;
  status: IntegrationStatus | null;
  envVars: string[];
}) {
  const state = status?.status || 'untested';

  const statusDisplay = (() => {
    if (!status) {
      return {
        label: 'Checking...',
        color: 'text-slate-400',
        Icon: AlertCircle,
      };
    }
    switch (state) {
      case 'connected':
        return { label: 'Connected', color: 'text-emerald-400', Icon: CheckCircle2 };
      case 'disconnected':
        return { label: 'Disconnected', color: 'text-red-400', Icon: XCircle };
      case 'unconfigured':
        return { label: 'Not Configured', color: 'text-amber-400', Icon: AlertCircle };
      case 'untested':
      default:
        return { label: 'Configured (Not Tested)', color: 'text-indigo-300', Icon: AlertCircle };
    }
  })();

  const { Icon } = statusDisplay;

  return (
    <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{name}</h3>
          <p className="text-xs text-slate-400">{role}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${statusDisplay.color}`}>
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span>{statusDisplay.label}</span>
        </span>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-[#1F2B42] text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Endpoint</span>
          <span className="font-mono text-slate-200 truncate">
            {status?.endpointHost || 'Unset'}
          </span>
        </div>
        {status?.model !== undefined && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Configured Model</span>
            <span className="font-mono text-slate-200 truncate">{status.model || 'Unset'}</span>
          </div>
        )}
        {status?.latencyMs !== null && status?.latencyMs !== undefined && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Test Latency</span>
            <span className="font-mono tabular-nums text-slate-200">{status.latencyMs} ms</span>
          </div>
        )}
        {status?.checkedAt && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Last Checked</span>
            <span className="font-mono tabular-nums text-slate-400">
              {formatDateTime(status.checkedAt)}
            </span>
          </div>
        )}
      </div>

      {status?.error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-300 leading-relaxed break-words">
          {status.error}
        </div>
      )}

      <div className="text-[11px] font-mono text-slate-500">
        Server env: {envVars.join(', ')}
      </div>
    </div>
  );
}

function PreferenceToggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start justify-between gap-4 py-3.5 cursor-pointer"
    >
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <div className="text-xs text-slate-400">{description}</div>
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-[#283552] bg-[#090E1A] text-indigo-600 focus:ring-indigo-500 cursor-pointer"
      />
    </label>
  );
}
