import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from './index.ts';
import {
  branches,
  branchQuotas,
  parcelEvents,
  parcels,
  type ParcelStatus,
} from './schema.ts';

export class DomainRuleError extends Error {
  statusCode: number;
  code: string;
  rule: string;

  constructor(
    message: string,
    options: { statusCode?: number; code: string; rule: string }
  ) {
    super(message);
    this.name = 'DomainRuleError';
    this.statusCode = options.statusCode ?? 422;
    this.code = options.code;
    this.rule = options.rule;
  }
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDashboardSummary() {
  try {
    const today = getTodayDateString();
    const allBranches = await db
      .select()
      .from(branches)
      .orderBy(asc(branches.code));
    const allParcels = await db.select().from(parcels);
    const todayQuotas = await db
      .select()
      .from(branchQuotas)
      .where(eq(branchQuotas.quotaDate, today));

    const quotaMap = new Map<number, { maxCapacity: number; usedCount: number }>();
    for (const q of todayQuotas) {
      quotaMap.set(q.branchId, {
        maxCapacity: q.maxCapacity,
        usedCount: q.usedCount,
      });
    }

    const byStatus: Record<ParcelStatus, number> = {
      recibida: 0,
      en_transito: 0,
      entregada: 0,
    };

    let totalWeightKg = 0;
    const originCounts = new Map<number, number>();
    const destinationCounts = new Map<number, number>();

    for (const p of allParcels) {
      byStatus[p.currentStatus] = (byStatus[p.currentStatus] || 0) + 1;
      totalWeightKg += Number(p.weightKg) || 0;
      originCounts.set(
        p.originBranchId,
        (originCounts.get(p.originBranchId) || 0) + 1
      );
      destinationCounts.set(
        p.destinationBranchId,
        (destinationCounts.get(p.destinationBranchId) || 0) + 1
      );
    }

    const total = allParcels.length;
    const delivered = byStatus.entregada;
    const pending = byStatus.recibida + byStatus.en_transito;

    const branchBreakdown = allBranches.map((b) => {
      const q = quotaMap.get(b.id);
      return {
        id: b.id,
        code: b.code,
        city: b.city,
        name: b.name,
        active: b.active,
        dailyDispatchQuota: b.dailyDispatchQuota,
        todayUsedQuota: q?.usedCount ?? 0,
        todayMaxQuota: q?.maxCapacity ?? b.dailyDispatchQuota,
        originParcels: originCounts.get(b.id) ?? 0,
        destinationParcels: destinationCounts.get(b.id) ?? 0,
      };
    });

    return {
      totalParcels: total,
      deliveredParcels: delivered,
      pendingParcels: pending,
      byStatus,
      totalWeightKg: Number(totalWeightKg.toFixed(2)),
      activeBranches: allBranches.filter((b) => b.active).length,
      totalBranches: allBranches.length,
      branchBreakdown,
      todayDate: today,
    };
  } catch (error) {
    console.error('Database getDashboardSummary failed:', error);
    throw new Error('No se pudo calcular el resumen del panel de control.', {
      cause: error,
    });
  }
}

export async function listBranches(includeInactive = true) {
  try {
    const query = includeInactive
      ? db.select().from(branches).orderBy(asc(branches.code))
      : db
          .select()
          .from(branches)
          .where(eq(branches.active, true))
          .orderBy(asc(branches.code));
    return await query;
  } catch (error) {
    console.error('Database listBranches failed:', error);
    throw new Error('Error al consultar las sucursales.', { cause: error });
  }
}

export async function createBranch(input: {
  code: string;
  city: string;
  name: string;
  dailyDispatchQuota: number;
  active?: boolean;
}) {
  const code = input.code.trim().toUpperCase();
  const city = input.city.trim();
  const name = input.name.trim();
  const quota = Number(input.dailyDispatchQuota);

  if (!code || code.length < 2) {
    throw new DomainRuleError(
      'Operación rechazada: el código de sucursal es obligatorio (mínimo 2 caracteres).',
      { statusCode: 400, code: 'INVALID_BRANCH_CODE', rule: 'Datos obligatorios de sucursal' }
    );
  }
  if (!city || !name) {
    throw new DomainRuleError(
      'Operación rechazada: la ciudad y el nombre de la sucursal son obligatorios.',
      { statusCode: 400, code: 'INVALID_BRANCH_FIELDS', rule: 'Datos obligatorios de sucursal' }
    );
  }
  if (!Number.isInteger(quota) || quota <= 0) {
    throw new DomainRuleError(
      'Operación rechazada: el cupo diario de despacho debe ser un entero positivo mayor a 0.',
      { statusCode: 400, code: 'INVALID_QUOTA', rule: 'Cupo operativo positivo' }
    );
  }

  try {
    const existing = await db
      .select()
      .from(branches)
      .where(eq(branches.code, code))
      .limit(1);
    if (existing.length > 0) {
      throw new DomainRuleError(
        `Operación rechazada: ya existe una sucursal con el código ${code}.`,
        { statusCode: 409, code: 'DUPLICATE_BRANCH_CODE', rule: 'Unicidad de código de sucursal' }
      );
    }

    const [created] = await db
      .insert(branches)
      .values({
        code,
        city,
        name,
        dailyDispatchQuota: quota,
        active: input.active ?? true,
      })
      .returning();
    return created;
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database createBranch failed:', error);
    throw new Error('Error al crear la sucursal en la base de datos.', { cause: error });
  }
}

export async function updateBranch(
  id: number,
  input: {
    code?: string;
    city?: string;
    name?: string;
    dailyDispatchQuota?: number;
    active?: boolean;
  }
) {
  try {
    const existingList = await db
      .select()
      .from(branches)
      .where(eq(branches.id, id))
      .limit(1);
    if (existingList.length === 0) {
      throw new DomainRuleError('Sucursal no encontrada.', {
        statusCode: 404,
        code: 'BRANCH_NOT_FOUND',
        rule: 'Existencia de sucursal',
      });
    }
    const existing = existingList[0];

    const nextCode = input.code !== undefined ? input.code.trim().toUpperCase() : existing.code;
    const nextCity = input.city !== undefined ? input.city.trim() : existing.city;
    const nextName = input.name !== undefined ? input.name.trim() : existing.name;
    const nextQuota =
      input.dailyDispatchQuota !== undefined
        ? Number(input.dailyDispatchQuota)
        : existing.dailyDispatchQuota;
    const nextActive = input.active !== undefined ? Boolean(input.active) : existing.active;

    if (!nextCode || !nextCity || !nextName) {
      throw new DomainRuleError(
        'Operación rechazada: código, ciudad y nombre de sucursal no pueden quedar vacíos.',
        { statusCode: 400, code: 'INVALID_BRANCH_FIELDS', rule: 'Integridad de sucursal' }
      );
    }
    if (!Number.isInteger(nextQuota) || nextQuota <= 0) {
      throw new DomainRuleError(
        'Operación rechazada: el cupo diario de despacho debe ser un entero mayor a 0.',
        { statusCode: 400, code: 'INVALID_QUOTA', rule: 'Cupo operativo positivo' }
      );
    }

    if (nextCode !== existing.code) {
      const dup = await db
        .select()
        .from(branches)
        .where(eq(branches.code, nextCode))
        .limit(1);
      if (dup.length > 0) {
        throw new DomainRuleError(
          `Operación rechazada: el código ${nextCode} ya pertenece a otra sucursal.`,
          { statusCode: 409, code: 'DUPLICATE_BRANCH_CODE', rule: 'Unicidad de código de sucursal' }
        );
      }
    }

    const [updated] = await db
      .update(branches)
      .set({
        code: nextCode,
        city: nextCity,
        name: nextName,
        dailyDispatchQuota: nextQuota,
        active: nextActive,
        updatedAt: new Date(),
      })
      .where(eq(branches.id, id))
      .returning();

    return updated;
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database updateBranch failed:', error);
    throw new Error('Error al actualizar la sucursal.', { cause: error });
  }
}

export async function deleteBranch(id: number) {
  try {
    const existingList = await db
      .select()
      .from(branches)
      .where(eq(branches.id, id))
      .limit(1);
    if (existingList.length === 0) {
      throw new DomainRuleError('Sucursal no encontrada.', {
        statusCode: 404,
        code: 'BRANCH_NOT_FOUND',
        rule: 'Existencia de sucursal',
      });
    }

    const linkedParcels = await db
      .select({ id: parcels.id })
      .from(parcels)
      .where(
        or(eq(parcels.originBranchId, id), eq(parcels.destinationBranchId, id))
      )
      .limit(1);

    if (linkedParcels.length > 0) {
      throw new DomainRuleError(
        'Baja rechazada: no se puede eliminar una sucursal que posee encomiendas asociadas como origen o destino. Puede desactivarla para conservar la trazabilidad.',
        { statusCode: 409, code: 'BRANCH_HAS_PARCELS', rule: 'Integridad referencial de sucursal' }
      );
    }

    const linkedEvents = await db
      .select({ id: parcelEvents.id })
      .from(parcelEvents)
      .where(eq(parcelEvents.locationBranchId, id))
      .limit(1);

    if (linkedEvents.length > 0) {
      throw new DomainRuleError(
        'Baja rechazada: existen eventos históricos vinculados a esta sucursal.',
        { statusCode: 409, code: 'BRANCH_HAS_EVENTS', rule: 'Integridad referencial de eventos' }
      );
    }

    const [deleted] = await db
      .delete(branches)
      .where(eq(branches.id, id))
      .returning();
    return deleted;
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database deleteBranch failed:', error);
    throw new Error('Error al eliminar la sucursal.', { cause: error });
  }
}

export interface ParcelFilterParams {
  search?: string;
  branchId?: number;
  status?: ParcelStatus;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'weightKg' | 'trackingCode' | 'currentStatus';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  isAdmin: boolean;
}

export async function listParcels(params: ParcelFilterParams) {
  try {
    const conditions: SQL[] = [];

    if (params.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      const searchCond = or(
        ilike(parcels.trackingCode, term),
        ilike(parcels.recipientName, term)
      );
      if (searchCond) conditions.push(searchCond);
    }

    if (params.branchId && Number.isInteger(params.branchId)) {
      const branchCond = or(
        eq(parcels.originBranchId, params.branchId),
        eq(parcels.destinationBranchId, params.branchId)
      );
      if (branchCond) conditions.push(branchCond);
    }

    if (params.status) {
      conditions.push(eq(parcels.currentStatus, params.status));
    }

    if (params.dateFrom) {
      const fromDate = new Date(`${params.dateFrom}T00:00:00.000Z`);
      if (!Number.isNaN(fromDate.getTime())) {
        conditions.push(gte(parcels.createdAt, fromDate));
      }
    }

    if (params.dateTo) {
      const toDate = new Date(`${params.dateTo}T23:59:59.999Z`);
      if (!Number.isNaN(toDate.getTime())) {
        conditions.push(lte(parcels.createdAt, toDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn = (() => {
      switch (params.sortBy) {
        case 'weightKg':
          return parcels.weightKg;
        case 'trackingCode':
          return parcels.trackingCode;
        case 'currentStatus':
          return parcels.currentStatus;
        case 'updatedAt':
          return parcels.updatedAt;
        case 'createdAt':
        default:
          return parcels.createdAt;
      }
    })();

    const orderExpr =
      params.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 8));
    const offset = (page - 1) * pageSize;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(parcels)
      .where(whereClause);

    const rows = await db
      .select()
      .from(parcels)
      .where(whereClause)
      .orderBy(orderExpr, desc(parcels.id))
      .limit(pageSize)
      .offset(offset);

    const allBranches = await db.select().from(branches);
    const branchMap = new Map(allBranches.map((b) => [b.id, b]));

    const items = rows.map((p) => {
      const origin = branchMap.get(p.originBranchId);
      const destination = branchMap.get(p.destinationBranchId);
      const base = {
        id: p.id,
        trackingCode: p.trackingCode,
        originBranchId: p.originBranchId,
        originBranch: origin
          ? { id: origin.id, code: origin.code, city: origin.city, name: origin.name }
          : null,
        destinationBranchId: p.destinationBranchId,
        destinationBranch: destination
          ? {
              id: destination.id,
              code: destination.code,
              city: destination.city,
              name: destination.name,
            }
          : null,
        recipientName: p.recipientName,
        weightKg: p.weightKg,
        currentStatus: p.currentStatus,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
      if (params.isAdmin) {
        return {
          ...base,
          internalNotes: p.internalNotes,
          createdByUid: p.createdByUid,
        };
      }
      return base;
    });

    return {
      items,
      total: count,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
    };
  } catch (error) {
    console.error('Database listParcels failed:', error);
    throw new Error('Error al consultar las encomiendas.', { cause: error });
  }
}

export async function getParcelById(id: number, isAdmin: boolean) {
  try {
    const rows = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new DomainRuleError('Encomienda no encontrada.', {
        statusCode: 404,
        code: 'PARCEL_NOT_FOUND',
        rule: 'Existencia de encomienda',
      });
    }

    const p = rows[0];
    const allBranches = await db.select().from(branches);
    const branchMap = new Map(allBranches.map((b) => [b.id, b]));

    const events = await db
      .select()
      .from(parcelEvents)
      .where(eq(parcelEvents.parcelId, id))
      .orderBy(asc(parcelEvents.eventDate), asc(parcelEvents.id));

    const origin = branchMap.get(p.originBranchId);
    const destination = branchMap.get(p.destinationBranchId);

    return {
      id: p.id,
      trackingCode: p.trackingCode,
      originBranchId: p.originBranchId,
      originBranch: origin
        ? { id: origin.id, code: origin.code, city: origin.city, name: origin.name }
        : null,
      destinationBranchId: p.destinationBranchId,
      destinationBranch: destination
        ? {
            id: destination.id,
            code: destination.code,
            city: destination.city,
            name: destination.name,
          }
        : null,
      recipientName: p.recipientName,
      weightKg: p.weightKg,
      currentStatus: p.currentStatus,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      ...(isAdmin
        ? { internalNotes: p.internalNotes, createdByUid: p.createdByUid }
        : {}),
      events: events.map((ev) => ({
        id: ev.id,
        parcelId: ev.parcelId,
        eventDate: ev.eventDate,
        locationBranchId: ev.locationBranchId,
        locationText: ev.locationText,
        status: ev.status,
        notes: ev.notes,
        createdAt: ev.createdAt,
        updatedAt: ev.updatedAt,
        ...(isAdmin ? { recordedByUid: ev.recordedByUid } : {}),
      })),
    };
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database getParcelById failed:', error);
    throw new Error('Error al obtener el detalle de la encomienda.', {
      cause: error,
    });
  }
}

export async function createParcel(input: {
  trackingCode: string;
  originBranchId: number;
  destinationBranchId: number;
  recipientName: string;
  weightKg: number;
  internalNotes?: string;
  userUid: string;
  quotaDate?: string;
}) {
  const trackingCode = input.trackingCode.trim().toUpperCase();
  const originBranchId = Number(input.originBranchId);
  const destinationBranchId = Number(input.destinationBranchId);
  const recipientName = input.recipientName.trim();
  const weightKg = Number(input.weightKg);
  const quotaDate = input.quotaDate || getTodayDateString();

  if (!trackingCode || trackingCode.length < 4) {
    throw new DomainRuleError(
      'Operación rechazada: el código de seguimiento es obligatorio (mínimo 4 caracteres).',
      {
        statusCode: 400,
        code: 'INVALID_TRACKING_CODE',
        rule: 'Identificador de seguimiento único',
      }
    );
  }
  if (!recipientName) {
    throw new DomainRuleError(
      'Operación rechazada: debe indicar el destinatario ficticio.',
      {
        statusCode: 400,
        code: 'INVALID_RECIPIENT',
        rule: 'Destinatario obligatorio',
      }
    );
  }
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new DomainRuleError(
      `Operación rechazada: el peso (${input.weightKg}) debe ser un número positivo mayor a 0 kg.`,
      {
        statusCode: 400,
        code: 'INVALID_WEIGHT',
        rule: 'Validación de peso positivo (> 0 kg)',
      }
    );
  }
  if (
    !Number.isInteger(originBranchId) ||
    !Number.isInteger(destinationBranchId) ||
    originBranchId === destinationBranchId
  ) {
    throw new DomainRuleError(
      'Operación rechazada: la sucursal de origen y la sucursal de destino deben ser distintas.',
      {
        statusCode: 400,
        code: 'SAME_ORIGIN_DESTINATION',
        rule: 'Origen distinto de destino',
      }
    );
  }

  try {
    return await db.transaction(async (tx) => {
      // Lock origin branch row to serialize concurrent quota checks for this branch
      const originRows = await tx
        .select()
        .from(branches)
        .where(eq(branches.id, originBranchId))
        .for('update');

      if (originRows.length === 0) {
        throw new DomainRuleError(
          'Operación rechazada: la sucursal de origen seleccionada no existe.',
          {
            statusCode: 404,
            code: 'ORIGIN_NOT_FOUND',
            rule: 'Existencia de sucursal de origen',
          }
        );
      }
      const origin = originRows[0];
      if (!origin.active) {
        throw new DomainRuleError(
          `Operación rechazada: la sucursal de origen ${origin.code} se encuentra inactiva.`,
          {
            statusCode: 422,
            code: 'ORIGIN_INACTIVE',
            rule: 'Sucursal de origen activa',
          }
        );
      }

      const destRows = await tx
        .select()
        .from(branches)
        .where(eq(branches.id, destinationBranchId))
        .limit(1);

      if (destRows.length === 0) {
        throw new DomainRuleError(
          'Operación rechazada: la sucursal de destino seleccionada no existe.',
          {
            statusCode: 404,
            code: 'DESTINATION_NOT_FOUND',
            rule: 'Existencia de sucursal de destino',
          }
        );
      }
      if (!destRows[0].active) {
        throw new DomainRuleError(
          `Operación rechazada: la sucursal de destino ${destRows[0].code} se encuentra inactiva.`,
          {
            statusCode: 422,
            code: 'DESTINATION_INACTIVE',
            rule: 'Sucursal de destino activa',
          }
        );
      }

      const dupTracking = await tx
        .select({ id: parcels.id })
        .from(parcels)
        .where(eq(parcels.trackingCode, trackingCode))
        .limit(1);

      if (dupTracking.length > 0) {
        throw new DomainRuleError(
          `Operación rechazada: el código de seguimiento ${trackingCode} ya existe en el sistema.`,
          {
            statusCode: 409,
            code: 'DUPLICATE_TRACKING_CODE',
            rule: 'Unicidad de seguimiento',
          }
        );
      }

      // Ensure today's quota row exists, then lock it with FOR UPDATE
      await tx
        .insert(branchQuotas)
        .values({
          branchId: originBranchId,
          quotaDate,
          maxCapacity: origin.dailyDispatchQuota,
          usedCount: 0,
        })
        .onConflictDoNothing({
          target: [branchQuotas.branchId, branchQuotas.quotaDate],
        });

      const [quotaRow] = await tx
        .select()
        .from(branchQuotas)
        .where(
          and(
            eq(branchQuotas.branchId, originBranchId),
            eq(branchQuotas.quotaDate, quotaDate)
          )
        )
        .for('update');

      if (quotaRow.usedCount >= quotaRow.maxCapacity) {
        throw new DomainRuleError(
          `Operación rechazada: la sucursal ${origin.code} (${origin.city}) alcanzó su cupo máximo operativo (${quotaRow.usedCount}/${quotaRow.maxCapacity}) para la fecha ${quotaDate}.`,
          {
            statusCode: 409,
            code: 'QUOTA_EXCEEDED',
            rule: 'Control de concurrencia por cupo diario de sucursal (SELECT ... FOR UPDATE)',
          }
        );
      }

      await tx
        .update(branchQuotas)
        .set({
          usedCount: quotaRow.usedCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(branchQuotas.id, quotaRow.id));

      const [created] = await tx
        .insert(parcels)
        .values({
          trackingCode,
          originBranchId,
          destinationBranchId,
          recipientName,
          weightKg: Number(weightKg.toFixed(2)),
          currentStatus: 'recibida',
          internalNotes: (input.internalNotes ?? '').trim(),
          createdByUid: input.userUid,
        })
        .returning();

      const [initialEvent] = await tx
        .insert(parcelEvents)
        .values({
          parcelId: created.id,
          eventDate: new Date(),
          locationBranchId: originBranchId,
          locationText: `${origin.code} · ${origin.city}`,
          status: 'recibida',
          notes: 'Recepción inicial registrada en sucursal de origen',
          recordedByUid: input.userUid,
        })
        .returning();

      return {
        parcel: created,
        initialEvent,
        quotaSnapshot: {
          quotaDate,
          usedCount: quotaRow.usedCount + 1,
          maxCapacity: quotaRow.maxCapacity,
        },
      };
    });
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database createParcel failed:', error);
    throw new Error('Error al registrar la encomienda.', { cause: error });
  }
}

export async function updateParcel(
  id: number,
  input: {
    originBranchId?: number;
    destinationBranchId?: number;
    recipientName?: string;
    weightKg?: number;
    internalNotes?: string;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(parcels)
        .where(eq(parcels.id, id))
        .for('update');

      if (rows.length === 0) {
        throw new DomainRuleError('Encomienda no encontrada.', {
          statusCode: 404,
          code: 'PARCEL_NOT_FOUND',
          rule: 'Existencia de encomienda',
        });
      }

      const existing = rows[0];

      if (existing.currentStatus === 'entregada') {
        throw new DomainRuleError(
          'Modificación rechazada: una encomienda en estado "entregada" queda cerrada y no admite modificaciones operativas.',
          {
            statusCode: 422,
            code: 'PARCEL_DELIVERED_IMMUTABLE',
            rule: 'Inmutabilidad de encomienda entregada',
          }
        );
      }

      const nextOriginId =
        input.originBranchId !== undefined
          ? Number(input.originBranchId)
          : existing.originBranchId;
      const nextDestId =
        input.destinationBranchId !== undefined
          ? Number(input.destinationBranchId)
          : existing.destinationBranchId;
      const nextRecipient =
        input.recipientName !== undefined
          ? input.recipientName.trim()
          : existing.recipientName;
      const nextWeight =
        input.weightKg !== undefined ? Number(input.weightKg) : existing.weightKg;
      const nextNotes =
        input.internalNotes !== undefined
          ? input.internalNotes.trim()
          : existing.internalNotes;

      if (
        existing.currentStatus === 'en_transito' &&
        nextOriginId !== existing.originBranchId
      ) {
        throw new DomainRuleError(
          'Modificación rechazada: no es posible cambiar la sucursal de origen cuando la encomienda ya se encuentra "en_transito".',
          {
            statusCode: 422,
            code: 'ORIGIN_LOCKED_IN_TRANSIT',
            rule: 'Integridad de origen en tránsito',
          }
        );
      }

      if (!nextRecipient) {
        throw new DomainRuleError(
          'Modificación rechazada: el destinatario ficticio no puede quedar vacío.',
          {
            statusCode: 400,
            code: 'INVALID_RECIPIENT',
            rule: 'Destinatario obligatorio',
          }
        );
      }

      if (!Number.isFinite(nextWeight) || nextWeight <= 0) {
        throw new DomainRuleError(
          'Modificación rechazada: el peso de la encomienda debe ser mayor a 0 kg.',
          {
            statusCode: 400,
            code: 'INVALID_WEIGHT',
            rule: 'Validación de peso positivo (> 0 kg)',
          }
        );
      }

      if (nextOriginId === nextDestId) {
        throw new DomainRuleError(
          'Modificación rechazada: la sucursal de origen y la sucursal de destino deben ser distintas.',
          {
            statusCode: 400,
            code: 'SAME_ORIGIN_DESTINATION',
            rule: 'Origen distinto de destino',
          }
        );
      }

      const [updated] = await tx
        .update(parcels)
        .set({
          originBranchId: nextOriginId,
          destinationBranchId: nextDestId,
          recipientName: nextRecipient,
          weightKg: Number(nextWeight.toFixed(2)),
          internalNotes: nextNotes,
          updatedAt: new Date(),
        })
        .where(eq(parcels.id, id))
        .returning();

      return updated;
    });
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database updateParcel failed:', error);
    throw new Error('Error al modificar la encomienda.', { cause: error });
  }
}

export async function deleteParcel(id: number) {
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(parcels)
        .where(eq(parcels.id, id))
        .for('update');

      if (rows.length === 0) {
        throw new DomainRuleError('Encomienda no encontrada.', {
          statusCode: 404,
          code: 'PARCEL_NOT_FOUND',
          rule: 'Existencia de encomienda',
        });
      }

      const existing = rows[0];
      if (existing.currentStatus !== 'recibida') {
        throw new DomainRuleError(
          `Baja rechazada: la encomienda ${existing.trackingCode} se encuentra en estado "${existing.currentStatus}". Solo se permite dar de baja encomiendas en estado "recibida" antes de iniciar tránsito.`,
          {
            statusCode: 422,
            code: 'DELETE_ONLY_RECEIVED',
            rule: 'Condición de baja operativa',
          }
        );
      }

      const createdDateStr = existing.createdAt.toISOString().slice(0, 10);
      const quotaRows = await tx
        .select()
        .from(branchQuotas)
        .where(
          and(
            eq(branchQuotas.branchId, existing.originBranchId),
            eq(branchQuotas.quotaDate, createdDateStr)
          )
        )
        .for('update');

      if (quotaRows.length > 0 && quotaRows[0].usedCount > 0) {
        await tx
          .update(branchQuotas)
          .set({
            usedCount: quotaRows[0].usedCount - 1,
            updatedAt: new Date(),
          })
          .where(eq(branchQuotas.id, quotaRows[0].id));
      }

      const [deleted] = await tx
        .delete(parcels)
        .where(eq(parcels.id, id))
        .returning();
      return deleted;
    });
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database deleteParcel failed:', error);
    throw new Error('Error al eliminar la encomienda.', { cause: error });
  }
}

