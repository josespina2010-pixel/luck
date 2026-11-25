import { useState } from 'react';
import { CheckCircle2, Copy, Play, XCircle } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type {
  ConcurrencyTestReport,
  MandatoryTestReport,
  UserRole,
} from '../types/logistics.ts';
import { formatDateTime } from './StatusText.tsx';

export function VerificationView({
  role,
  onRefreshAll,
  onDecision,
}: {
  role: UserRole;
  onRefreshAll: () => void;
  onDecision: (res: {
    accepted: boolean;
    code: string;
    rule: string;
    message: string;
    statusCode?: number;
  }) => void;
}) {
  const isAdmin = role === 'admin';
  const [seqLoading, setSeqLoading] = useState(false);
  const [seqReport, setSeqReport] = useState<MandatoryTestReport | null>(null);
  const [concLoading, setConcLoading] = useState(false);
  const [concReport, setConcReport] = useState<ConcurrencyTestReport | null>(null);
  const [copied, setCopied] = useState(false);

  const runMandatoryTest = async () => {
    setSeqLoading(true);
    try {
      const res = await apiRequest<MandatoryTestReport>(
        '/api/tests/mandatory-sequence',
        { method: 'POST' }
      );
      onDecision(res);
      if (res.accepted && res.data) {
        setSeqReport(res.data);
        onRefreshAll();
      }
    } finally {
      setSeqLoading(false);
    }
  };

  const runConcurrencyTest = async () => {
    setConcLoading(true);
    try {
      const res = await apiRequest<ConcurrencyTestReport>(
        '/api/tests/concurrency-quota',
        { method: 'POST' }
      );
      onDecision(res);
      if (res.accepted && res.data) {
        setConcReport(res.data);
        onRefreshAll();
      }
    } finally {
      setConcLoading(false);
    }
  };

  const copyMandatoryReport = async () => {
    if (!seqReport) return;
    const lines = [
      `INFORME DE PRUEBA INDIVIDUAL OBLIGATORIA — ${seqReport.trackingCode}`,
      `Ejecutada: ${formatDateTime(seqReport.executedAt)}`,
      '',
      ...seqReport.steps.map(
        (s) =>
          `${s.step}: ${s.action}\n  Entradas: ${JSON.stringify(s.input)}\n  Esperado: ${s.expected}\n  Resultado: ${s.accepted ? 'ACEPTADA' : 'RECHAZADA'} (HTTP ${s.httpStatus} · ${s.code})\n  Detalle: ${s.actualMessage}`
      ),
    ].join('\n');
    await navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Verificación de reglas y pruebas obligatorias
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Ejecute y documente en vivo la secuencia obligatoria de estados y el control transaccional de concurrencia en PostgreSQL.
        </p>
      </div>

      {/* Test 1: Mandatory Individual Sequence */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base font-semibold text-slate-900">
              1. Prueba individual obligatoria: entregar sin tránsito, rechazar y completar secuencia válida
            </h2>
            <p className="text-sm text-slate-600">
              Crea una encomienda real en estado <span className="font-mono text-slate-800">recibida</span>, intenta registrar <span className="font-mono text-slate-800">entregada</span> directamente (debe rechazarse), luego registra <span className="font-mono text-slate-800">en_transito</span>, completa con <span className="font-mono text-slate-800">entregada</span> y verifica el bloqueo posterior a la entrega.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {seqReport && (
              <button
                type="button"
                onClick={copyMandatoryReport}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{copied ? 'Copiado' : 'Copiar informe'}</span>
              </button>
            )}
            <button
              type="button"
              disabled={!isAdmin || seqLoading}
              onClick={runMandatoryTest}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>
                {seqLoading
                  ? 'Ejecutando...'
                  : 'Ejecutar prueba obligatoria'}
              </span>
            </button>
          </div>
        </div>

        {!isAdmin && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            El perfil de consulta no tiene permisos para ejecutar mutaciones de prueba en la base de datos.
          </p>
        )}

        {seqReport && (
          <div className="space-y-3">
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              Encomienda generada: <strong className="text-slate-900">{seqReport.trackingCode}</strong> · Ejecución: {formatDateTime(seqReport.executedAt)}
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Paso</th>
                    <th className="py-2.5 px-4">Acción y entradas</th>
                    <th className="py-2.5 px-4">Esperado</th>
                    <th className="py-2.5 px-4">Resultado real</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {seqReport.steps.map((s) => (
                    <tr key={s.step}>
                      <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap align-top">
                        {s.step}
                      </td>
                      <td className="py-3 px-4 align-top space-y-1.5">
                        <div className="font-medium text-slate-800">{s.action}</div>
                        <pre className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">
                          {JSON.stringify(s.input, null, 2)}
                        </pre>
                      </td>
                      <td className="py-3 px-4 text-slate-700 align-top whitespace-nowrap">
                        {s.expected}
                      </td>
                      <td className="py-3 px-4 align-top space-y-1">
                        <div className="inline-flex items-center gap-1.5 font-medium">
                          {s.accepted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-700" />
                          )}
                          <span
                            className={
                              s.accepted ? 'text-emerald-700' : 'text-red-700'
                            }
                          >
                            {s.accepted ? 'ACEPTADA' : 'RECHAZADA'} · HTTP {s.httpStatus}
                          </span>
                        </div>
                        <div className="text-slate-700 leading-relaxed">
                          {s.actualMessage}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Test 2: Concurrency Quota Control */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base font-semibold text-slate-900">
              2. Demostración de concurrencia por cupo de sucursal
            </h2>
            <p className="text-sm text-slate-600">
              Dispara dos transacciones <span className="font-mono text-slate-800">Promise.all</span> simultáneas sobre 1 único cupo disponible. PostgreSQL bloquea la fila de cuota con <span className="font-mono text-slate-800">SELECT ... FOR UPDATE</span> para garantizar que exactamente una solicitud consuma el cupo y la segunda sea rechazada.
            </p>
          </div>
          <button
            type="button"
            disabled={!isAdmin || concLoading}
            onClick={runConcurrencyTest}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            <span>
              {concLoading
                ? 'Ejecutando carrera...'
                : 'Ejecutar 2 solicitudes simultáneas'}
            </span>
          </button>
        </div>

        {concReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-slate-500">Sucursal y fecha aislada</div>
                <div className="font-medium text-slate-900 mt-1 font-mono">
                  {concReport.branch} ({concReport.quotaDate})
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-slate-500">Cupo usado final / Máximo</div>
                <div className="font-semibold text-slate-900 mt-1 font-mono tabular-nums">
                  {concReport.finalUsedCount} / {concReport.maxCapacity}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-slate-500">Aceptadas</div>
                <div className="font-semibold text-emerald-700 mt-1 font-mono tabular-nums">
                  {concReport.acceptedCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-slate-500">Rechazadas por cupo</div>
                <div className="font-semibold text-red-700 mt-1 font-mono tabular-nums">
                  {concReport.rejectedCount}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-600">
                    <th className="py-2.5 px-4">Solicitud concurrente</th>
                    <th className="py-2.5 px-4">Seguimiento</th>
                    <th className="py-2.5 px-4 text-right">Duración</th>
                    <th className="py-2.5 px-4">Decisión HTTP</th>
                    <th className="py-2.5 px-4">Mensaje del servidor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {concReport.results.map((r) => (
                    <tr key={r.trackingCode}>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {r.request}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                        {r.trackingCode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {r.durationMs} ms
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            r.accepted ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {r.accepted ? 'ACEPTADA' : 'RECHAZADA'} (HTTP {r.httpStatus})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Deployment & Stack Reference */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Compatibilidad PostgreSQL, GitHub y Render
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          La aplicación ejecuta sobre PostgreSQL transaccional con Drizzle ORM y autenticación verificada en el servidor. El repositorio incluye <span className="font-mono text-slate-800">supabase/schema.sql</span> con el esquema SQL estándar para PostgreSQL/Supabase y <span className="font-mono text-slate-800">render.yaml</span> para publicación continua desde GitHub en Render.
        </p>
      </div>
    </div>
  );
}
