GO ?= go

GOLANGCI_LINT_VERSION ?= v1.62.2
GOVULNCHECK_VERSION ?= latest

GOPATH_DIR := $(shell $(GO) env GOPATH 2>/dev/null)
ifeq ($(strip $(GOPATH_DIR)),)
GOPATH_BIN := $(HOME)/go/bin
else
GOPATH_BIN := $(GOPATH_DIR)/bin
endif

GOLANGCI_LINT := $(shell command -v golangci-lint 2>/dev/null || echo "$(GOPATH_BIN)/golangci-lint")
GOIMPORTS := $(shell command -v goimports 2>/dev/null || echo "$(GOPATH_BIN)/goimports")
GOVULNCHECK := $(shell command -v govulncheck 2>/dev/null || echo "$(GOPATH_BIN)/govulncheck")

.PHONY: all build clean test test-verbose test-cover test-short bench fmt fmt-check \
	lint vet vuln tidy verify check setup help

all: check build

build:
	$(GO) build -trimpath ./...

test:
	$(GO) test -race -shuffle=on -count=1 ./...

test-verbose:
	$(GO) test -v -race -shuffle=on -count=1 ./...

test-cover:
	$(GO) test -race -shuffle=on -count=1 -covermode=atomic -coverprofile=coverage.out ./...
	$(GO) tool cover -func=coverage.out

test-short:
	$(GO) test -short -race -shuffle=on -count=1 ./...

bench:
	$(GO) test -run=^$$ -bench=. -benchmem ./...

fmt:
	@find . -path './.tooling' -prune -o -name '*.go' -print0 | xargs -0 gofmt -w
	@command -v "$(GOIMPORTS)" >/dev/null 2>&1 || { echo "goimports not found. Run 'make setup' first."; exit 1; }
	@find . -path './.tooling' -prune -o -name '*.go' -print0 | xargs -0 "$(GOIMPORTS)" -w

fmt-check:
	@files="$$(find . -path './.tooling' -prune -o -name '*.go' -print | xargs gofmt -l)"; \
	if [ -n "$$files" ]; then \
		echo "gofmt needs to be run on:"; \
		echo "$$files"; \
		exit 1; \
	fi
	@test -x "$(GOIMPORTS)" || { echo "goimports not found. Run 'make setup' first."; exit 1; }
	@files="$$(find . -path './.tooling' -prune -o -name '*.go' -print | xargs "$(GOIMPORTS)" -l)"; \
	if [ -n "$$files" ]; then \
		echo "goimports needs to be run on:"; \
		echo "$$files"; \
		exit 1; \
	fi

vet:
	$(GO) vet ./...

lint:
	@test -x "$(GOLANGCI_LINT)" || { echo "golangci-lint not found. Run 'make setup' first."; exit 1; }
	"$(GOLANGCI_LINT)" run

vuln:
	@test -x "$(GOVULNCHECK)" || { echo "govulncheck not found. Run 'make setup' first."; exit 1; }
	"$(GOVULNCHECK)" ./...

tidy:
	$(GO) mod tidy

verify:
	$(GO) mod tidy -diff

check: fmt-check verify vet lint vuln test
	@echo "All checks passed!"

setup:
	@echo "Installing golangci-lint $(GOLANGCI_LINT_VERSION)..."
	$(GO) install github.com/golangci/golangci-lint/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)
	@echo "Installing goimports..."
	$(GO) install golang.org/x/tools/cmd/goimports@latest
	@echo "Installing govulncheck..."
	$(GO) install golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION)
	@echo "Setup complete. Tools installed to $(GOPATH_BIN)"
	@echo "Make sure $(GOPATH_BIN) is in your PATH"

clean:
	rm -f coverage.out
	$(GO) clean -cache -testcache

help:
	@echo "Available targets:"
	@echo "  setup        - Install dev tools (golangci-lint, goimports, govulncheck)"
	@echo "  build        - Build the package"
	@echo "  test         - Run tests with race detection"
	@echo "  test-verbose - Run tests with -v -race"
	@echo "  test-cover   - Run tests with coverage summary"
	@echo "  test-short   - Run short tests"
	@echo "  bench        - Run benchmarks"
	@echo "  fmt          - Format code (gofmt + goimports)"
	@echo "  fmt-check    - Fail if formatting changes are needed"
	@echo "  vet          - Run go vet"
	@echo "  lint         - Run golangci-lint"
	@echo "  vuln         - Run govulncheck"
	@echo "  tidy         - Tidy go.mod/go.sum"
	@echo "  verify       - Fail if go.mod/go.sum are not tidy"
	@echo "  check        - Run strict maintainer checks"
	@echo "  clean        - Remove test/build artifacts"
