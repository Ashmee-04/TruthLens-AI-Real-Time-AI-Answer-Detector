import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  MinusCircle,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { ClaimStatus } from '../../shared/types.ts';

export interface ClaimStatusMeta {
  label: string;
  textClass: string;
  surfaceClass: string;
  Icon: typeof CheckCircle2;
}

export function getClaimStatusMeta(status: ClaimStatus): ClaimStatusMeta {
  switch (status) {
    case 'VERIFIED':
      return {
        label: 'Verified / Current',
        textClass: 'text-emerald-400',
        surfaceClass: 'bg-emerald-500/10 border-emerald-500/25',
        Icon: CheckCircle2,
      };
    case 'POTENTIALLY_OUTDATED':
      return {
        label: 'Potentially Outdated',
        textClass: 'text-red-400',
        surfaceClass: 'bg-red-500/10 border-red-500/25',
        Icon: ShieldAlert,
      };
    case 'CONFLICTING_EVIDENCE':
      return {
        label: 'Conflicting Evidence',
        textClass: 'text-amber-400',
        surfaceClass: 'bg-amber-500/10 border-amber-500/25',
        Icon: AlertTriangle,
      };
    case 'UNVERIFIABLE':
      return {
        label: 'Unverifiable',
        textClass: 'text-slate-300',
        surfaceClass: 'bg-slate-500/10 border-slate-500/25',
        Icon: HelpCircle,
      };
    case 'INSUFFICIENT_EVIDENCE':
      return {
        label: 'Insufficient Evidence',
        textClass: 'text-slate-300',
        surfaceClass: 'bg-slate-500/10 border-slate-500/25',
        Icon: HelpCircle,
      };
    case 'NOT_TIME_SENSITIVE':
      return {
        label: 'Not Time-Sensitive',
        textClass: 'text-indigo-300',
        surfaceClass: 'bg-indigo-500/10 border-indigo-500/25',
        Icon: MinusCircle,
      };
    case 'VERIFICATION_FAILED':
      return {
        label: 'Verification Failed',
        textClass: 'text-rose-400',
        surfaceClass: 'bg-rose-500/10 border-rose-500/25',
        Icon: XCircle,
      };
    case 'NOT_CHECKED':
      return {
        label: 'Not Checked',
        textClass: 'text-slate-400',
        surfaceClass: 'bg-slate-500/10 border-slate-500/25',
        Icon: Clock,
      };
  }
}

export function StatusIndicator({ status }: { status: ClaimStatus }) {
  const meta = getClaimStatusMeta(status);
  const { Icon } = meta;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${meta.textClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not supplied';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return 'Not supplied';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
