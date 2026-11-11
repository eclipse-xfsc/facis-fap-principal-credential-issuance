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
/** Presentation operations with explicit state and I/O dependencies. */
export function createPciPresentationActions(state, dependencies) {
  const {
    presentationResult,
    presentationCode,
    presentation,
    presentationConfig,
    presentationProfile,
    tab
  } = state;
  const { run, call, window } = dependencies;
  const presentationReturn = new URLSearchParams(((window.location.hash || '').startsWith('#/presentation?') ? window.location.hash.split(
    '?')[1]: ''));
  if (presentationReturn.get('request') && presentationReturn.get('response_code')) {
    presentation.value = { requestId: presentationReturn.get('request') };
    presentationCode.value = presentationReturn.get('response_code');
    tab.value = 'presentation';
    window.history.replaceState({}, '', window.location.pathname + '#/presentation');
  }
  async function startPresentation() {
    await run(async() => {
      presentationResult.value = null;
      presentationCode.value = '';
      presentation.value = await call('/presentation-requests', 'POST', { configurationId: presentationConfig
        .value, profile: presentationProfile.value });
    });
  }
  async function checkPresentation() {
    await run(async() => {
      presentationResult.value = await call('/presentation-requests/' + presentation.value.requestId + '/result', 'POST', presentationCode
        .value ? { responseCode: presentationCode.value }: {});
      if (presentationResult.value.status === 'verified') presentationCode.value = '';
    });
  }
  return { startPresentation, checkPresentation };
}
