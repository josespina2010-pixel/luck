import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const USER_ROLES = ['admin', 'consulta'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PARCEL_STATUSES = ['recibida', 'en_transito', 'entregada'] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  role: text('role').$type<UserRole>().notNull().default('consulta'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const branches = pgTable('branches', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  city: text('city').notNull(),
  name: text('name').notNull(),
  dailyDispatchQuota: integer('daily_dispatch_quota').notNull().default(25),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const branchQuotas = pgTable(
  'branch_quotas',
  {
    id: serial('id').primaryKey(),
    branchId: integer('branch_id')
      .references(() => branches.id, { onDelete: 'cascade' })
      .notNull(),
    quotaDate: text('quota_date').notNull(), // YYYY-MM-DD
    maxCapacity: integer('max_capacity').notNull(),
    usedCount: integer('used_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('branch_quotas_branch_date_idx').on(table.branchId, table.quotaDate),
  ]
);

export const parcels = pgTable('parcels', {
  id: serial('id').primaryKey(),
  trackingCode: text('tracking_code').notNull().unique(),
  originBranchId: integer('origin_branch_id')
    .references(() => branches.id)
    .notNull(),
  destinationBranchId: integer('destination_branch_id')
    .references(() => branches.id)
    .notNull(),
  recipientName: text('recipient_name').notNull(),
  weightKg: doublePrecision('weight_kg').notNull(),
  currentStatus: text('current_status').$type<ParcelStatus>().notNull().default('recibida'),
  internalNotes: text('internal_notes').notNull().default(''),
  createdByUid: text('created_by_uid').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const parcelEvents = pgTable('parcel_events', {
  id: serial('id').primaryKey(),
  parcelId: integer('parcel_id')
    .references(() => parcels.id, { onDelete: 'cascade' })
    .notNull(),
  eventDate: timestamp('event_date', { withTimezone: true }).defaultNow().notNull(),
  locationBranchId: integer('location_branch_id').references(() => branches.id),
  locationText: text('location_text').notNull(),
  status: text('status').$type<ParcelStatus>().notNull(),
  notes: text('notes').notNull().default(''),
  recordedByUid: text('recorded_by_uid').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const branchesRelations = relations(branches, ({ many }) => ({
  originParcels: many(parcels, { relationName: 'originBranch' }),
  destinationParcels: many(parcels, { relationName: 'destinationBranch' }),
  quotas: many(branchQuotas),
  events: many(parcelEvents),
}));

export const branchQuotasRelations = relations(branchQuotas, ({ one }) => ({
  branch: one(branches, {
    fields: [branchQuotas.branchId],
    references: [branches.id],
  }),
}));

export const parcelsRelations = relations(parcels, ({ one, many }) => ({
  originBranch: one(branches, {
    fields: [parcels.originBranchId],
    references: [branches.id],
    relationName: 'originBranch',
  }),
  destinationBranch: one(branches, {
    fields: [parcels.destinationBranchId],
    references: [branches.id],
    relationName: 'destinationBranch',
  }),
  events: many(parcelEvents),
}));

export const parcelEventsRelations = relations(parcelEvents, ({ one }) => ({
  parcel: one(parcels, {
    fields: [parcelEvents.parcelId],
    references: [parcels.id],
  }),
  locationBranch: one(branches, {
    fields: [parcelEvents.locationBranchId],
    references: [branches.id],
  }),
}));
