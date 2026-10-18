# Participant credential formats

Reusable Go definitions and serialization for JWT W3C credentials and SD-JWT (`vc+sd-jwt`, `dc+sd-jwt`). `Encode` takes the issuer, principal, holder binding, status, configuration and a signing callback. The participant repository supplies the official Crypto Provider Core gRPC signer. This package has no network calls or private-key storage.

The selected native OCM baseline uses the W3C VC 1.1 JWT representation. VCDM 2.0 and an ETSI EAA profile require the profile changes in [the compliance roadmap](../../../docs/security/compliance-roadmap.md); this package does not claim ETSI conformance. FR-23 recommends those profiles and an XFSC contribution. The reusable source is included in this official XFSC PCI repository. Its build and tests are covered by the participant CI job; contribution review follows the project process.

Run `go test ./credential` from the parent Go module. The tests check format bindings, one signing operation and SD-JWT disclosure digests. They do not replace PCM interoperability or an independent conformance suite.
