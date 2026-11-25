import { CheckCircle2, PackageCheck, Truck } from 'lucide-react';
import type { ParcelStatus } from '../types/logistics.ts';

export const STATUS_LABELS: Record<ParcelStatus, string> = {
  recibida: 'Recibida',
  en_transito: 'En tránsito',
  entregada: 'Entregada',
};

export function StatusText({ status }: { status: ParcelStatus }) {
  if (status === 'entregada') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Entregada</span>
      </span>
    );
  }
  if (status === 'en_transito') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Truck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>En tránsito</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 whitespace-nowrap">
      <PackageCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Recibida</span>
    </span>
  );
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatWeight(kg: number): string {
  return `${Number(kg).toFixed(2)} kg`;
}
