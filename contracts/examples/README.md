# Synthetic employee template

The Technical Development Requirements request JSON-LD contexts and SHACL shapes for templates/data. These files document the synthetic employee fields used by the participant test flow. The vocabulary uses reserved example domains and is not an official FACIS, ETSI or production vocabulary.

- `employee-context.jsonld`: term definitions for EmployeeCredential, name, employeeId and department.
- `employee-shapes.ttl`: RDF constraints for one issuer and one named credential subject with required name/employeeId and optional department.
- `employee-credential.json`: unsigned documentation example with an inline context to avoid a second network dependency. It is not an issued or cryptographically valid credential.

For JSON-LD validation, expand using the pinned official VC 1.1 context and the supplied term definitions, then run the resulting RDF through a SHACL validator. Record the processor/context versions and result. No claim of a semantic SHACL/conformance run is made by this source package. Do not add an arbitrary remote JSON-LD resolver to the production PCI flow; such retrieval needs its own trust/availability controls.

The native JWT/SD-JWT path uses declared primitive claims and independent signature/status checks; these examples do not replace that validation or add linked-data signing. A production template needs the participant's reviewed vocabulary/profile. VCDM 2.0/ETSI EAA work is covered by the compliance roadmap.
