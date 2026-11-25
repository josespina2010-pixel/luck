import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type {
  Branch,
  PaginatedParcels,
  Parcel,
  ParcelStatus,
  UserRole,
} from '../types/logistics.ts';
import {
  formatDateTime,
  formatWeight,
  STATUS_LABELS,
  StatusText,
} from './StatusText.tsx';

export interface ParcelFiltersState {
  search: string;
  branchId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function ParcelsView({
  parcelsData,
  branches,
  filters,
  loading,
  role,
  onFiltersChange,
  onResetFilters,
  onRefresh,
  onDecision,
}: {
  parcelsData: PaginatedParcels | null;
  branches: Branch[];
  filters: ParcelFiltersState;
  loading: boolean;
  role: UserRole;
  onFiltersChange: (next: Partial<ParcelFiltersState>) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  onDecision: (res: {
    accepted: boolean;
    code: string;
    rule: string;
    message: string;
    statusCode?: number;
  }) => void;
}) {
  const isAdmin = role === 'admin';
  const activeBranches = branches.filter((b) => b.active);

  const [formOpen, setFormOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Parcel form fields
  const [trackingCode, setTrackingCode] = useState('');
  const [originBranchId, setOriginBranchId] = useState('');
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Detail & events modal
  const [detailParcel, setDetailParcel] = useState<Parcel | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Event form fields
  const [eventStatus, setEventStatus] = useState<ParcelStatus>('en_transito');
  const [eventBranchId, setEventBranchId] = useState('');
  const [eventLocationText, setEventLocationText] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventSubmitting, setEventSubmitting] = useState(false);

  const openCreateModal = () => {
    setEditingParcel(null);
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setTrackingCode(`ENC-2026-${randomNum}`);
    setOriginBranchId(activeBranches[0] ? String(activeBranches[0].id) : '');
    setDestinationBranchId(
      activeBranches[1]
        ? String(activeBranches[1].id)
        : activeBranches[0]
          ? String(activeBranches[0].id)
          : ''
    );
    setRecipientName('');
    setWeightKg('2.5');
    setInternalNotes('');
    setFormOpen(true);
  };

  const openEditModal = (parcel: Parcel) => {
    setEditingParcel(parcel);
    setTrackingCode(parcel.trackingCode);
    setOriginBranchId(String(parcel.originBranchId));
    setDestinationBranchId(String(parcel.destinationBranchId));
    setRecipientName(parcel.recipientName);
    setWeightKg(String(parcel.weightKg));
    setInternalNotes(parcel.internalNotes ?? '');
    setFormOpen(true);
  };

  const handleSaveParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingParcel) {
        const res = await apiRequest(`/api/parcels/${editingParcel.id}`, {
          method: 'PATCH',
          body: {
            originBranchId: Number(originBranchId),
            destinationBranchId: Number(destinationBranchId),
            recipientName,
            weightKg: Number(weightKg),
            internalNotes,
          },
        });
        onDecision(res);
        if (res.accepted) {
          setFormOpen(false);
          onRefresh();
        }
      } else {
        const res = await apiRequest('/api/parcels', {
          method: 'POST',
          body: {
            trackingCode,
            originBranchId: Number(originBranchId),
            destinationBranchId: Number(destinationBranchId),
            recipientName,
            weightKg: Number(weightKg),
            internalNotes,
          },
        });
        onDecision(res);
        if (res.accepted) {
          setFormOpen(false);
          onRefresh();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteParcel = async (id: number) => {
    setSubmitting(true);
    try {
      const res = await apiRequest(`/api/parcels/${id}`, {
        method: 'DELETE',
      });
      onDecision(res);
      setConfirmDeleteId(null);
      if (res.accepted) {
        onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openDetailModal = async (parcelId: number) => {
    setDetailLoading(true);
    try {
      const viewQuery = isAdmin ? '' : '?viewAs=consulta';
      const res = await apiRequest<Parcel>(`/api/parcels/${parcelId}${viewQuery}`);
      if (res.accepted && res.data) {
        setDetailParcel(res.data);
        const nextSuggested: ParcelStatus =
          res.data.currentStatus === 'recibida' ? 'en_transito' : 'entregada';
        setEventStatus(nextSuggested);
        setEventBranchId(String(res.data.destinationBranchId));
        setEventLocationText('');
        setEventNotes('');
      } else {
        onDecision(res);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRecordEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailParcel) return;
    setEventSubmitting(true);
    try {
      const res = await apiRequest(`/api/parcels/${detailParcel.id}/events`, {
        method: 'POST',
        body: {
          status: eventStatus,
          locationBranchId: eventBranchId ? Number(eventBranchId) : null,
          locationText: eventLocationText,
          notes: eventNotes,
        },
      });
      onDecision(res);
      // Refresh detail and list regardless so user sees current DB state
      await openDetailModal(detailParcel.id);
      if (res.accepted) {
        onRefresh();
      }
    } finally {
      setEventSubmitting(false);
    }
  };

  const items = parcelsData?.items ?? [];
  const total = parcelsData?.total ?? 0;
  const page = parcelsData?.page ?? filters.page;
  const totalPages = parcelsData?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Encomiendas y trazabilidad
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isAdmin
              ? 'Gestione altas, modificaciones, bajas y la secuencia operativa recibida -> en tránsito -> entregada.'
              : 'Consulta autorizada de encomiendas y recorrido de estados mediante búsqueda y filtros combinados.'}
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nueva encomienda</span>
          </button>
        )}
      </div>

      {/* Search & Combined Filters */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Text Search */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Seguimiento o destinatario
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={filters.search}
                onChange={(e) =>
                  onFiltersChange({ search: e.target.value, page: 1 })
                }
                placeholder="Ej. ENC-2026 o Mateo..."
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          {/* Branch filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Sucursal (origen o destino)
            </label>
            <select
              value={filters.branchId}
              onChange={(e) =>
                onFiltersChange({ branchId: e.target.value, page: 1 })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.city}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Estado actual
            </label>
            <select
              value={filters.status}
              onChange={(e) =>
                onFiltersChange({ status: e.target.value, page: 1 })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value="">Todos los estados</option>
              <option value="recibida">Recibida</option>
              <option value="en_transito">En tránsito</option>
              <option value="entregada">Entregada</option>
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Período desde
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                onFiltersChange({ dateFrom: e.target.value, page: 1 })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Período hasta
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                onFiltersChange({ dateTo: e.target.value, page: 1 })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>
        </div>

        {/* Sort + Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Ordenar por
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  onFiltersChange({ sortBy: e.target.value, page: 1 })
                }
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="createdAt">Fecha de creación</option>
                <option value="updatedAt">Última actualización</option>
                <option value="weightKg">Peso (kg)</option>
                <option value="trackingCode">Código de seguimiento</option>
                <option value="currentStatus">Estado actual</option>
              </select>
              <select
                value={filters.sortOrder}
                onChange={(e) =>
                  onFiltersChange({
                    sortOrder: e.target.value === 'asc' ? 'asc' : 'desc',
                    page: 1,
                  })
                }
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </div>

            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Limpiar filtros</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 tabular-nums">
            {total} {total === 1 ? 'encomienda encontrada' : 'encomiendas encontradas'}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">
              No se encontraron encomiendas con los filtros aplicados.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onResetFilters}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Limpiar filtros
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
                >
                  Registrar encomienda
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                  <th className="py-3 px-5">Seguimiento</th>
                  <th className="py-3 px-4">Origen</th>
                  <th className="py-3 px-4">Destino</th>
                  <th className="py-3 px-4">Destinatario ficticio</th>
                  <th className="py-3 px-4 text-right">Peso</th>
                  <th className="py-3 px-4">Estado actual</th>
                  <th className="py-3 px-4">Actualización</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {items.map((parcel) => (
                  <tr
                    key={parcel.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-2.5 px-5 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {parcel.trackingCode}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                      {parcel.originBranch
                        ? `${parcel.originBranch.code} · ${parcel.originBranch.city}`
                        : `#${parcel.originBranchId}`}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                      {parcel.destinationBranch
                        ? `${parcel.destinationBranch.code} · ${parcel.destinationBranch.city}`
                        : `#${parcel.destinationBranchId}`}
                    </td>
                    <td className="py-2.5 px-4 text-slate-800 max-w-[200px] truncate">
                      {parcel.recipientName}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatWeight(parcel.weightKg)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusText status={parcel.currentStatus} />
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                      {formatDateTime(parcel.updatedAt)}
                    </td>
                    <td className="py-2.5 px-5 text-right whitespace-nowrap">
                      {confirmDeleteId === parcel.id && isAdmin ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-xs text-red-700 font-medium">
                            ¿Dar de baja?
                          </span>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleDeleteParcel(parcel.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDetailModal(parcel.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isAdmin ? 'Eventos / Detalle' : 'Ver recorrido'}</span>
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(parcel)}
                                title="Modificar encomienda"
                                className="p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(parcel.id)}
                                title="Dar de baja encomienda"
                                className="p-2 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Filas por página:</span>
            <select
              value={filters.pageSize}
              onChange={(e) =>
                onFiltersChange({ pageSize: Number(e.target.value), page: 1 })
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value={8}>8</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono tabular-nums">
              Página {page} de {totalPages}
            </span>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onFiltersChange({ page: page - 1 })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onFiltersChange({ page: page + 1 })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {formOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingParcel
                    ? `Modificar encomienda ${editingParcel.trackingCode}`
                    : 'Alta de encomienda'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  El sistema validará peso positivo, sucursales distintas y cupo diario en origen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveParcel} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Código de seguimiento único
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingParcel)}
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="ENC-2026-2001"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Peso (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="Ej. 4.50"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sucursal de origen
                  </label>
                  <select
                    required
                    value={originBranchId}
                    onChange={(e) => setOriginBranchId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <option value="">Seleccione origen</option>
                    {activeBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} · {b.city}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sucursal de destino
                  </label>
                  <select
                    required
                    value={destinationBranchId}
                    onChange={(e) => setDestinationBranchId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <option value="">Seleccione destino</option>
                    {activeBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} · {b.city}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Destinatario ficticio
                </label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Ej. Elena Gómez (Ficticio)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notas internas operativas (solo administrador)
                </label>
                <textarea
                  rows={2}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Instrucciones operativas internas..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Procesando...' : 'Guardar encomienda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail & Event Timeline Modal */}
      {(detailParcel || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 space-y-6 my-8">
            {detailLoading && !detailParcel ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Cargando recorrido de eventos...
              </div>
            ) : (
              detailParcel && (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-slate-900 font-mono tabular-nums">
                          {detailParcel.trackingCode}
                        </h2>
                        <StatusText status={detailParcel.currentStatus} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Destinatario: {detailParcel.recipientName} · Peso:{' '}
                        {formatWeight(detailParcel.weightKg)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailParcel(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="rounded-lg border border-slate-200 p-3.5">
                      <div className="text-xs text-slate-500">Origen</div>
                      <div className="font-medium text-slate-900 mt-0.5">
                        {detailParcel.originBranch
                          ? `${detailParcel.originBranch.code} · ${detailParcel.originBranch.city}`
                          : `#${detailParcel.originBranchId}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {detailParcel.originBranch?.name}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3.5">
                      <div className="text-xs text-slate-500">Destino</div>
                      <div className="font-medium text-slate-900 mt-0.5">
                        {detailParcel.destinationBranch
                          ? `${detailParcel.destinationBranch.code} · ${detailParcel.destinationBranch.city}`
                          : `#${detailParcel.destinationBranchId}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {detailParcel.destinationBranch?.name}
                      </div>
                    </div>
                  </div>

                  {isAdmin && detailParcel.internalNotes && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                      <span className="font-medium text-slate-900">
                        Notas internas (solo administrador):
                      </span>{' '}
                      {detailParcel.internalNotes}
                    </div>
                  )}

                  {/* Event History */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Recorrido cronológico de eventos
                    </h3>
                    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                      {(detailParcel.events ?? []).map((ev) => (
                        <div
                          key={ev.id}
                          className="px-4 py-3 flex flex-wrap items-start justify-between gap-3 text-sm"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <StatusText status={ev.status} />
                              <span className="text-slate-900 font-medium">
                                {ev.locationText}
                              </span>
                            </div>
                            {ev.notes && (
                              <p className="text-xs text-slate-600">{ev.notes}</p>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                            {formatDateTime(ev.eventDate)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Admin Event Registration Form */}
                  {isAdmin && (
                    <form
                      onSubmit={handleRecordEvent}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Registrar nuevo evento operativo
                        </h3>
                        <span className="text-xs text-slate-500">
                          Secuencia exigida: recibida → en_transito → entregada
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Estado del evento
                          </label>
                          <select
                            value={eventStatus}
                            onChange={(e) =>
                              setEventStatus(e.target.value as ParcelStatus)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                          >
                            <option value="recibida">
                              {STATUS_LABELS.recibida}
                            </option>
                            <option value="en_transito">
                              {STATUS_LABELS.en_transito}
                            </option>
                            <option value="entregada">
                              {STATUS_LABELS.entregada}
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Sucursal de ubicación
                          </label>
                          <select
                            value={eventBranchId}
                            onChange={(e) => setEventBranchId(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                          >
                            <option value="">Ubicación libre (ver campo texto)</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.code} · {b.city}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Detalle de ubicación (opcional si elige sucursal)
                          </label>
                          <input
                            type="text"
                            value={eventLocationText}
                            onChange={(e) => setEventLocationText(e.target.value)}
                            placeholder="Ej. Ruta 9 · Km 180"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Observación
                          </label>
                          <input
                            type="text"
                            value={eventNotes}
                            onChange={(e) => setEventNotes(e.target.value)}
                            placeholder="Ej. Despacho en unidad 14"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={eventSubmitting}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60"
                        >
                          {eventSubmitting ? 'Validando...' : 'Registrar evento'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
