/** Access operations with explicit state and I/O dependencies. */
export function createPciAccessActions(state, dependencies) {
  const { grant, grantConfig, assignments, notice } = state;
  const { run, call, window } = dependencies;
  async function assign() {
    await run(async() => {
      await call('/administrators', 'POST', { subject: grant.value.subject, configurationIds: grantConfig.value ? [grantConfig.value]:
        null });
      assignments.value = (await call('/administrators')).items;
      notice.value = 'Issuer capability assigned.';
    });
  }
  async function revokeAssignment(a) {
    if (!window.confirm('Revoke this issuer assignment?')) return;
    await run(async() => {
      await call('/administrators/' + a.id, 'DELETE');
      assignments.value = (await call('/administrators')).items;
      notice.value = 'Assignment revoked immediately.';
    });
  }
  return { assign, revokeAssignment };
}
