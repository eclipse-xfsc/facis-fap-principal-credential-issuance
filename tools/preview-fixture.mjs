// NOT a production server. Fixtures have synthetic users and no authentication.
import { createBrowserFixtureServer } from '../test/support/browser-fixture.mjs';
const port = Number(process.env.PCI_PREVIEW_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port from 1024 through 65535');
const server = await createBrowserFixtureServer({ port });
console.log(`Local FIXTURE preview: http://127.0.0.1:${server.address().port}/pci-orce/ui/`);
console.log('Synthetic data only. Not ORCE, Keycloak, PostgreSQL, OCM or MS2 acceptance. Keep loopback-only.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
