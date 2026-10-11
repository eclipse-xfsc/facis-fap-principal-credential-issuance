import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http2 from 'node:http2';
import { spawnSync } from 'node:child_process';
import { pciGrpc, pciProtoEnvelope, pciDecodeEnvelope } from '../../../backend/sr2/wire.js';

test('participant transport exchanges protobuf frames over real HTTP/2 mTLS and enforces deadlines/status', async t => {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = pair.privateKey.export({ format: 'pem', type: 'pkcs8' });
  const created = spawnSync('bash', ['-c', 'cat | openssl req -new -x509 -key /dev/stdin -subj /CN=participant.example.com -addext subjectAltName=DNS:participant.example.com -days 1'], { input: key });
  assert.equal(created.status, 0, 'OpenSSL must be installed for the transport gate');
  const cert = created.stdout;
  const material = { key, cert, ca: cert, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', rejectUnauthorized: true };
  const server = http2.createSecureServer({ ...material, requestCert: true });
  const sockets = new Set();
  server.on('session', session => { sockets.add(session); session.on('close', () => sockets.delete(session)); });
  server.on('tlsClientError', () => {});
  let mode = 'ok', calls = 0;
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {});
    assert.equal(stream.session.socket.authorized, true);
    assert.equal(stream.session.socket.getProtocol(), 'TLSv1.3');
    assert.equal(headers[':path'], '/participant.v1.Participant/Notify');
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => {
      const frame = Buffer.concat(chunks);
      assert.equal(frame.readUInt32BE(1), frame.length - 5);
      const input = pciDecodeEnvelope(frame.subarray(5));
      assert.equal(input.tenantId, 'tenant-a'); calls++;
      if (mode === 'timeout') return;
      const payload = pciProtoEnvelope({ requestId: input.requestId, accepted: true });
      const prefix = Buffer.alloc(5); prefix.writeUInt32BE(payload.length, 1);
      stream.respond({ ':status': 200, 'content-type': 'application/grpc+proto' }, { waitForTrailers: true });
      stream.on('wantTrailers', () => stream.sendTrailers({ 'grpc-status': mode === 'error' ? '7' : '0' }));
      stream.end(Buffer.concat([prefix, payload]));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)); });
  const connector = { endpoint: `https://participant.example.com:${server.address().port}` };
  const address = { address: '127.0.0.1', servername: 'participant.example.com' };
  const invoke = deadline => pciGrpc(connector, material, address, 'Notify', { tenantId: 'tenant-a', requestId: 'one' }, deadline);
  assert.deepEqual(await invoke(Date.now() + 3000), { requestId: 'one', accepted: true });
  mode = 'error'; await assert.rejects(() => invoke(Date.now() + 3000));
  mode = 'timeout'; await assert.rejects(() => invoke(Date.now() + 100), {status:504,code:"PCI-PARTICIPANT-DEADLINE"});
  assert.equal(calls, 3);
});
