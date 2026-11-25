import { RefreshCw } from 'lucide-react';
import type { DashboardSummary, UserRole } from '../types/logistics.ts';
import { formatWeight } from './StatusText.tsx';

export function DashboardView({
  summary,
  loading,
  role,
  onRefresh,
  onNavigateParcels,
}: {
  summary: DashboardSummary | null;
  loading: boolean;
  role: UserRole;
  onRefresh: () => void;
  onNavigateParcels: (statusFilter?: 'recibida' | 'en_transito' | 'entregada') => void;
}) {
  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-lg border border-slate-200 bg-white animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-lg border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center space-y-3">
        <p className="text-sm text-slate-600">
          No se pudieron cargar las métricas del panel de control.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const total = summary.totalParcels;
  const pct = (count: number) =>
    total > 0 ? `${Math.round((count / total) * 100)}%` : '0%';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Panel de control operativo
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Distribución actualizada de encomiendas por estado, entregas completadas y pendientes en red.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Actualizar métricas</span>
        </button>
      </div>

      {/* Primary KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            Total de encomiendas
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {summary.totalParcels}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            {summary.activeBranches} sucursales activas ·{' '}
            {formatWeight(summary.totalWeightKg)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigateParcels('entregada')}
          className="text-left rounded-lg border border-slate-200 bg-white p-5 hover:border-emerald-300 transition-colors"
        >
          <div className="text-xs font-medium text-emerald-700">
            Entregadas
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {summary.deliveredParcels}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            {pct(summary.deliveredParcels)} del total · Ciclo cerrado
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateParcels('en_transito')}
          className="text-left rounded-lg border border-slate-200 bg-white p-5 hover:border-amber-300 transition-colors"
        >
          <div className="text-xs font-medium text-amber-700">
            Pendientes (Recibida + En tránsito)
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {summary.pendingParcels}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            {pct(summary.pendingParcels)} del total · En curso operativo
          </div>
        </button>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            Desglose por estado
          </div>
          <div className="mt-2.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-sky-700 font-medium">Recibida</span>
              <span className="font-mono tabular-nums text-slate-900 font-semibold">
                {summary.byStatus.recibida}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-700 font-medium">En tránsito</span>
              <span className="font-mono tabular-nums text-slate-900 font-semibold">
                {summary.byStatus.en_transito}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-700 font-medium">Entregada</span>
              <span className="font-mono tabular-nums text-slate-900 font-semibold">
                {summary.byStatus.entregada}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* State distribution progress bars */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Encomiendas por estado operativo
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            Base: {summary.totalParcels} registros
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
          {[
            {
              key: 'recibida' as const,
              label: 'Recibida (en origen)',
              count: summary.byStatus.recibida,
              barClass: 'bg-sky-600',
              textClass: 'text-sky-700',
            },
            {
              key: 'en_transito' as const,
              label: 'En tránsito (en ruta)',
              count: summary.byStatus.en_transito,
              barClass: 'bg-amber-500',
              textClass: 'text-amber-700',
            },
            {
              key: 'entregada' as const,
              label: 'Entregada (completada)',
              count: summary.byStatus.entregada,
              barClass: 'bg-emerald-600',
              textClass: 'text-emerald-700',
            },
          ].map((item) => {
            const ratio = total > 0 ? (item.count / total) * 100 : 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigateParcels(item.key)}
                className="text-left group space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-md p-1 -m-1"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-medium ${item.textClass} group-hover:underline`}>
                    {item.label}
                  </span>
                  <span className="font-mono tabular-nums text-slate-900 font-semibold">
                    {item.count} ({Math.round(ratio)}%)
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-sm bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${item.barClass} transition-all duration-300`}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Branch activity & daily dispatch quota */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            Actividad por sucursal
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            Fecha operativa: {summary.todayDate}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                <th className="py-3 px-6">Código</th>
                <th className="py-3 px-4">Ciudad</th>
                <th className="py-3 px-4">Sucursal</th>
                <th className="py-3 px-4 text-right">Origen</th>
                <th className="py-3 px-4 text-right">Destino</th>
                {role === 'admin' && (
                  <th className="py-3 px-6 text-right">Cupo diario hoy</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {summary.branchBreakdown.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-6 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                    {b.code}
                  </td>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                    {b.city}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    <span>{b.name}</span>
                    {!b.active && (
                      <span className="ml-2 text-xs text-slate-400">
                        (Inactiva)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                    {b.originParcels}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                    {b.destinationParcels}
                  </td>
                  {role === 'admin' && (
                    <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-700">
                      {b.todayUsedQuota} / {b.todayMaxQuota}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
