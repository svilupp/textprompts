.PHONY: all build test lint fmt clean help

# Default target
all: lint test build

# Build the package
build:
	go build -v ./...

# Run tests
test:
	go test -v -race ./...

# Run tests with coverage
test-cover:
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Run short tests
test-short:
	go test -short -v ./...

# Run benchmarks
bench:
	go test -bench=. -benchmem ./...

# Run linter
lint:
	golangci-lint run

# Format code
fmt:
	go fmt ./...
	goimports -w .

# Tidy dependencies
tidy:
	go mod tidy

# Verify go.mod is tidy
verify:
	go mod tidy
	git diff --exit-code go.mod go.sum

# Clean build artifacts
clean:
	rm -f coverage.out coverage.html
	go clean -cache -testcache

# Show help
help:
	@echo "Available targets:"
	@echo "  all        - Run lint, test, and build (default)"
	@echo "  build      - Build the package"
	@echo "  test       - Run tests with race detection"
	@echo "  test-cover - Run tests with coverage report"
	@echo "  test-short - Run short tests only"
	@echo "  bench      - Run benchmarks"
	@echo "  lint       - Run golangci-lint"
	@echo "  fmt        - Format code"
	@echo "  tidy       - Tidy go.mod"
	@echo "  verify     - Verify go.mod is tidy"
	@echo "  clean      - Clean build artifacts"
	@echo "  help       - Show this help"
