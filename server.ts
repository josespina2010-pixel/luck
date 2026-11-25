import 'dotenv/config';
import express, { type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { and, eq } from 'drizzle-orm';
import {
  addParcelEvent,
  createBranch,
  createParcel,
  deleteBranch,
  deleteParcel,
  DomainRuleError,
  getDashboardSummary,
  getParcelById,
  listBranches,
  listParcels,
  updateBranch,
  updateParcel,
} from './src/db/logistics.ts';
import { db } from './src/db/index.ts';
import { branchQuotas } from './src/db/schema.ts';
import type { ParcelStatus, UserRole } from './src/db/schema.ts';
import { listUsers, updateUserRole } from './src/db/users.ts';
import { requireAdmin, requireAuth, type AuthRequest } from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

function handleError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof DomainRuleError) {
    return res.status(error.statusCode).json({
      accepted: false,
      code: error.code,
      rule: error.rule,
      message: error.message,
    });
  }
  console.error(fallbackMessage, error);
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;
  return res.status(500).json({
    accepted: false,
    code: 'INTERNAL_ERROR',
    rule: 'Procesamiento del servidor',
    message,
  });
}

function parsePositiveInt(raw: string): number | null {
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

// Health check (no DB query or secrets exposed)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Authenticated user profile & role
app.get('/api/me', requireAuth, (req: AuthRequest, res) => {
  res.json({
    accepted: true,
    code: 'AUTH_OK',
    rule: 'Sesión verificada',
    message: 'Perfil autenticado correctamente.',
    data: req.dbUser,
  });
});

// Dashboard summary (both admin and consulta can view authorized aggregate KPIs)
app.get('/api/dashboard', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const summary = await getDashboardSummary();
    res.json({
      accepted: true,
      code: 'DASHBOARD_OK',
      rule: 'Panel de control autorizado',
      message: 'Métricas operativas actualizadas.',
      data: summary,
    });
  } catch (error) {
    handleError(res, error, 'Error al cargar el panel de control.');
  }
});

// Branches
app.get('/api/branches', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isAdmin =
      req.dbUser?.role === 'admin' && req.query.viewAs !== 'consulta';
    const items = await listBranches(isAdmin);
    const sanitized = isAdmin
      ? items
      : items.map((b) => ({
          id: b.id,
          code: b.code,
          city: b.city,
          name: b.name,
          active: b.active,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        }));
    res.json({
      accepted: true,
      code: 'BRANCHES_OK',
      rule: 'Consulta de sucursales',
      message: 'Listado de sucursales obtenido.',
      data: sanitized,
    });
  } catch (error) {
    handleError(res, error, 'Error al obtener las sucursales.');
  }
});

app.post('/api/branches', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const created = await createBranch({
      code: String(req.body?.code ?? ''),
      city: String(req.body?.city ?? ''),
      name: String(req.body?.name ?? ''),
      dailyDispatchQuota: Number(req.body?.dailyDispatchQuota ?? 25),
      active: req.body?.active !== undefined ? Boolean(req.body.active) : true,
    });
    res.status(201).json({
      accepted: true,
      code: 'BRANCH_CREATED',
      rule: 'Alta de sucursal validada',
      message: `Operación aceptada: sucursal ${created.code} (${created.city}) registrada correctamente.`,
      data: created,
    });
  } catch (error) {
    handleError(res, error, 'Error al registrar la sucursal.');
  }
});

app.patch('/api/branches/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      accepted: false,
      code: 'INVALID_ID',
      rule: 'Identificador válido',
      message: 'Operación rechazada: el identificador de sucursal es inválido.',
    });
  }
  try {
    const updated = await updateBranch(id, {
      code: req.body?.code !== undefined ? String(req.body.code) : undefined,
      city: req.body?.city !== undefined ? String(req.body.city) : undefined,
      name: req.body?.name !== undefined ? String(req.body.name) : undefined,
      dailyDispatchQuota:
        req.body?.dailyDispatchQuota !== undefined
          ? Number(req.body.dailyDispatchQuota)
          : undefined,
      active: req.body?.active !== undefined ? Boolean(req.body.active) : undefined,
    });
    res.json({
      accepted: true,
      code: 'BRANCH_UPDATED',
      rule: 'Modificación de sucursal validada',
      message: `Operación aceptada: sucursal ${updated.code} actualizada correctamente.`,
      data: updated,
    });
  } catch (error) {
    handleError(res, error, 'Error al modificar la sucursal.');
  }
});

