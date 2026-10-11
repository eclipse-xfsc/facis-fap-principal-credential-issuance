# Semantic template export

An authorized tenant administrator or currently assigned issuer can select a configuration and use **Export semantic template**. The authenticated API is:

```text
GET /api/v1/tenants/{tenantId}/credential-configurations/{configurationId}/semantic-template
```

The normal ORCE base path prefixes this route. The response identifies the current draft version and contains a self-contained JSON-LD 1.1 context, JSON Schema for its claim object, SHACL shapes in Turtle, and an unsigned synthetic example. No employee record, participant token or issued credential is retrieved to produce it. Revoked issuer assignments and cross-tenant requests are denied.

Every configured string, boolean or number gets a vocabulary term and matching constraints. Required claims have minimum cardinality one; optional claims can be absent. Strings are bounded to 2,000 characters and all fields have maximum cardinality one. Numbers accept RDF integer, decimal or double values. The subject JSON Schema rejects undeclared fields. SHACL validates the issuer, subject and declared properties; it is not a closed-world replacement for the JSON Schema.

For linked-data credentials, claim terms are scoped to `credentialSubject.pciClaims`; other exports use a semantic subject view, so a claim named `issuer` or `type` cannot redefine the credential envelope. The generated vocabulary is an identifier under the tenant issuer URL; no remote resolver or public vocabulary endpoint is required by the inline context. Its existence is not a claim that a vocabulary document is hosted there.

Exporting does not change the published credential, its context, signing format or pinned in-flight request. For SD-JWT, the export represents the semantic view of disclosed data. It does not add linked-data signing or advertise additional presentation formats.

The [employee reference files](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/blob/main/contracts/examples/README.md) remain a standalone synthetic template. Client-provided production templates, identifiers and vocabulary need the client's review; no official FACIS or ETSI semantics are claimed.

Local tests cover deterministic field mapping, scope collisions, required/type constraints and current tenant/delegation authority. JSON-LD expansion and semantic SHACL engine validation remain unexecuted here. Run them with the approved processor/context versions and retain the result before accepting a production template.

rc.5 LDP metadata, internal signing, participant Core signing and the exported
example use the identical context and configuration-specific vocabulary. The
claim-object JSON Schema applies to `pciClaims`. The LDP SHACL subject shape
requires that claims node. Published legacy LDP catalogues are marked pending
once during schema upgrade and must be read back with the new context. Run
`test/live/semantic-validation.py` for independent expansion and positive/negative
SHACL checks; the CI job installs its exact processor versions.
