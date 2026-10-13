import { runtime } from '../config/runtime.js';
import { store } from '../state/store.js';
import { decodeHttpResponse, reduceUiMessage, responseError, normalizeUiError } from '../state/reducers.js';

const bridgePending = new Map();
let bridgeClient, bridgeGrant, bridgeBootstrap, bridgeStarted = false, bridgeWasReady = false;
let bridgeReadyWaiters = [], bridgeGeneration = 0, bridgeConnectedSocket = null;
const bridgeReconnectListeners = new Set();

function bridgeFailure(message, code = 'PCI-UI-DISCONNECTED') {
  return responseError({code, detail:message, category:'system', retryable:true}, 503);
}
function finishBridgeRequest(id, result) {
  const entry = bridgePending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer); bridgePending.delete(id); delete store.ui.jobs[id];
  store.ui.pending = bridgePending.size;
  if (result.error) entry.reject(result.error); else entry.resolve(result.data);
}
function receiveBridgeMessage(message) {
  const envelope = message?.payload;
  const entry = bridgePending.get(envelope?.requestId);
  const result = reduceUiMessage(envelope, entry);
  if (result && !result.event) finishBridgeRequest(envelope.requestId, result);
}
function bridgeSocketId() { return bridgeClient?._socket?.id; }

async function authorizeBridge() {
  if (bridgeGrant && bridgeGrant.expiresAt > Date.now() + 15000) return bridgeGrant;
  if (bridgeBootstrap) return bridgeBootstrap;
  const generation = bridgeGeneration;
  bridgeBootstrap = (async () => {
    const grant = await decodeHttpResponse(await fetch(runtime.apiBasePath + '/auth/bridge', {
      method:'POST', credentials:'include', headers:{accept:'application/json','content-type':'application/json'},
      body:JSON.stringify({socketId:bridgeSocketId()}),
    }));
    if (generation !== bridgeGeneration) throw bridgeFailure('Connection changed. Reconnect and refresh the current state.');
    if (!grant?.token || !Number.isFinite(grant.expiresAt)) throw bridgeFailure('The server could not establish a browser session.','PCI-UI-PROTOCOL');
    bridgeGrant = grant;
    return grant;
  })();
  try { return await bridgeBootstrap; } finally { if (generation === bridgeGeneration) bridgeBootstrap = null; }
}

function connectionChanged(connected) {
  if (!connected) {
    bridgeConnectedSocket = null;
    bridgeGeneration++; bridgeGrant = null; bridgeBootstrap = null;
    store.live.connected = false;
    for (const id of [...bridgePending.keys()]) finishBridgeRequest(id,{error:bridgeFailure('Connection interrupted. Refresh to check the operation before retrying.')});
    return;
  }
  const socketId = bridgeSocketId();
  if (store.live.connected && bridgeConnectedSocket === socketId) return;
  bridgeConnectedSocket = socketId;
  store.live.connected = true;
  for (const waiter of bridgeReadyWaiters.splice(0)) waiter();
  if (bridgeWasReady) {
    store.live.restoring = true;
    void authorizeBridge().then(() => Promise.all([...bridgeReconnectListeners].map(fn => fn())))
      .catch(error => { store.errors.global = normalizeUiError(error); })
      .finally(() => { store.live.restoring = false; });
  }
  bridgeWasReady = true;
}

export function initializeBridge() {
  if (bridgeStarted) return;
  bridgeClient = window.uibuilder;
  if (!bridgeClient?.onChange || !bridgeClient?.send) throw bridgeFailure('The browser connection is unavailable. Reload this page.');
  bridgeStarted = true;
  bridgeClient.onChange('msg', receiveBridgeMessage);
  bridgeClient.onChange('ioConnected', connectionChanged);
  // Register observers before starting; connected is only set on an actual ack.
  bridgeClient.start();
  if (bridgeClient.get?.('ioConnected') === true) connectionChanged(true);
}

export function onBridgeReconnect(callback) {
  bridgeReconnectListeners.add(callback);
  return () => bridgeReconnectListeners.delete(callback);
}

export async function sendCommand(path, options = {}, action = 'request') {
  initializeBridge();
  if (!store.live.connected) await new Promise((resolve,reject) => {
    const ready = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { bridgeReadyWaiters = bridgeReadyWaiters.filter(fn => fn !== ready); reject(bridgeFailure('The connection is unavailable. Reload this page to reconnect.')); },10000);
    bridgeReadyWaiters.push(ready);
  });
  const grant = await authorizeBridge();
  const requestId = crypto.randomUUID();
  const payload = {path, method:options.method || 'GET', body:options.body ? JSON.parse(options.body) : {}, headers:options.headers || {}};
  const command = { version:1, type:'command', action, requestId, sessionId:grant.sessionId,
    payload, meta:{bridgeToken:grant.token} };
  return new Promise((resolve,reject) => {
    const entry = {requestId,action,path,resolve,reject,timer:setTimeout(() => finishBridgeRequest(requestId,{error:bridgeFailure('The operation has not returned. Refresh to check its state before retrying.','PCI-UI-TIMEOUT')}),120000)};
    bridgePending.set(requestId,entry); store.ui.pending = bridgePending.size;
    try {
      const encoded = JSON.stringify(payload), size = 128000;
      if (encoded.length <= size) bridgeClient.send({payload:command});
      else {
        const total = Math.ceil(encoded.length / size);
        for (let index=0; index<total; index++) bridgeClient.send({payload:{...command,payload:encoded.slice(index*size,(index+1)*size),meta:{...command.meta,chunk:{index,total}}}});
      }
    } catch { finishBridgeRequest(requestId,{error:bridgeFailure('The command could not be sent. Reconnect before retrying.')}); }
  });
}

export const bridgePing = () => sendCommand('', {}, 'ping');