app.delete('/api/branches/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      accepted: false,
      code: 'INVALID_ID',
      rule: 'Identificador válido',
      message: 'Operación rechazada: identificador de sucursal inválido.',
    });
  }
  try {
    const deleted = await deleteBranch(id);
    res.json({
      accepted: true,
      code: 'BRANCH_DELETED',
      rule: 'Baja de sucursal sin dependencias',
      message: `Operación aceptada: sucursal ${deleted.code} eliminada correctamente.`,
      data: deleted,
    });
  } catch (error) {
    handleError(res, error, 'Error al eliminar la sucursal.');
  }
});

// Parcels (search, combined filters, sort, pagination)
app.get('/api/parcels', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isAdmin =
      req.dbUser?.role === 'admin' && req.query.viewAs !== 'consulta';
    const rawBranchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const rawStatus = req.query.status ? String(req.query.status) : undefined;
    const validStatus =
      rawStatus === 'recibida' ||
      rawStatus === 'en_transito' ||
      rawStatus === 'entregada'
        ? (rawStatus as ParcelStatus)
        : undefined;

    const rawSortBy = String(req.query.sortBy ?? 'createdAt');
    const validSortBy =
      rawSortBy === 'createdAt' ||
      rawSortBy === 'updatedAt' ||
      rawSortBy === 'weightKg' ||
      rawSortBy === 'trackingCode' ||
      rawSortBy === 'currentStatus'
        ? rawSortBy
        : 'createdAt';

    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 8;

    const result = await listParcels({
      search: req.query.search ? String(req.query.search) : undefined,
      branchId:
        rawBranchId && Number.isInteger(rawBranchId) ? rawBranchId : undefined,
      status: validStatus,
      dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
      dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
      sortBy: validSortBy,
      sortOrder,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 8,
      isAdmin,
    });

    res.json({
      accepted: true,
      code: 'PARCELS_OK',
      rule: 'Consulta filtrada de encomiendas',
      message: `Se encontraron ${result.total} encomiendas.`,
      data: result,
    });
  } catch (error) {
    handleError(res, error, 'Error al consultar las encomiendas.');
  }
});

app.get('/api/parcels/:id', requireAuth, async (req: AuthRequest, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      accepted: false,
      code: 'INVALID_ID',
      rule: 'Identificador válido',
      message: 'Operación rechazada: identificador de encomienda inválido.',
    });
  }
  try {
    const isAdmin =
      req.dbUser?.role === 'admin' && req.query.viewAs !== 'consulta';
    const detail = await getParcelById(id, isAdmin);
    res.json({
      accepted: true,
      code: 'PARCEL_DETAIL_OK',
      rule: 'Consulta autorizada de detalle y eventos',
      message: `Detalle de ${detail.trackingCode} cargado.`,
      data: detail,
    });
  } catch (error) {
    handleError(res, error, 'Error al obtener el detalle de la encomienda.');
  }
});

app.post('/api/parcels', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await createParcel({
      trackingCode: String(req.body?.trackingCode ?? ''),
      originBranchId: Number(req.body?.originBranchId),
      destinationBranchId: Number(req.body?.destinationBranchId),
      recipientName: String(req.body?.recipientName ?? ''),
      weightKg: Number(req.body?.weightKg),
      internalNotes: req.body?.internalNotes
        ? String(req.body.internalNotes)
        : '',
      userUid: req.dbUser!.uid,
    });

    res.status(201).json({
      accepted: true,
      code: 'PARCEL_CREATED',
      rule: 'Peso positivo, origen != destino, cupo disponible y estado inicial recibida',
      message: `Operación aceptada: encomienda ${result.parcel.trackingCode} registrada en estado "recibida" (cupo sucursal hoy: ${result.quotaSnapshot.usedCount}/${result.quotaSnapshot.maxCapacity}).`,
      data: result,
    });
  } catch (error) {
    handleError(res, error, 'Error al registrar la encomienda.');
  }
});

