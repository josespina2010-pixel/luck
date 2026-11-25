import { CheckCircle2, X, XCircle } from 'lucide-react';

export interface OperationDecision {
  id: string;
  timestamp: string;
  accepted: boolean;
  code: string;
  rule: string;
  message: string;
  statusCode?: number;
}

export function DecisionBanner({
  decision,
  onDismiss,
}: {
  decision: OperationDecision | null;
  onDismiss: () => void;
}) {
  if (!decision) return null;

  const accepted = decision.accepted;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border px-4 py-3 transition-colors ${
        accepted
          ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
          : 'border-red-200 bg-red-50/80 text-red-950'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {accepted ? (
            <CheckCircle2
              className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <XCircle
              className="w-5 h-5 text-red-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`font-semibold ${
                  accepted ? 'text-emerald-800' : 'text-red-800'
                }`}
              >
                {accepted ? 'Operación aceptada' : 'Operación rechazada'}
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-700 font-medium">{decision.rule}</span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-600">
                {decision.code}
                {decision.statusCode ? ` (HTTP ${decision.statusCode})` : ''}
              </span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {decision.message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar notificación"
          className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
