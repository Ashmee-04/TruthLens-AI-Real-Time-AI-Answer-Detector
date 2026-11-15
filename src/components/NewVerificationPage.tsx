import {
  AlertTriangle,
  CheckCircle2,
  Eraser,
  Loader2,
  ScanSearch,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useState } from 'react';
import type {
  AppPreferences,
  VerificationProgressEvent,
  VerificationRecord,
  VerificationStage,
} from '../../shared/types.ts';
import { ApiClientError, runVerificationStream } from '../utils/api.ts';
import { VerificationResultsView } from './VerificationResultsView.tsx';

interface NewVerificationPageProps {
  maxInputChars: number;
  preferences: AppPreferences;
  activeResult: VerificationRecord | null;
  onVerificationComplete: (record: VerificationRecord) => void;
  onClearActiveResult: () => void;
  onOpenReport: (record: VerificationRecord) => void;
  onOpenSettings: () => void;
}

const PIPELINE_STEPS: { id: VerificationStage; label: string }[] = [
  { id: 'validating', label: 'Validating input' },
  { id: 'extracting_claims', label: 'Extracting factual claims' },
  { id: 'classifying_time_sensitivity', label: 'Identifying time-sensitive claims' },
  { id: 'searching_web', label: 'Searching current web sources' },
  { id: 'evaluating_evidence', label: 'Evaluating evidence' },
  { id: 'generating_report', label: 'Generating verification report' },
];

