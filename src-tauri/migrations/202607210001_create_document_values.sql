CREATE TABLE qextrai.document_value_sets (
  id TEXT PRIMARY KEY,
  document_fingerprint TEXT NOT NULL,
  template_id TEXT NOT NULL REFERENCES qextrai.document_templates(id) ON DELETE CASCADE,
  template_revision BIGINT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_value_sets_id_not_empty_check CHECK (length(btrim(id)) > 0),
  CONSTRAINT document_value_sets_fingerprint_check CHECK (document_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT document_value_sets_template_revision_check CHECK (template_revision >= 1),
  CONSTRAINT document_value_sets_revision_check CHECK (revision >= 1),
  CONSTRAINT document_value_sets_document_template_key UNIQUE (document_fingerprint, template_id)
);

CREATE TABLE qextrai.document_field_values (
  value_set_id TEXT NOT NULL REFERENCES qextrai.document_value_sets(id) ON DELETE CASCADE,
  template_field_id TEXT NOT NULL,
  field_definition_id TEXT NOT NULL REFERENCES qextrai.field_definitions(id),
  raw_value TEXT NOT NULL,
  edited_value TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_field_values_source_check CHECK (source IN ('pdfText', 'manual')),
  CONSTRAINT document_field_values_status_check CHECK (status IN ('ready', 'empty')),
  CONSTRAINT document_field_values_raw_value_size_check CHECK (octet_length(raw_value) <= 65536),
  CONSTRAINT document_field_values_edited_value_size_check CHECK (octet_length(edited_value) <= 65536),
  CONSTRAINT document_field_values_set_template_field_key UNIQUE (value_set_id, template_field_id)
);

CREATE INDEX document_value_sets_template_id_idx ON qextrai.document_value_sets (template_id);
CREATE INDEX document_field_values_template_field_id_idx ON qextrai.document_field_values (template_field_id);
