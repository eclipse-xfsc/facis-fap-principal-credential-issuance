// Copyright (c) 2026 LEANEA GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License, Version 2.0 which is available at
// https://www.apache.org/licenses/LICENSE-2.0.
//
// SPDX-License-Identifier: Apache-2.0

package design

import . "goa.design/goa/v3/dsl"

var _ = API("pci-participant", func() {
 Title("PCI participant data repository")
 Description("Two scoped, mutually authenticated credential data operations.")
})

// Goa generates the service interface and endpoints. The protobuf envelope is
// versioned separately to remain stable when the JSON schema gains fields.
var _ = Service("participant", func() {
 Method("notify", func() {
  Payload(Bytes)
  Result(Bytes)
 })
 Method("get_credential_data", func() {
  Payload(Bytes)
  Result(Bytes)
 })
})
