import fs from 'node:fs';
import { stripModuleSyntax } from '../../tools/lib/module-source.mjs';
import { PCI_ISSUER_MODULES } from '../../tools/lib/bundle-inputs.mjs';
export function issuerSource() {
  return PCI_ISSUER_MODULES.map(file =>
    stripModuleSyntax(fs.readFileSync(file, 'utf8'), file)).join('\n');
}