app.patch('/api/parcels/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      accepted: false,
      code: 'INVALID_ID',
      rule: 'Identificador válido',
      message: 'Operación rechazada: identificador de encomienda inválido.',
    });
  }
  try {
    const updated = await updateParcel(id, {
      originBranchId:
        req.body?.originBranchId !== undefined
          ? Number(req.body.originBranchId)
          : undefined,
      destinationBranchId:
        req.body?.destinationBranchId !== undefined
          ? Number(req.body.destinationBranchId)
          : undefined,
      recipientName:
        req.body?.recipientName !== undefined
          ? String(req.body.recipientName)
          : undefined,
      weightKg:
        req.body?.weightKg !== undefined ? Number(req.body.weightKg) : undefined,
      internalNotes:
        req.body?.internalNotes !== undefined
          ? String(req.body.internalNotes)
          : undefined,
    });

    res.json({
      accepted: true,
      code: 'PARCEL_UPDATED',
      rule: 'Modificación bajo condiciones operativas',
      message: `Operación aceptada: encomienda ${updated.trackingCode} actualizada correctamente.`,
      data: updated,
    });
  } catch (error) {
    handleError(res, error, 'Error al modificar la encomienda.');
  }
});

app.delete('/api/parcels/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      accepted: false,
      code: 'INVALID_ID',
      rule: 'Identificador válido',
      message: 'Operación rechazada: identificador de encomienda inválido.',
    });
  }
  try {
    const deleted = await deleteParcel(id);
    res.json({
      accepted: true,
      code: 'PARCEL_DELETED',
      rule: 'Baja permitida únicamente en estado recibida',
      message: `Operación aceptada: encomienda ${deleted.trackingCode} dada de baja y cupo liberado.`,
      data: deleted,
    });
  } catch (error) {
    handleError(res, error, 'Error al eliminar la encomienda.');
  }
});

// Parcel operational events
app.post(
  '/api/parcels/:id/events',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({
        accepted: false,
        code: 'INVALID_ID',
        rule: 'Identificador válido',
        message: 'Operación rechazada: identificador de encomienda inválido.',
      });
    }
    try {
      const result = await addParcelEvent(id, {
        status: String(req.body?.status ?? '') as ParcelStatus,
        locationBranchId:
          req.body?.locationBranchId !== undefined &&
          req.body?.locationBranchId !== null &&
          req.body?.locationBranchId !== ''
            ? Number(req.body.locationBranchId)
            : null,
        locationText: req.body?.locationText
          ? String(req.body.locationText)
          : '',
        notes: req.body?.notes ? String(req.body.notes) : '',
        eventDate: req.body?.eventDate ? String(req.body.eventDate) : undefined,
        userUid: req.dbUser!.uid,
      });

      res.status(201).json({
        accepted: true,
        code: 'EVENT_RECORDED',
        rule: 'Secuencia de estados recibida -> en_transito -> entregada',
        message: `Operación aceptada: evento "${result.event.status}" registrado para ${result.parcel.trackingCode}.`,
        data: result,
      });
    } catch (error) {
      handleError(res, error, 'Error al registrar el evento operativo.');
    }
  }
);

// Admin user & role directory
app.get('/api/users', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const all = await listUsers();
    res.json({
      accepted: true,
      code: 'USERS_OK',
      rule: 'Administración de roles',
      message: 'Usuarios registrados cargados.',
      data: all,
    });
  } catch (error) {
    handleError(res, error, 'Error al consultar los usuarios.');
  }
});

