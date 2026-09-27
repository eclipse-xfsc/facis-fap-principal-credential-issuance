-- Additive SR2 migration, embedded verbatim in the single ground-zero artifact.
-- Each independently versioned issuer object is one row; no tenant-wide config blob.
CREATE TABLE IF NOT EXISTS pci_issuer_resources (
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
 kind TEXT NOT NULL CHECK(kind IN ('metadata','branding','configuration','flow','connector','asset','settings')),
 resource_id UUID NOT NULL,
 configuration_id UUID,
 identifier TEXT,
 document JSONB NOT NULL,
 PRIMARY KEY(tenant_id,kind,resource_id),
 UNIQUE(tenant_id,kind,identifier)
);
CREATE TABLE IF NOT EXISTS pci_issuer_versions (
 tenant_id UUID NOT NULL,
 kind TEXT NOT NULL,
 resource_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 snapshot JSONB NOT NULL,
 content_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,kind,resource_id,version),
 FOREIGN KEY(tenant_id,kind,resource_id) REFERENCES pci_issuer_resources(tenant_id,kind,resource_id)
);
CREATE TABLE IF NOT EXISTS pci_issuer_assignments (
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
 assignment_id UUID NOT NULL,
 subject TEXT NOT NULL,
 configuration_ids JSONB NOT NULL,
 revoked BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,assignment_id)
);
CREATE INDEX IF NOT EXISTS pci_assignments_subject ON pci_issuer_assignments(tenant_id,subject) WHERE revoked=false;
CREATE TABLE IF NOT EXISTS pci_issuance_requests (
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
 request_id UUID NOT NULL,
 configuration_id UUID NOT NULL,
 subject_hash TEXT NOT NULL,
 idempotency_hash TEXT NOT NULL,
 state TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 document JSONB NOT NULL,
 PRIMARY KEY(tenant_id,request_id),
 UNIQUE(tenant_id,idempotency_hash)
);
CREATE INDEX IF NOT EXISTS pci_requests_expiry ON pci_issuance_requests(tenant_id,expires_at);
CREATE TABLE IF NOT EXISTS pci_credential_events (
 event_id BIGSERIAL PRIMARY KEY,
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
 configuration_id UUID,
 request_id UUID,
 subject_hash TEXT,
 event_type TEXT NOT NULL,
 actor_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pci_events_history ON pci_credential_events(tenant_id,configuration_id,event_id DESC);
CREATE TABLE IF NOT EXISTS pci_reissuance_blocks (
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id), configuration_id UUID NOT NULL, subject_hash TEXT NOT NULL,
 PRIMARY KEY(tenant_id,configuration_id,subject_hash)
);
CREATE TABLE IF NOT EXISTS pci_rate_limits (
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id), bucket TEXT NOT NULL, window_start BIGINT NOT NULL, count INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,bucket,window_start)
);
CREATE TABLE IF NOT EXISTS pci_registration_rates (
 bucket_hash TEXT PRIMARY KEY, window_start BIGINT NOT NULL, count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pci_metadata_publication (
 tenant_id UUID PRIMARY KEY REFERENCES tenants(tenant_id), desired BIGINT NOT NULL DEFAULT 0, observed BIGINT NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'draft', error_code TEXT, last_attempt TIMESTAMPTZ, last_success TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pci_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pci_schema_migrations WHERE version='0.4.0-delegations') THEN
  INSERT INTO pci_issuer_assignments(tenant_id,assignment_id,subject,configuration_ids)
  SELECT tenant_id,gen_random_uuid(),keycloak_subject,'null'::jsonb FROM tenant_members
  WHERE enabled AND roles ? 'issuer_admin';
  INSERT INTO pci_schema_migrations(version) VALUES('0.4.0-delegations');
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS pci_status_allocations (
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id), request_id UUID NOT NULL, configuration_id UUID NOT NULL,
 status_hash TEXT NOT NULL, handle TEXT NOT NULL,
 PRIMARY KEY(tenant_id,request_id), UNIQUE(tenant_id,status_hash), UNIQUE(tenant_id,handle)
);
CREATE TABLE IF NOT EXISTS pci_participant_circuits (
 tenant_id UUID NOT NULL REFERENCES tenants(tenant_id), connector_id UUID NOT NULL,
 document JSONB NOT NULL, PRIMARY KEY(tenant_id,connector_id)
);