export async function addParcelEvent(
  parcelId: number,
  input: {
    status: ParcelStatus;
    locationBranchId?: number | null;
    locationText?: string;
    notes?: string;
    eventDate?: string;
    userUid: string;
  }
) {
  const targetStatus = input.status;
  if (
    targetStatus !== 'recibida' &&
    targetStatus !== 'en_transito' &&
    targetStatus !== 'entregada'
  ) {
    throw new DomainRuleError(
      'Operación rechazada: el estado solicitado no es válido (use recibida, en_transito o entregada).',
      {
        statusCode: 400,
        code: 'INVALID_STATUS',
        rule: 'Catálogo de estados válidos',
      }
    );
  }

  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(parcels)
        .where(eq(parcels.id, parcelId))
        .for('update');

      if (rows.length === 0) {
        throw new DomainRuleError('Encomienda no encontrada.', {
          statusCode: 404,
          code: 'PARCEL_NOT_FOUND',
          rule: 'Existencia de encomienda',
        });
      }

      const parcel = rows[0];
      const current = parcel.currentStatus;

      if (current === 'entregada') {
        throw new DomainRuleError(
          `Operación rechazada: la encomienda ${parcel.trackingCode} ya fue "entregada" y no admite nuevos eventos operativos.`,
          {
            statusCode: 422,
            code: 'PARCEL_ALREADY_DELIVERED',
            rule: 'Bloqueo posterior a entrega',
          }
        );
      }

      if (current === 'recibida') {
        if (targetStatus === 'entregada') {
          throw new DomainRuleError(
            `Operación rechazada: no es posible pasar de "recibida" directamente a "entregada". Debe registrar primero un evento "en_transito".`,
            {
              statusCode: 422,
              code: 'DELIVERY_WITHOUT_TRANSIT',
              rule: 'Secuencia obligatoria: recibida -> en_transito -> entregada',
            }
          );
        }
        if (targetStatus === 'recibida') {
          throw new DomainRuleError(
            'Operación rechazada: la encomienda ya se encuentra en estado "recibida". El siguiente paso válido es "en_transito".',
            {
              statusCode: 422,
              code: 'REDUNDANT_RECEIVED_EVENT',
              rule: 'Secuencia obligatoria: recibida -> en_transito -> entregada',
            }
          );
        }
      }

      if (current === 'en_transito' && targetStatus === 'recibida') {
        throw new DomainRuleError(
          'Operación rechazada: no es posible retroceder de "en_transito" a "recibida".',
          {
            statusCode: 422,
            code: 'INVALID_BACKWARD_TRANSITION',
            rule: 'Secuencia obligatoria: recibida -> en_transito -> entregada',
          }
        );
      }

      let resolvedLocationText = (input.locationText ?? '').trim();
      let resolvedBranchId: number | null =
        input.locationBranchId !== undefined && input.locationBranchId !== null
          ? Number(input.locationBranchId)
          : null;

      if (resolvedBranchId !== null) {
        const bRows = await tx
          .select()
          .from(branches)
          .where(eq(branches.id, resolvedBranchId))
          .limit(1);
        if (bRows.length === 0) {
          throw new DomainRuleError(
            'Operación rechazada: la sucursal indicada en la ubicación no existe.',
            {
              statusCode: 404,
              code: 'LOCATION_BRANCH_NOT_FOUND',
              rule: 'Ubicación de evento válida',
            }
          );
        }
        if (!resolvedLocationText) {
          resolvedLocationText = `${bRows[0].code} · ${bRows[0].city}`;
        }
      }

      if (!resolvedLocationText) {
        throw new DomainRuleError(
          'Operación rechazada: debe indicar una ubicación o sucursal para el evento.',
          {
            statusCode: 400,
            code: 'MISSING_EVENT_LOCATION',
            rule: 'Ubicación obligatoria en evento',
          }
        );
      }

      const parsedDate = input.eventDate ? new Date(input.eventDate) : new Date();
      const eventDate = Number.isNaN(parsedDate.getTime())
        ? new Date()
        : parsedDate;

      const [createdEvent] = await tx
        .insert(parcelEvents)
        .values({
          parcelId,
          eventDate,
          locationBranchId: resolvedBranchId,
          locationText: resolvedLocationText,
          status: targetStatus,
          notes: (input.notes ?? '').trim(),
          recordedByUid: input.userUid,
        })
        .returning();

      const [updatedParcel] = await tx
        .update(parcels)
        .set({
          currentStatus: targetStatus,
          updatedAt: new Date(),
        })
        .where(eq(parcels.id, parcelId))
        .returning();

      return {
        parcel: updatedParcel,
        event: createdEvent,
      };
    });
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    console.error('Database addParcelEvent failed:', error);
    throw new Error('Error al registrar el evento de la encomienda.', {
      cause: error,
    });
  }
}
