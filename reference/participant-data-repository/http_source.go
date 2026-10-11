// SPDX-License-Identifier: Apache-2.0
package participant

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// HTTPSource is the participant-owned record store. It receives only the
// authenticated tenant, configuration and subject, never an access token or VC.
// The supplied ORCE flow implements this contract for synthetic test records.
func HTTPSource(endpoint, token, tenantID string, roots *x509.CertPool) (Lookup, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || len(token) < 32 || strings.ContainsAny(token, "\r\n") || tenantID == "" {
		return nil, errors.New("invalid participant record source configuration")
	}
	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS13, MaxVersion: tls.VersionTLS13, RootCAs: roots},
			MaxIdleConns: 4, MaxConnsPerHost: 8, IdleConnTimeout: 30 * time.Second,
		},
	}
	return func(ctx context.Context, tenant, configuration, subject string) (map[string]any, error) {
		if tenant != tenantID || configuration == "" || subject == "" {
			return nil, errors.New("record scope rejected")
		}
		body, _ := json.Marshal(map[string]string{"tenantId": tenant, "configurationId": configuration, "subject": subject})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil { return nil, errors.New("record request unavailable") }
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Authorization", "Bearer " + token)
		res, err := client.Do(req)
		if err != nil { return nil, errors.New("record source unreachable") }
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK { return nil, errors.New("record source rejected request") }
		data, err := io.ReadAll(io.LimitReader(res.Body, 65537))
		if err != nil || len(data) > 65536 { return nil, errors.New("invalid record response size") }
		var record struct {
			TenantID string `json:"tenantId"`
			ConfigurationID string `json:"configurationId"`
			Subject string `json:"subject"`
			Claims map[string]any `json:"claims"`
		}
		decoder := json.NewDecoder(bytes.NewReader(data)); decoder.DisallowUnknownFields()
		if decoder.Decode(&record) != nil || record.TenantID != tenant || record.ConfigurationID != configuration || record.Subject != subject || record.Claims == nil {
			return nil, errors.New("record response scope rejected")
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF { return nil, errors.New("invalid record response") }
		return record.Claims, nil
	}, nil
}
