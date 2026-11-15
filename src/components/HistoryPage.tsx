import {
  FileText,
  History as HistoryIcon,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppPreferences, VerificationRecord } from '../../shared/types.ts';
import { formatDateTime } from './StatusIndicator.tsx';

interface HistoryPageProps {
  records: VerificationRecord[];
  loading: boolean;
  error: string | null;
  preferences: AppPreferences;
  onOpenVerification: (record: VerificationRecord) => void;
  onOpenReport: (record: VerificationRecord) => void;
  onDeleteRecord: (id: string) => Promise<void>;
  onStartNew: () => void;
}

type HistoryFilter = 'all' | 'outdated' | 'conflicting' | 'unverifiable';

export function HistoryPage({
  records,
  loading,
  error,
  preferences,
  onOpenVerification,
  onOpenReport,
  onDeleteRecord,
  onStartNew,
}: HistoryPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((rec) => {
      if (filter === 'outdated' && rec.summary.potentiallyOutdatedCount === 0) return false;
      if (filter === 'conflicting' && rec.summary.conflictingCount === 0) return false;
      if (
        filter === 'unverifiable' &&
        rec.summary.unverifiableCount + rec.summary.insufficientEvidenceCount === 0
      ) {
        return false;
      }

      if (!q) return true;
      return (
        rec.id.toLowerCase().includes(q) ||
        (rec.title || '').toLowerCase().includes(q) ||
        rec.originalAnswer.toLowerCase().includes(q) ||
        rec.report.claims.some((c) => c.originalText.toLowerCase().includes(q))
      );
    });
  }, [records, searchQuery, filter]);

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await onDeleteRecord(id);
      setConfirmDeleteId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete verification record.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-[#1F2B42]">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-100">Verification History</h1>
          <p className="text-sm text-slate-400">
            Stored on the application server in <span className="font-mono text-slate-300">data/verifications.json</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartNew}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          New Verification
        </button>
      </div>

      {(error || deleteError) && (
        <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {error || deleteError}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      {records.length > 0 && (
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, title, answer text, or claim..."
              aria-label="Search verification history"
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#111827] border border-[#1F2B42] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111827] border border-[#1F2B42] rounded-lg">
            {(
              [
                ['all', 'All Records'],
                ['outdated', 'Has Outdated'],
                ['conflicting', 'Has Conflicting'],
                ['unverifiable', 'Has Unverifiable'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filter === id
                    ? 'bg-[#1D2840] text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-[#111827] border border-[#1F2B42] rounded-xl divide-y divide-[#1F2B42]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 h-20 animate-pulse flex items-center justify-between">
              <div className="h-4 w-1/2 bg-slate-800 rounded" />
              <div className="h-4 w-28 bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-10 text-center space-y-3">
          <HistoryIcon className="h-7 w-7 text-slate-500 mx-auto" />
          <h2 className="text-base font-semibold text-slate-100">No verification history yet</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Completed verifications are saved here automatically so you can review findings,
            inspect cited sources, and export PDF reports.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onStartNew}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
            >
              Start a Verification
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#111827] border border-[#1F2B42] rounded-xl p-8 text-center space-y-2">
          <p className="text-sm text-slate-300">No verification records match your search or filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilter('all');
            }}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            Clear search & filter
          </button>
        </div>
      ) : (
        <div className="bg-[#111827] border border-[#1F2B42] rounded-xl divide-y divide-[#1F2B42]">
          {filtered.map((rec) => {
            const isConfirming = confirmDeleteId === rec.id;
            const isDeleting = deletingId === rec.id;
            return (
              <div
                key={rec.id}
                className={`${preferences.compactTableRows ? 'p-3.5' : 'p-5'} space-y-3 hover:bg-[#162033]/40 transition-colors`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
                      <span className="font-mono text-indigo-300">{rec.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatDateTime(rec.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{rec.report.metadata.bifrostModel}</span>
                    </div>
                    <h3 className="text-base font-medium text-slate-100 truncate">
                      {rec.title || rec.originalAnswer.slice(0, 110)}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-400">
                      <span>{rec.summary.totalClaims} claims</span>
                      <span className="text-emerald-400">{rec.summary.verifiedCount} current</span>
                      <span className="text-red-400">
                        {rec.summary.potentiallyOutdatedCount} outdated
                      </span>
                      <span className="text-amber-400">
                        {rec.summary.conflictingCount} conflicting
                      </span>
                      <span>
                        {rec.summary.unverifiableCount + rec.summary.insufficientEvidenceCount}{' '}
                        unverifiable
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenVerification(rec)}
                      className="px-3.5 py-2 rounded-lg bg-[#162033] hover:bg-[#1E2B45] border border-[#283552] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                    >
                      Open Claims
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenReport(rec)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-xs font-medium text-indigo-200 transition-colors cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Report</span>
                    </button>
                    {!isConfirming && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(rec.id)}
                        aria-label={`Delete ${rec.id}`}
                        className="p-2 rounded-lg border border-[#24324D] text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isConfirming && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <span className="text-xs text-red-200">
                      Permanently delete verification record <span className="font-mono">{rec.id}</span>?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-md border border-[#283552] text-xs text-slate-300 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleConfirmDelete(rec.id)}
                        className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-xs font-medium text-white disabled:opacity-50 cursor-pointer"
                      >
                        {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
