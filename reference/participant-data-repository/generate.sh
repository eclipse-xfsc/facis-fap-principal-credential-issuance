#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v protoc >/dev/null
go run goa.design/goa/v3/cmd/goa@v3.28.0 gen github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/reference/participant-data-repository/design
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
PATH="$(go env GOPATH)/bin:$PATH" protoc -I ../../contracts --go_out=. --go_opt=module=github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/reference/participant-data-repository --go-grpc_out=. --go-grpc_opt=module=github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/reference/participant-data-repository ../../contracts/participant.proto
cp cmd/server/main.go.in cmd/server/main.go
go mod tidy
go test -tags=generated ./...
