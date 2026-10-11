# 0.5.0-rc.12 neutral source revision

The package retains the rc.12 application version and native signer fix. Operator-specific names and deployment values are replaced by neutral examples throughout documentation, source helpers and test fixtures. The wallet helper requires explicit issuer, tenant UUID, credential-configuration UUID and synthetic-data acknowledgement; gateway pinning is optional. Upgrade helper defaults use a neutral working directory. The reserved operator namespace example is neutralized in the lifecycle guard and its existing regression.

The documentation entry points now distinguish the current artifact-only upgrade from initial deployment. Historical guides label documentation-only domains and IPs. Specification PDFs have document metadata removed, with unchanged text and pixel-identical rendering verified on all 35 pages; their original and revised hashes are recorded in the specification manifest. Source and artifact hash inventories are regenerated after all edits.

[neutral-validation.json](neutral-validation.json) records checks executed for this revision. [validation.json](validation.json) records the current offline suite. Local documentation checks validate requirement IDs, technical-clause references, specification hashes, API routes/examples, navigation targets and relative file links. Documentation checks do not imply external URL reachability, cluster deployment or live wallet acceptance. Any unexecuted check remains listed in the reports.

Use [neutral configuration](../operations/neutral-configuration.md) to supply deployment values and [the current upgrade](../operations/upgrade-0.5.0-rc.12.md) to install an already prepared instance. Keep private inputs outside this package.
