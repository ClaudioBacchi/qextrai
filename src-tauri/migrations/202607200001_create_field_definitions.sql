CREATE SCHEMA IF NOT EXISTS qextrai;

CREATE TABLE qextrai.field_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  value_type TEXT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT field_definitions_normalized_name_key UNIQUE (normalized_name),
  CONSTRAINT field_definitions_kind_check CHECK (kind IN ('single', 'list', 'table')),
  CONSTRAINT field_definitions_value_type_check CHECK (
    value_type IS NULL OR value_type IN ('text', 'number', 'date', 'datetime', 'money', 'boolean')
  ),
  CONSTRAINT field_definitions_shape_check CHECK (
    (kind IN ('single', 'list') AND value_type IS NOT NULL)
    OR (kind = 'table' AND value_type IS NULL)
  ),
  CONSTRAINT field_definitions_revision_check CHECK (revision > 0),
  CONSTRAINT field_definitions_name_not_empty_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT field_definitions_normalized_name_not_empty_check CHECK (length(btrim(normalized_name)) > 0)
);
