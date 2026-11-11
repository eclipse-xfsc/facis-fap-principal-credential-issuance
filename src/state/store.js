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
import { reactive } from "vue";
export const store = reactive({
  session: null,
  step: null,
  model: { tenant: null, platform: null },
  ui: { busy: false, jobs: {}, pending: 0, notice: '' },
  errors: { global: null },
  live: { connected: false, restoring: false },
  get tenant() {
    return this.model.tenant;
  },
  set tenant(value) {
    this.model.tenant = value;
  },
  get platform() {
    return this.model.platform;
  },
  set platform(value) {
    this.model.platform = value;
  },
  get busy() {
    return this.ui.busy;
  },
  set busy(value) {
    this.ui.busy = value;
  },
});
