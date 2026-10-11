# Security Policy

This source package is a Sprint Review artifact and has not completed production security acceptance.

## Reporting

Do not publish exploitable findings, credentials, verification links, cluster addresses, private keys, or personal data in a public issue. Report through the client/project security channel selected before repository contribution.

## Review-scope limitations

- Provider and provisioner authentication are static bearer-token adapters, not final IAM.
- Mailpit is a review mail sink, not a production email provider.
- No tenant deletion path is exposed.
- OCM W-Stack references are read-only and integration is not claimed as tested.
- NetworkPolicy is disabled by default because cluster DNS/API/gateway details must be supplied per environment.
- TLS termination and certificates are owned by the existing Gateway/environment for this review slice.
- npm transitive dependencies were not locked or scanned in the restricted build environment.

## Supported source version

Only `0.1.0-sr1` is represented by this archive. It is not a long-term supported release.