export function NewVerificationPage({
  maxInputChars,
  preferences,
  activeResult,
  onVerificationComplete,
  onClearActiveResult,
  onOpenReport,
  onOpenSettings,
}: NewVerificationPageProps) {
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [answer, setAnswer] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{
    message: string;
    code?: string;
    provider?: string;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState<VerificationStage | null>(null);
  const [stageLogs, setStageLogs] = useState<VerificationProgressEvent[]>([]);

  const trimmedLength = answer.trim().length;
  const charCount = answer.length;
  const overLimit = charCount > maxInputChars;

  const handleClear = () => {
    if (isRunning) return;
    setTitle('');
    setContext('');
    setAnswer('');
    setValidationError(null);
    setApiError(null);
    setCurrentStage(null);
    setStageLogs([]);
    onClearActiveResult();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning) return;

    setValidationError(null);
    setApiError(null);

    if (trimmedLength === 0) {
      setValidationError('Please paste an AI-generated answer to verify. Empty submissions cannot be processed.');
      return;
    }
    if (trimmedLength < 15) {
      setValidationError('Submitted answer must be at least 15 characters to contain verifiable factual claims.');
      return;
    }
    if (overLimit) {
      setValidationError(`Submitted answer exceeds the maximum limit of ${maxInputChars.toLocaleString()} characters.`);
      return;
    }

    setIsRunning(true);
    setCurrentStage('validating');
    setStageLogs([]);
    onClearActiveResult();

    try {
      const record = await runVerificationStream(
        {
          answer: answer.trim(),
          title: title.trim() || undefined,
          context: context.trim() || undefined,
        },
        (evt) => {
          setCurrentStage(evt.stage);
          setStageLogs((prev) => [...prev.slice(-14), evt]);
        }
      );
      onVerificationComplete(record);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setApiError({
          message: err.message,
          code: err.code,
          provider: err.provider,
        });
      } else {
        setApiError({
          message: err instanceof Error ? err.message : 'Verification failed unexpectedly.',
        });
      }
      setCurrentStage('error');
    } finally {
      setIsRunning(false);
    }
  };

  if (activeResult && !isRunning) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#1F2B42]">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Verification Results</h1>
            <p className="text-sm text-slate-400">
              Evidence-based freshness assessment backed by live Tavily sources and Bifrost analysis.
            </p>
          </div>
        </div>
        <VerificationResultsView
          record={activeResult}
          preferences={preferences}
          onOpenReport={onOpenReport}
          onStartNew={onClearActiveResult}
        />
      </div>
    );
  }

  const activeStepIdx = currentStage
    ? PIPELINE_STEPS.findIndex((s) => s.id === currentStage)
    : -1;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-slate-100">New Verification</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Paste an AI-generated response below. TruthLens AI will extract factual claims verbatim,
          check time-sensitive statements against current web evidence, and produce a cited
          freshness report.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 sm:p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="verify-title" className="block text-xs font-medium text-slate-300">
              Title (Optional)
            </label>
            <input
              id="verify-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={isRunning}
              placeholder="e.g., Stripe API pricing summary"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#090E1A] border border-[#24324D] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="verify-context" className="block text-xs font-medium text-slate-300">
              Context (Optional)
            </label>
            <input
              id="verify-context"
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              maxLength={1000}
              disabled={isRunning}
              placeholder="e.g., Generated by assistant for Q3 documentation"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#090E1A] border border-[#24324D] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="verify-answer" className="block text-xs font-medium text-slate-300">
              AI-Generated Answer to Verify
            </label>
            <span
              className={`text-xs font-mono tabular-nums ${
                overLimit ? 'text-red-400 font-medium' : 'text-slate-400'
              }`}
            >
              {charCount.toLocaleString()} / {maxInputChars.toLocaleString()} chars
            </span>
          </div>
          <textarea
            id="verify-answer"
            rows={10}
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              if (validationError) setValidationError(null);
            }}
            disabled={isRunning}
            placeholder="Paste an AI-generated answer containing factual claims (e.g., software API versions, product pricing, company leadership, regulations, or statistics) to verify whether it is still true..."
            className="w-full px-4 py-3 rounded-lg bg-[#090E1A] border border-[#24324D] text-sm text-slate-100 placeholder:text-slate-500 leading-relaxed focus:outline-none focus:border-indigo-500 resize-y disabled:opacity-60"
          />
        </div>

        {validationError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300"
          >
            {validationError}
          </div>
        )}

        {apiError && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 space-y-2.5"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <div className="text-sm font-medium text-red-200">
                  Verification Failed{apiError.provider ? ` (${apiError.provider})` : ''}
                </div>
                <p className="text-xs text-red-300 leading-relaxed">{apiError.message}</p>
                {apiError.code && (
                  <p className="text-xs font-mono text-red-400/80">Error code: {apiError.code}</p>
                )}
              </div>
            </div>
            {(apiError.provider === 'bifrost' || apiError.provider === 'tavily') && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-200 cursor-pointer"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
                <span>Check API Connections in Settings</span>
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={handleClear}
            disabled={isRunning || (!answer && !title && !context)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#24324D] text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Eraser className="h-3.5 w-3.5" />
            <span>Clear Input</span>
          </button>

          <button
            type="submit"
            disabled={isRunning || overLimit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanSearch className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isRunning ? 'Verifying Answer...' : 'Verify Answer'}</span>
          </button>
        </div>
      </form>

      {/* Genuine Progress Panel synced to backend SSE stream */}
      {(isRunning || (stageLogs.length > 0 && currentStage === 'error')) && (
        <section
          aria-live="polite"
          className="bg-[#111827] border border-[#1F2B42] rounded-xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Verification Pipeline Progress</h2>
            {isRunning && (
              <span className="text-xs font-mono text-indigo-300">Live backend execution</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PIPELINE_STEPS.map((step, idx) => {
              const isDone =
                currentStage === 'completed' || (activeStepIdx > idx && currentStage !== 'error');
              const isActive = currentStage === step.id && isRunning;
              const isFailed = currentStage === 'error' && activeStepIdx === idx;

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs ${
                    isActive
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200'
                      : isDone
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                        : isFailed
                          ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : 'bg-[#0C1222] border-[#1F2B42] text-slate-500'
                  }`}
                >
                  {isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-indigo-400" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <span className="font-mono text-[11px] w-3.5 text-center shrink-0">
                      {idx + 1}
                    </span>
                  )}
                  <span className="font-medium truncate">{step.label}</span>
                </div>
              );
            })}
          </div>

          {stageLogs.length > 0 && (
            <div className="pt-3 border-t border-[#1F2B42] space-y-1.5">
              {stageLogs.slice(-5).map((log, i) => (
                <div key={i} className="text-xs text-slate-300 flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    [{log.stage}]
                  </span>
                  <span className="break-words">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
