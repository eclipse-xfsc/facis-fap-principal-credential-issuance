SHELL := /usr/bin/env bash
.DEFAULT_GOAL := check

.PHONY: build test test-static test-bdd test-integration check shellcheck json-check security-audit clean

build:
	npm run build

test:
	npm test

test-static:
	npm run test:static

test-bdd:
	npm run test:bdd

test-integration:
	npm run test:integration

shellcheck:
	@for file in automation/stage1/*.sh; do bash -n "$$file"; done
	@echo "Shell syntax: PASS"

json-check:
	@node -e 'const fs=require("fs"); JSON.parse(fs.readFileSync("dist/fap-pci-flow.json","utf8")); JSON.parse(fs.readFileSync("docs/api/openapi.json","utf8")); console.log("JSON parse: PASS")'

security-audit:
	npm run security:audit

check: build test-static test-bdd test-integration shellcheck json-check security-audit

clean:
	rm -rf .build

.PHONY: check-offline
check-offline:
	npm run test:offline