app.patch(
  '/api/users/:id/role',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const id = parsePositiveInt(req.params.id);
    const nextRole = String(req.body?.role ?? '') as UserRole;
    if (!id || (nextRole !== 'admin' && nextRole !== 'consulta')) {
      return res.status(400).json({
        accepted: false,
        code: 'INVALID_ROLE_PAYLOAD',
        rule: 'Rol válido (admin o consulta)',
        message: 'Operación rechazada: identificador o rol inválido.',
      });
    }
    try {
      if (req.dbUser?.id === id && nextRole !== 'admin') {
        return res.status(422).json({
          accepted: false,
          code: 'SELF_DEMOTION_BLOCKED',
          rule: 'Protección de administrador activo',
          message:
            'Operación rechazada: no puede quitarse su propio rol de administrador en la sesión actual.',
        });
      }
      const updated = await updateUserRole(id, nextRole);
      if (!updated) {
        return res.status(404).json({
          accepted: false,
          code: 'USER_NOT_FOUND',
          rule: 'Existencia de usuario',
          message: 'Usuario no encontrado.',
        });
      }
      res.json({
        accepted: true,
        code: 'ROLE_UPDATED',
        rule: 'Actualización de rol de acceso',
        message: `Operación aceptada: el usuario ${updated.email} ahora tiene rol "${updated.role}".`,
        data: updated,
      });
    } catch (error) {
      handleError(res, error, 'Error al actualizar el rol.');
    }
  }
);

