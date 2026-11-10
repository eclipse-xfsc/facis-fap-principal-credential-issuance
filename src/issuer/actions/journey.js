/** Journey operations with explicit state and I/O dependencies. */
export function createPciJourneyActions(state, dependencies) {
  const { journey, tab, offer, notice, answers, consent } = state;
  const { request, window, call, run, crypto, props } = dependencies;
  // Persist only the selected tab and opaque server request identifier.
  const recoveryKey = 'fap-pci-workspace:' + props.tenant.tenantId + ':' + props.session.subject;
  const recovery = (() => {
    try {
      return JSON.parse(window.sessionStorage?.getItem(recoveryKey) || 'null');
    } catch {
      return null;
    }
  })();
  if (recovery?.tab) tab.value = recovery.tab;
  let requestToRestore = /^[a-f0-9-]{36}$/i.test(recovery?.requestId || '') ? recovery.requestId: null;
  function rememberWorkspace() {
    requestToRestore = journey.value?.request?.requestId || null;
    try {
      window.sessionStorage?.setItem(recoveryKey, JSON.stringify({ tab: tab.value, requestId: requestToRestore }));
    } catch {}
  }
  async function restoreJourney() {
    const id = journey.value?.request?.requestId || requestToRestore;
    if (!id) return;
    try {
      const restored = await call('/issuance-requests/' + encodeURIComponent(id));
      if (restored.request.expiresAt <= Date.now()) {
        journey.value = null;
        offer.value = null;
        requestToRestore = null;
        notice.value = 'Your previous request expired. Choose a credential to start again.';
        rememberWorkspace();
        return;
      }
      journey.value = restored;
      if (restored.request.errorCode === 'PCI-SR2-INPUT-LOST') {
        answers.value = {};
        consent.value = false;
        offer.value = null;
        notice.value = restored.request.state === 'journey' ? 'Your previous form answers were cleared. Enter them again to continue.':
          'Your form answers are no longer available. Start a new credential request.';
        rememberWorkspace();
        return;
      }
      if (!offer.value && restored.request.state !== 'journey') {
        const issuedMessage = 'Your credential has been issued. Check your wallet.';
        const pendingMessage = 'Previous request: ' + restored.request.state +
          '. The offer is not stored in this browser. Refresh to check its status or start a new request.';
        notice.value = restored.request.state === 'issued' ? issuedMessage: pendingMessage;
      }
      rememberWorkspace();
    } catch (e) {
      if ([401, 403, 404, 410].includes(e.status)) {
        journey.value = null;
        offer.value = null;
        requestToRestore = null;
        rememberWorkspace();
        notice.value = 'The previous request is no longer available to this account. Start a new request.';
      } else throw e;
    }
  }
  async function start(id) {
    await run(async() => {
      offer.value = null;
      journey.value = await call('/issuance-requests', 'POST', { configurationId: id }, null, { 'idempotency-key': crypto.randomUUID() });
      answers.value = {};
      consent.value = false;
      tab.value = 'request';
      rememberWorkspace();
    });
  }
  async function next() {
    await run(async() => {
      journey.value = await call('/issuance-requests/' + journey.value.request.requestId + '/advance', 'POST', { step: journey.value.request
        .step, consent: consent.value, values: answers.value });
      answers.value = {};
      consent.value = false;
      rememberWorkspace();
    });
  }
  async function prepareOffer() {
    await run(async() => {
      offer.value = await call('/issuance-requests/' + journey.value.request.requestId + '/offer', 'POST');
      await restoreJourney();
    });
  }
  return { rememberWorkspace, restoreJourney, start, next, prepareOffer, recovery };
}
