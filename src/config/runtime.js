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
import { normalizeBasePath, uiPath, withBasePath } from "../../shared/public-url.js";
export function inferBasePathFromUiLocation(pathname) {
  const value = String(pathname || "");
  const match = /^(.*)\/ui(?:\/.*)?$/.exec(value);
  if (!match) throw new Error(`The PCI UI must be served from /ui/ under the configured ORCE base path; received ${value || "<empty>"}`);
  return normalizeBasePath(match[1]);
}
const inferredBasePath = inferBasePathFromUiLocation(window.location.pathname);
export const runtime = {
  basePath: inferredBasePath,
  uiPath: uiPath(inferredBasePath),
  apiBasePath: withBasePath("/api/v1", inferredBasePath),
  configured: false,
  version: "__FAP_PCI_VERSION__",
};
export function applyPublicConfiguration(configuration) {
  const configuredBasePath = normalizeBasePath(configuration && configuration.orceBasePath !== undefined ? configuration.orceBasePath: "");
  if (configuredBasePath !== runtime.basePath) {
    throw new Error(`Public base-path mismatch: browser resolved ${runtime.basePath || "/"}, server configured ${configuredBasePath || "/"}`);
  }
  const configuredUiPath = String(configuration.uiPath || uiPath(configuredBasePath));
  if (configuredUiPath !== uiPath(configuredBasePath)) throw new Error("The server returned an inconsistent PCI UI path.");
  runtime.basePath = configuredBasePath;
  runtime.uiPath = configuredUiPath;
  runtime.apiBasePath = String(configuration.apiBasePath || withBasePath("/api/v1", configuredBasePath));
  runtime.configured = true;
  return runtime;
}