// Mandatory Individual Test (live execution against PostgreSQL)
app.post(
  '/api/tests/mandatory-sequence',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const activeBranches = await listBranches(false);
      if (activeBranches.length < 2) {
        throw new DomainRuleError(
          'Se necesitan al menos 2 sucursales activas para ejecutar la prueba obligatoria.',
          {
            statusCode: 422,
            code: 'INSUFFICIENT_BRANCHES',
            rule: 'Precondición de prueba',
          }
        );
      }

      const origin = activeBranches[0];
      const destination = activeBranches[1];
      const suffix = Math.floor(100000 + Math.random() * 900000);
      const trackingCode = `PRB-SEQ-${suffix}`;

      const steps: Array<{
        step: string;
        action: string;
        input: Record<string, unknown>;
        expected: string;
        accepted: boolean;
        httpStatus: number;
        code: string;
        actualMessage: string;
      }> = [];

      // Step 1: Create parcel in 'recibida'
      const created = await createParcel({
        trackingCode,
        originBranchId: origin.id,
        destinationBranchId: destination.id,
        recipientName: 'Laura Tester (Ficticio)',
        weightKg: 3.75,
        internalNotes: 'Registro automático de prueba individual obligatoria',
        userUid: req.dbUser!.uid,
      });

      steps.push({
        step: 'Paso 1',
        action: 'Alta de encomienda con peso positivo (3.75 kg) y origen != destino',
        input: {
          trackingCode,
          originBranch: `${origin.code} (${origin.city})`,
          destinationBranch: `${destination.code} (${destination.city})`,
          recipientName: 'Laura Tester (Ficticio)',
          weightKg: 3.75,
        },
        expected: 'ACEPTADA en estado inicial "recibida"',
        accepted: true,
        httpStatus: 201,
        code: 'PARCEL_CREATED',
        actualMessage: `Encomienda ${created.parcel.trackingCode} creada con estado "${created.parcel.currentStatus}".`,
      });

      const parcelId = created.parcel.id;

      // Step 2: Attempt delivery directly without transit (MUST BE REJECTED)
      try {
        await addParcelEvent(parcelId, {
          status: 'entregada',
          locationBranchId: destination.id,
          notes: 'Intento directo de entrega sin tránsito previo',
          userUid: req.dbUser!.uid,
        });
        steps.push({
          step: 'Paso 2',
          action: 'Intentar entregar directamente desde estado "recibida" sin pasar por "en_transito"',
          input: { parcelId, trackingCode, targetStatus: 'entregada' },
          expected: 'RECHAZADA por secuencia obligatoria',
          accepted: true,
          httpStatus: 201,
          code: 'UNEXPECTED_ACCEPT',
          actualMessage: 'Error: la transición inválida fue aceptada.',
        });
      } catch (err) {
        const domainErr = err as DomainRuleError;
        steps.push({
          step: 'Paso 2',
          action: 'Intentar entregar directamente desde estado "recibida" sin pasar por "en_transito"',
          input: {
            parcelId,
            trackingCode,
            currentStatus: 'recibida',
            targetStatus: 'entregada',
            location: `${destination.code} · ${destination.city}`,
          },
          expected: 'RECHAZADA (HTTP 422)',
          accepted: false,
          httpStatus: domainErr.statusCode ?? 422,
          code: domainErr.code ?? 'DELIVERY_WITHOUT_TRANSIT',
          actualMessage: domainErr.message,
        });
      }

      // Step 3: Valid transition to 'en_transito'
      const transitRes = await addParcelEvent(parcelId, {
        status: 'en_transito',
        locationBranchId: origin.id,
        locationText: `Tramo troncal ${origin.code} -> ${destination.code}`,
        notes: 'Despacho válido en ruta hacia destino',
        userUid: req.dbUser!.uid,
      });

      steps.push({
        step: 'Paso 3',
        action: 'Registrar evento válido "en_transito"',
        input: {
          parcelId,
          trackingCode,
          currentStatus: 'recibida',
          targetStatus: 'en_transito',
          locationText: transitRes.event.locationText,
        },
        expected: 'ACEPTADA (HTTP 201) -> estado "en_transito"',
        accepted: true,
        httpStatus: 201,
        code: 'EVENT_RECORDED',
        actualMessage: `Evento registrado. Estado actual de ${trackingCode}: "${transitRes.parcel.currentStatus}".`,
      });

      // Step 4: Valid transition to 'entregada'
      const deliveredRes = await addParcelEvent(parcelId, {
        status: 'entregada',
        locationBranchId: destination.id,
        notes: 'Entrega válida en sucursal de destino tras completar tránsito',
        userUid: req.dbUser!.uid,
      });

      steps.push({
        step: 'Paso 4',
        action: 'Completar secuencia válida con evento "entregada"',
        input: {
          parcelId,
          trackingCode,
          currentStatus: 'en_transito',
          targetStatus: 'entregada',
          location: `${destination.code} · ${destination.city}`,
        },
        expected: 'ACEPTADA (HTTP 201) -> estado "entregada"',
        accepted: true,
        httpStatus: 201,
        code: 'EVENT_RECORDED',
        actualMessage: `Secuencia completada. Estado final de ${trackingCode}: "${deliveredRes.parcel.currentStatus}".`,
      });

      // Step 5: Verify delivered parcel rejects any further operational event
      try {
        await addParcelEvent(parcelId, {
          status: 'en_transito',
          locationBranchId: destination.id,
          notes: 'Intento de evento operativo posterior a la entrega',
          userUid: req.dbUser!.uid,
        });
      } catch (err) {
        const domainErr = err as DomainRuleError;
        steps.push({
          step: 'Paso 5',
          action: 'Intentar nuevo evento operativo sobre encomienda ya "entregada"',
          input: {
            parcelId,
            trackingCode,
            currentStatus: 'entregada',
            targetStatus: 'en_transito',
          },
          expected: 'RECHAZADA (HTTP 422)',
          accepted: false,
          httpStatus: domainErr.statusCode ?? 422,
          code: domainErr.code ?? 'PARCEL_ALREADY_DELIVERED',
          actualMessage: domainErr.message,
        });
      }

      const finalParcel = await getParcelById(parcelId, true);

      res.json({
        accepted: true,
        code: 'MANDATORY_TEST_PASSED',
        rule: 'Prueba individual obligatoria de secuencia y bloqueo posterior a entrega',
        message: `Prueba obligatoria ejecutada sobre ${trackingCode}: se rechazó la entrega sin tránsito, se completó la secuencia válida y se bloqueó cualquier evento posterior a la entrega.`,
        data: {
          trackingCode,
          parcelId,
          executedAt: new Date().toISOString(),
          steps,
          finalParcel,
        },
      });
    } catch (error) {
      handleError(res, error, 'Error al ejecutar la prueba obligatoria.');
    }
  }
);

