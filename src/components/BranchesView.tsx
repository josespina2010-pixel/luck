import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { Branch, UserRole } from '../types/logistics.ts';
import { formatDateTime } from './StatusText.tsx';

export function BranchesView({
  branches,
  loading,
  role,
  onRefresh,
  onDecision,
}: {
  branches: Branch[];
  loading: boolean;
  role: UserRole;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('25');
  const [active, setActive] = useState(true);

  const openCreate = () => {
    setEditing(null);
    setCode('');
    setCity('');
    setName('');
    setQuota('25');
    setActive(true);
    setModalOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setCode(branch.code);
    setCity(branch.city);
    setName(branch.name);
    setQuota(String(branch.dailyDispatchQuota ?? 25));
    setActive(branch.active);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        code,
        city,
        name,
        dailyDispatchQuota: Number(quota),
        active,
      };
      const res = editing
        ? await apiRequest(`/api/branches/${editing.id}`, {
            method: 'PATCH',
            body: payload,
          })
        : await apiRequest('/api/branches', {
            method: 'POST',
            body: payload,
          });
      onDecision(res);
      if (res.accepted) {
        setModalOpen(false);
        onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setSubmitting(true);
    try {
      const res = await apiRequest(`/api/branches/${id}`, {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Sucursales de la red
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isAdmin
              ? 'Administre códigos únicos, ciudades, cupos diarios de despacho y vigencia operativa.'
              : 'Consulta de sucursales activas habilitadas para recepción y destino de encomiendas.'}
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nueva sucursal</span>
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading && branches.length === 0 ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">
              No hay sucursales registradas todavía.
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={openCreate}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
              >
                Registrar primera sucursal
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                  <th className="py-3 px-6">Código</th>
                  <th className="py-3 px-4">Ciudad</th>
                  <th className="py-3 px-4">Nombre operativo</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Cupo diario</th>}
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Actualización</th>
                  {isAdmin && <th className="py-3 px-6 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {branches.map((branch) => (
                  <tr
                    key={branch.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-3 px-6 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {branch.code}
                    </td>
                    <td className="py-3 px-4 text-slate-800 whitespace-nowrap">
                      {branch.city}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{branch.name}</td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {branch.dailyDispatchQuota}
                      </td>
                    )}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-medium ${
                          branch.active ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {branch.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                      {formatDateTime(branch.updatedAt)}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        {confirmDeleteId === branch.id ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-red-700 font-medium">
                              ¿Eliminar?
                            </span>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleDelete(branch.id)}
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
                              onClick={() => openEdit(branch)}
                              title="Modificar sucursal"
                              className="p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(branch.id)}
                              title="Eliminar sucursal"
                              className="p-2 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? `Modificar sucursal ${editing.code}` : 'Alta de sucursal'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Complete código único, ciudad y capacidad operativa diaria.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Código único
                  </label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ej. SAL-06"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ej. Salta"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre operativo
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Centro Distribución Salta"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cupo diario de despacho
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={quota}
                    onChange={(e) => setQuota(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <label className="flex items-center gap-2 py-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                  />
                  <span>Sucursal operativa activa</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Guardando...' : 'Guardar sucursal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
