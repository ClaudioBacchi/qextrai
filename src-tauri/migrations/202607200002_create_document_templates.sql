CREATE TABLE qextrai.document_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  revision BIGINT NOT NULL DEFAULT 1,
  source_page_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_templates_id_not_empty_check CHECK (length(btrim(id)) > 0),
  CONSTRAINT document_templates_name_not_empty_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT document_templates_normalized_name_not_empty_check CHECK (length(btrim(normalized_name)) > 0),
  CONSTRAINT document_templates_revision_check CHECK (revision >= 1),
  CONSTRAINT document_templates_source_page_count_check CHECK (source_page_count >= 1)
);

CREATE TABLE qextrai.document_template_fields (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES qextrai.document_templates(id) ON DELETE CASCADE,
  field_definition_id TEXT NOT NULL REFERENCES qextrai.field_definitions(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL,
  CONSTRAINT document_template_fields_id_not_empty_check CHECK (length(btrim(id)) > 0),
  CONSTRAINT document_template_fields_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT document_template_fields_template_definition_key UNIQUE (template_id, field_definition_id)
);

CREATE TABLE qextrai.document_template_regions (
  id TEXT PRIMARY KEY,
  template_field_id TEXT NOT NULL REFERENCES qextrai.document_template_fields(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  width DOUBLE PRECISION NOT NULL,
  height DOUBLE PRECISION NOT NULL,
  CONSTRAINT document_template_regions_id_not_empty_check CHECK (length(btrim(id)) > 0),
  CONSTRAINT document_template_regions_page_number_check CHECK (page_number >= 1),
  CONSTRAINT document_template_regions_x_check CHECK (x >= 0 AND x <= 1),
  CONSTRAINT document_template_regions_y_check CHECK (y >= 0 AND y <= 1),
  CONSTRAINT document_template_regions_width_check CHECK (width > 0 AND width <= 1),
  CONSTRAINT document_template_regions_height_check CHECK (height > 0 AND height <= 1),
  CONSTRAINT document_template_regions_x_bounds_check CHECK (x + width <= 1),
  CONSTRAINT document_template_regions_y_bounds_check CHECK (y + height <= 1)
);

CREATE TABLE qextrai.document_template_bindings (
  document_fingerprint TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES qextrai.document_templates(id) ON DELETE CASCADE,
  document_size BIGINT NOT NULL,
  page_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_template_bindings_fingerprint_check CHECK (document_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT document_template_bindings_document_size_check CHECK (document_size >= 0),
  CONSTRAINT document_template_bindings_page_count_check CHECK (page_count >= 1)
);

CREATE INDEX document_template_fields_template_id_idx ON qextrai.document_template_fields (template_id);
CREATE INDEX document_template_fields_field_definition_id_idx ON qextrai.document_template_fields (field_definition_id);
CREATE INDEX document_template_regions_template_field_id_idx ON qextrai.document_template_regions (template_field_id);
CREATE INDEX document_template_bindings_template_id_idx ON qextrai.document_template_bindings (template_id);
