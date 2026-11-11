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
/** Keep UI progress accurate across overlapping operations and nested refreshes. */
export function createPciOperationRunner(state, normalizeError, recoverInput) {
  let pending = 0;
  return async function run(operation) {
    pending += 1;
    state.busy.value = true;
    state.notice.value = '';
    try {
      return await operation();
    } catch (error) {
      state.error.value = normalizeError(error);
      if (error?.code === 'PCI-SR2-INPUT-LOST') {
        try {
          await recoverInput();
        } catch {
          /* Keep the original error visible if recovery also fails. */
        }
      }
    } finally {
      pending -= 1;
      state.busy.value = pending > 0;
    }
  };
}
