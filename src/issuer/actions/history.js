/** History operations with explicit state and I/O dependencies. */
export function createPciHistoryActions(state, dependencies) {
  const { historyConfig, search, history, nextCursor, notice } = state;
  const { run, call, window } = dependencies;
  async function loadHistory(append = false) {
    await run(async() => {
      if (!historyConfig.value) return;
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(search.value)) if (v) q.set(k, ['from', 'to'].includes(k) ? new Date(v).toISOString(): v);
      const r = await call('/credential-configurations/' + historyConfig.value + '/history?' + q);
      history.value = append ? [...history.value, ...r.items]: r.items;
      nextCursor.value = r.nextCursor;
    });
  }
  async function revoke(requestId) {
    if (!window.confirm('Revoke this credential through its status provider? This cannot be undone.')) return;
    await run(async() => {
      await call('/credential-configurations/' + historyConfig.value + '/revocations', 'POST', { requestId, confirmed: true });
      notice.value = 'Status provider confirmed revocation.';
    });
    await loadHistory();
  }
  return { loadHistory, revoke };
}
