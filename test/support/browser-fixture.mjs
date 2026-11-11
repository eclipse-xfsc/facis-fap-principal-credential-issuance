// Copyright (c) 2026 LEANEA GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License, Version 2.0 which is available at
// https://www.apache.org/licenses/LICENSE-2.0.
//
// SPDX-License-Identifier: Apache-2.0
//
// Prepared with AI-assisted tools and reviewed by the author.
// Assisted-by: AI
// Local development fixture only. No real identity, wallet, cluster or database.
// Always binds loopback; every restart discards the synthetic in-memory state.
import fs from 'node:fs';
import http from 'node:http';
import { stripModuleSyntax } from '../../tools/lib/module-source.mjs';
import { issuerSource } from './ui-source.mjs';
import { fixture, alpha } from './sr2-fixture.mjs';
import { httpHarness } from './sr2-http.mjs';
export async function createBrowserFixtureServer({ port = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('Invalid local preview port');
  const f = fixture(),
  dispatch = httpHarness(f);
  await f.prepared();
  const tenant = {
    tenantId: alpha,
    organizationName: 'Alpha',
    primaryDomain: 'alpha-pci.example.com',
    state: 'active'
  },
  principal = f.principal();
  const version = fs.readFileSync('VERSION', 'utf8').trim();
  const source = file => stripModuleSyntax(fs.readFileSync(file, 'utf8'), file).replaceAll('__FAP_PCI_VERSION__', version);
  const server = http.createServer(async(req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture');
      if (url.pathname === '/pci-orce/ui/') {
        const view = ['tenant', 'provider', 'registration', 'welcome'].includes(url.searchParams.get('view')) ? url.searchParams.get(
          'view'): 'tenant';
        const session = view === 'provider' ? { subject: 'provider', username: 'Provider', roles: ['provider_admin'] }: view === 'tenant' ?
          principal: null;
        const tenantData = ['tenant', 'welcome'].includes(view) ? tenant: null;
        const script = `const {createApp,ref,computed,onMounted,onUnmounted,reactive}=Vue;
const runtime={basePath:'/pci-orce',apiBasePath:'/pci-orce/api/v1',uiPath:'/pci-orce/ui/'};
const applyPublicConfiguration=()=>{};const completeLoginFromLocation=async()=>null;const beginLogin=async()=>{};
const onBridgeReconnect=()=>()=>{};const initializeBridge=()=>{store.live.connected=true;};const bridgePing=async()=>({pong:true});
${source('src/state/store.js')}
${source('src/state/reducers.js')}
${source('src/components/feedback.js')}
const request=async(path,options={})=>{
  const response=await fetch(path,{...options,headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});
  return decodeHttpResponse(response);};
const api={
  registrationConfig:async()=>({orceBasePath:'/pci-orce',registrationMode:'public',hostnameTemplate:'{slug}-pci.example.com'}),
  session:async()=>({session:${JSON.stringify(session)}}),
  tenantContext:async()=>{const tenant=${JSON.stringify(tenantData)};if(!tenant)throw Object.assign(Error('No tenant'),
  {status:404});return {tenant};},tenantMembers:async()=>({items:[{subject:'principal',username:'Principal',enabled:true,roles:['principal']}]}),
  platformStatus:async()=>({ready:true}),
  registrations:async()=>({items:[]}),
  tenants:async()=>({items:[]})};
${source('src/qr-tables.js')}
${source('src/qr.js')}
${issuerSource()}
${source('src/main.js')}`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PCI offline UI regression</title>
<style>${fs.readFileSync('src/styles.css','utf8')}</style></head>
<body><div id="app"></div>
<script>${fs.readFileSync('vendor/vue.global.prod.js','utf8')}</script>
<script>${script}</script></body></html>`);
      }
      if (url.pathname === '/pci-orce/ui/facis-logo.svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.end(fs.readFileSync('src/assets/facis-logo.svg'));
      }
      if (url.pathname.endsWith('/identity-provider')) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          item: {
            version: 1,
            state: 'active',
            mode: 'keycloak',
            displayName: 'Organization account',
            issuer: '',
            clientId: '',
            audience: '',
            scopes: 'openid profile email'
          },
          redirectUri: 'https://identity.example.com/broker/endpoint'
        }));
      }
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }
      let body = '';
      for await(const chunk of req) body += chunk;
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => ['content-type', 'if-match', 'idempotency-key']
        .includes(name)));
      const result = await dispatch(req.url, { method: req.method, body: body || undefined, headers });
      res.writeHead(result.status, { 'Content-Type': 'application/json', ...result.headers });
      res.end(JSON.stringify(result.body));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: error.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