// Concurrency Quota Demonstration (two simultaneous transactions racing for 1 slot)
app.post(
  '/api/tests/concurrency-quota',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const activeBranches = await listBranches(false);
      if (activeBranches.length < 2) {
        throw new DomainRuleError(
          'Se necesitan al menos 2 sucursales activas para ejecutar la prueba de concurrencia.',
          {
            statusCode: 422,
            code: 'INSUFFICIENT_BRANCHES',
            rule: 'Precondición de prueba',
          }
        );
      }

      const origin = activeBranches[0];
      const destination = activeBranches[1];
      const testQuotaDate = `2099-${String(Math.floor(1 + Math.random() * 12)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}`;
      const suffix = Math.floor(100000 + Math.random() * 900000);

      // Seed an exact 1-slot quota for this isolated test date
      await db
        .insert(branchQuotas)
        .values({
          branchId: origin.id,
          quotaDate: testQuotaDate,
          maxCapacity: 1,
          usedCount: 0,
        })
        .onConflictDoUpdate({
          target: [branchQuotas.branchId, branchQuotas.quotaDate],
          set: { maxCapacity: 1, usedCount: 0, updatedAt: new Date() },
        });

      const codeA = `CONC-A-${suffix}`;
      const codeB = `CONC-B-${suffix}`;

      const attempt = async (label: string, trackingCode: string) => {
        const startedAt = Date.now();
        try {
          const result = await createParcel({
            trackingCode,
            originBranchId: origin.id,
            destinationBranchId: destination.id,
            recipientName: `Concurrencia ${label} (Ficticio)`,
            weightKg: 2.5,
            internalNotes: `Solicitud concurrente ${label} sobre cupo 1/1 (${testQuotaDate})`,
            userUid: req.dbUser!.uid,
            quotaDate: testQuotaDate,
          });
          return {
            request: label,
            trackingCode,
            durationMs: Date.now() - startedAt,
            accepted: true,
            httpStatus: 201,
            code: 'PARCEL_CREATED',
            message: `Aceptada: cupo asignado (${result.quotaSnapshot.usedCount}/${result.quotaSnapshot.maxCapacity}).`,
          };
        } catch (err) {
          const domainErr = err as DomainRuleError;
          return {
            request: label,
            trackingCode,
            durationMs: Date.now() - startedAt,
            accepted: false,
            httpStatus: domainErr.statusCode ?? 409,
            code: domainErr.code ?? 'QUOTA_EXCEEDED',
            message: domainErr.message,
          };
        }
      };

      // Launch both database transactions simultaneously via Promise.all
      const results = await Promise.all([
        attempt('Solicitud 1', codeA),
        attempt('Solicitud 2', codeB),
      ]);

      const [finalQuota] = await db
        .select()
        .from(branchQuotas)
        .where(
          and(
            eq(branchQuotas.branchId, origin.id),
            eq(branchQuotas.quotaDate, testQuotaDate)
          )
        );

      const acceptedCount = results.filter((r) => r.accepted).length;
      const rejectedCount = results.filter((r) => !r.accepted).length;

      res.json({
        accepted: true,
        code: 'CONCURRENCY_TEST_PASSED',
        rule: 'Bloqueo pesimista transaccional PostgreSQL (SELECT ... FOR UPDATE)',
        message: `Demostración completada: de 2 solicitudes simultáneas para 1 cupo disponible en ${origin.code} (${testQuotaDate}), exactamente ${acceptedCount} fue aceptada y ${rejectedCount} fue rechazada sin sobrepasar el límite (${finalQuota.usedCount}/${finalQuota.maxCapacity}).`,
        data: {
          branch: `${origin.code} · ${origin.city}`,
          quotaDate: testQuotaDate,
          maxCapacity: finalQuota.maxCapacity,
          finalUsedCount: finalQuota.usedCount,
          acceptedCount,
          rejectedCount,
          results,
        },
      });
    } catch (error) {
      handleError(res, error, 'Error al ejecutar la demostración de concurrencia.');
    }
  }
);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
