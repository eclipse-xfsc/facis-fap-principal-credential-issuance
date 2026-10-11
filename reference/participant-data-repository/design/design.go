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
