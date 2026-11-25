-- Esquema PostgreSQL compatible con Supabase / PostgreSQL estándar
-- Tablas: users, branches, branch_quotas, parcels, parcel_events

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'consulta' CHECK (role IN ('admin', 'consulta')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  daily_dispatch_quota INTEGER NOT NULL DEFAULT 25 CHECK (daily_dispatch_quota > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branch_quotas (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quota_date TEXT NOT NULL,
  max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branch_quotas_branch_date_idx UNIQUE (branch_id, quota_date)
);

CREATE TABLE IF NOT EXISTS parcels (
  id SERIAL PRIMARY KEY,
  tracking_code TEXT NOT NULL UNIQUE,
  origin_branch_id INTEGER NOT NULL REFERENCES branches(id),
  destination_branch_id INTEGER NOT NULL REFERENCES branches(id),
  recipient_name TEXT NOT NULL,
  weight_kg DOUBLE PRECISION NOT NULL CHECK (weight_kg > 0),
  current_status TEXT NOT NULL DEFAULT 'recibida' CHECK (current_status IN ('recibida', 'en_transito', 'entregada')),
  internal_notes TEXT NOT NULL DEFAULT '',
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parcels_origin_diff_dest CHECK (origin_branch_id <> destination_branch_id)
);

CREATE TABLE IF NOT EXISTS parcel_events (
  id SERIAL PRIMARY KEY,
  parcel_id INTEGER NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location_branch_id INTEGER REFERENCES branches(id),
  location_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recibida', 'en_transito', 'entregada')),
  notes TEXT NOT NULL DEFAULT '',
  recorded_by_uid TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
