import { auth } from './firebase.ts';
import type { ApiEnvelope } from '../types/logistics.ts';

export async function apiRequest<T = unknown>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<ApiEnvelope<T>> {
  const user = auth.currentUser;
  if (!user) {
    return {
      accepted: false,
      code: 'NOT_AUTHENTICATED',
      rule: 'Sesión activa requerida',
      message: 'Debe iniciar sesión con Google para realizar esta acción.',
      statusCode: 401,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!payload) {
    return {
      accepted: false,
      code: 'INVALID_RESPONSE',
      rule: 'Comunicación con el servidor',
      message: 'El servidor devolvió una respuesta no válida.',
      statusCode: res.status,
    };
  }

  return {
    ...payload,
    statusCode: res.status,
  };
}
