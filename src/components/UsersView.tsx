import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { DbUser, UserRole } from '../types/logistics.ts';
import { formatDateTime } from './StatusText.tsx';

export function UsersView({
  users,
  currentUserId,
  loading,
  onRefresh,
  onDecision,
}: {
  users: DbUser[];
  currentUserId: number;
  loading: boolean;
  onRefresh: () => void;
  onDecision: (res: {
    accepted: boolean;
    code: string;
    rule: string;
    message: string;
    statusCode?: number;
  }) => void;
}) {
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleRoleChange = async (userId: number, role: UserRole) => {
    setUpdatingId(userId);
    try {
      const res = await apiRequest(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: { role },
      });
      onDecision(res);
      if (res.accepted) {
        onRefresh();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Usuarios y control de acceso
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Asigne el perfil de Administrador (operación completa) o Usuario de consulta (solo lectura de información autorizada).
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Actualizar lista</span>
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th className="py-3 px-6">Correo electrónico</th>
                <th className="py-3 px-4">Nombre</th>
                <th className="py-3 px-4">Rol asignado</th>
                <th className="py-3 px-4">Registro</th>
                <th className="py-3 px-6 text-right">Cambiar perfil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-6 text-slate-900 font-medium">
                    {u.email}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-xs text-slate-500">(Sesión actual)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {u.displayName || '—'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`text-xs font-medium ${
                        u.role === 'admin' ? 'text-blue-700' : 'text-slate-700'
                      }`}
                    >
                      {u.role === 'admin' ? 'Administrador' : 'Usuario de consulta'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                    {u.createdAt ? formatDateTime(u.createdAt) : '—'}
                  </td>
                  <td className="py-3 px-6 text-right whitespace-nowrap">
                    <select
                      disabled={updatingId === u.id || u.id === currentUserId}
                      value={u.role}
                      onChange={(e) =>
                        handleRoleChange(u.id, e.target.value as UserRole)
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:opacity-50"
                    >
                      <option value="admin">Administrador</option>
                      <option value="consulta">Usuario de consulta</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
