-- "Mi escritorio": cada persona reclama un escritorio del mapa y lo decora.
-- Un escritorio tiene un solo dueño y cada persona tiene un solo escritorio.
CREATE TABLE IF NOT EXISTS desks (
  desk_id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL
);

-- Quién ya recibió su escritorio automático (por su equipo en Airtable), para
-- no volver a asignarle uno si después lo suelta.
CREATE TABLE IF NOT EXISTS desk_auto (
  email TEXT PRIMARY KEY,
  assigned_at BIGINT NOT NULL
);
