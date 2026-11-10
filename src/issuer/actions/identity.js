/** Identity operations with explicit state and I/O dependencies. */
export function createPciIdentityActions(state, dependencies) {
  const { identity, identityRedirect, identityForm, notice, keyName, keyType } = state;
  const { call, run } = dependencies;
  async function loadIdentity() {
    const r = await call('/identity-provider');
    identity.value = r.item;
    identityRedirect.value = r.redirectUri;
    for (const key of ['mode', 'displayName', 'issuer', 'clientId', 'audience', 'scopes']) identityForm.value[key] = r.item[key];
    identityForm.value.clientSecret = '';
  }
  async function saveIdentity() {
    await run(async() => {
      try {
        const data = { ...identityForm.value };
        if (!data.clientSecret) delete data.clientSecret;
        await call('/identity-provider', 'PUT', data, identity.value.version);
        notice.value = 'Identity provider configured. Sign in again to use it.';
      } finally {
        identityForm.value.clientSecret = '';
        await loadIdentity();
      }
    });
  }
  async function createKey() {
    await run(async() => {
      await call('/issuer-keys', 'POST', { name: keyName.value, type: keyType.value });
      notice.value = 'TSA key created. Use its name in the credential configuration.';
    });
  }
  return { loadIdentity, saveIdentity, createKey };
}
