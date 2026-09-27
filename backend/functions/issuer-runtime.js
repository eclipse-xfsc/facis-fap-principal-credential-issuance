if(msg.pciAction==='sr2.maintenance')return handleSr2Maintenance();
// M11_PCI-IssuerRuntime
return handleSr2(["issuance.eligible", "issuance.start", "issuance.get", "issuance.advance", "issuance.offer", "internal.offer-create", "internal.offer-get", "internal.callback", "internal.plugin-put", "internal.plugin-delete", "internal.metadata-publish", "internal.publication-status"]);
