// SPDX-License-Identifier: Apache-2.0
package participant

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPSourceAuthenticatesAndBindsRecords(t *testing.T) {
	token := strings.Repeat("s", 48)
	mode := "ok"
	calls := 0
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer " + token || r.TLS.Version != tls.VersionTLS13 { t.Error("source authentication or transport failed") }
		var input map[string]string
		if json.NewDecoder(r.Body).Decode(&input) != nil || len(input) != 3 { t.Error("unexpected source payload") }
		if mode == "redirect" { http.Redirect(w, r, "/elsewhere", 307); return }
		subject := input["subject"]; if mode == "wrong" { subject = "another-person" }
		_ = json.NewEncoder(w).Encode(map[string]any{"tenantId":input["tenantId"], "configurationId":input["configurationId"], "subject":subject, "claims":map[string]any{"name":"Synthetic Employee"}})
	}))
	server.TLS = &tls.Config{MinVersion:tls.VersionTLS13}; server.StartTLS(); defer server.Close()
	roots := x509.NewCertPool(); roots.AddCert(server.Certificate())
	lookup, err := HTTPSource(server.URL, token, "alpha", roots); if err != nil { t.Fatal(err) }
	claims, err := lookup(context.Background(), "alpha", "employee", "alice"); if err != nil || claims["name"] != "Synthetic Employee" { t.Fatal(claims, err) }
	if _, err = lookup(context.Background(), "beta", "employee", "alice"); err == nil || calls != 1 { t.Fatal("tenant mismatch reached source") }
	mode="wrong"; if _, err = lookup(context.Background(), "alpha", "employee", "alice"); err == nil { t.Fatal("wrong subject accepted") }
	mode="redirect"; before:=calls; if _, err = lookup(context.Background(), "alpha", "employee", "alice"); err == nil || calls != before+1 { t.Fatal("redirect accepted or followed") }
	if _, err = HTTPSource("http://source.example", token, "alpha", nil); err == nil { t.Fatal("plaintext source accepted") }
}
