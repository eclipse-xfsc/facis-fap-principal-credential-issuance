if(msg.pciAction==='presentation.respond')return handlePciPresentationResponse();
if(String(msg.pciAction || '').startsWith('native.'))return handlePciNative();
if(msg.pciAction==='sr2.maintenance')return handleSr2Maintenance();
// M11_PCI-IssuerRuntime
return handleSr2(["presentation.configurations", "presentation.start", "presentation.result", "issuance.eligible", "issuance.start", "issuance.get", "issuance.advance", "issuance.offer", "internal.offer-create", "internal.offer-get", "internal.callback", "internal.plugin-put", "internal.plugin-delete", "internal.metadata-publish", "internal.publication-status"]);
