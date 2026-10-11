# NATS contracts

The current source-pinned subjects, event types, request/reply fields, nonce/correlation rules and ACL requirements are maintained in [Native OCM contract](native-ocm.md). Source revisions and blob hashes are in `contracts/source-manifest.json`.

Core request/reply carries sensitive issuance data. Do not add durable streams, body capture or debug subscribers for participant payloads. The local fragmented-frame test proves the PCI client against a loopback server; live native NATS acceptance remains separate.
