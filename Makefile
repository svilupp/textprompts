.PHONY: help install install-dev lint format format-check typecheck test test-cov clean build publish docs docs-serve all check ex-test ex-check ex-docs ex-test-examples test-examples-ai ts-test ts-typecheck ts-lint ts-format-check ts-check
.DEFAULT_GOAL := help

# Colors for terminal output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

# Run a command quietly: suppress stdout+stderr on exit code 0,
# print the full captured output and propagate the exit code on failure.
# Usage: $(call quiet, some command here)
define quiet
@out=$$(mktemp); \
if $(strip $(1)) > $$out 2>&1; then \
	rm -f $$out; \
else \
	rc=$$?; cat $$out; rm -f $$out; exit $$rc; \
fi
endef

help: ## Show this help message
	@echo "$(BLUE)TextPrompts Development Commands$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

install: ## Install package in development mode
	@echo "$(BLUE)Installing package...$(RESET)"
	uv sync

install-dev: ## Install package with all development dependencies
	@echo "$(BLUE)Installing package with dev dependencies...$(RESET)"
	uv sync --all-extras --dev

lint: ## Run linting checks
	@echo "$(BLUE)Running linting checks...$(RESET)"
	$(call quiet, uv run ruff check .)
	@echo "$(GREEN)✓ Linting passed$(RESET)"

format: ## Format code with ruff
	@echo "$(BLUE)Formatting code...$(RESET)"
	uv run ruff format .
	uv run ruff check --fix .
	@echo "$(GREEN)✓ Code formatted$(RESET)"

format-check: ## Check formatting without mutating (quiet unless it fails)
	@echo "$(BLUE)Checking formatting...$(RESET)"
	$(call quiet, uv run ruff format --check .)
	@echo "$(GREEN)✓ Formatting OK$(RESET)"

typecheck: ## Run type checking with ty
	@echo "$(BLUE)Running type checks...$(RESET)"
	$(call quiet, uv run ty check src)
	@echo "$(GREEN)✓ Type checking passed$(RESET)"

test: ## Run tests
	@echo "$(BLUE)Running tests...$(RESET)"
	$(call quiet, uv run python -m pytest tests/)
	@echo "$(GREEN)✓ All tests passed$(RESET)"

test-cov: ## Run tests with coverage
	@echo "$(BLUE)Running tests with coverage...$(RESET)"
	$(call quiet, uv run python -m pytest tests/ --cov=textprompts --cov-report=term-missing --cov-report=html)
	@echo "$(GREEN)✓ Tests with coverage completed$(RESET)"

test-examples: ## Test offline example scripts
	@echo "$(BLUE)Testing offline example scripts...$(RESET)"
	$(call quiet, uv run python examples/simple_format_demo.py)
	$(call quiet, uv run python examples/basic_usage.py)
	$(call quiet, uv run python examples/pydantic_ai_example.py)
	@echo "$(GREEN)✓ Offline examples work$(RESET)"

# Runs examples that require provider credentials
# OPENAI_API_KEY must be present.
test-examples-ai: ## Test AI SDK example scripts (requires OPENAI_API_KEY)
	@echo "$(BLUE)Testing AI example scripts...$(RESET)"
	@if [ -z "$$OPENAI_API_KEY" ]; then \
		echo "$(YELLOW)Skipping AI examples: OPENAI_API_KEY is not set$(RESET)"; \
	else \
		out=$$(mktemp); \
		if TEXTPROMPTS_EXAMPLE_REAL_AI=1 uv run --group test python examples/pydantic_ai_example.py > $$out 2>&1; then \
			rm -f $$out; \
			echo "$(GREEN)✓ AI examples work$(RESET)"; \
		else \
			rc=$$?; cat $$out; rm -f $$out; exit $$rc; \
		fi; \
	fi

clean: ## Clean build artifacts and cache
	@echo "$(BLUE)Cleaning build artifacts...$(RESET)"
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf .pytest_cache/
	rm -rf .ty_cache/
	rm -rf .ruff_cache/
	rm -rf htmlcov/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	@echo "$(GREEN)✓ Cleaned$(RESET)"

build: ## Build package for distribution
	@echo "$(BLUE)Building package...$(RESET)"
	rm -rf dist/
	uv build
	@echo "$(GREEN)✓ Package built$(RESET)"

publish-test: build ## Publish to Test PyPI
	@echo "$(BLUE)Publishing to Test PyPI...$(RESET)"
	uv publish --publish-url https://test.pypi.org/legacy/
	@echo "$(GREEN)✓ Published to Test PyPI$(RESET)"

publish: build ## Publish to PyPI
	@echo "$(BLUE)Publishing to PyPI...$(RESET)"
	uv publish
	@echo "$(GREEN)✓ Published to PyPI$(RESET)"

docs-install: ## Install documentation dependencies
	@echo "$(BLUE)Installing documentation dependencies...$(RESET)"
	cd docs && bundle install
	@echo "$(GREEN)✓ Documentation dependencies installed$(RESET)"

docs-serve: ## Serve documentation locally
	@echo "$(BLUE)Serving documentation at http://localhost:4000$(RESET)"
	cd docs && bundle exec jekyll serve --livereload

docs-build: ## Build documentation
	@echo "$(BLUE)Building documentation...$(RESET)"
	cd docs && bundle exec jekyll build
	@echo "$(GREEN)✓ Documentation built$(RESET)"

check: lint format-check typecheck test test-examples ## Run all checks (lint, format, typecheck, test, examples)
	@echo "$(GREEN)✓ All checks passed!$(RESET)"

all: clean install-dev check build ## Full development setup and check
	@echo "$(GREEN)✓ Full development setup completed!$(RESET)"

ex-test: ## Run Elixir port tests
	@echo "$(BLUE)Running Elixir package tests...$(RESET)"
	cd packages/textprompts-ex && mix test
	@echo "$(GREEN)✓ Elixir tests passed$(RESET)"

ex-check: ## Run Elixir pre-release gate (format, compile, credo, tests, dialyzer)
	@echo "$(BLUE)Running Elixir package checks...$(RESET)"
	cd packages/textprompts-ex && mix deps.get
	cd packages/textprompts-ex && mix format --check-formatted
	cd packages/textprompts-ex && mix compile --warnings-as-errors
	cd packages/textprompts-ex && mix credo --strict || echo "$(YELLOW)credo reported issues (non-fatal)$(RESET)"
	cd packages/textprompts-ex && mix test --include parity
	cd packages/textprompts-ex && mix dialyzer || echo "$(YELLOW)dialyzer reported issues (non-fatal)$(RESET)"
	@echo "$(GREEN)✓ Elixir checks passed$(RESET)"

ex-docs: ## Build Elixir docs
	@echo "$(BLUE)Building Elixir docs...$(RESET)"
	cd packages/textprompts-ex && mix docs
	@echo "$(GREEN)✓ Elixir docs built$(RESET)"

ts-typecheck: ## Run TypeScript type checks
	@echo "$(BLUE)Running TS type checks...$(RESET)"
	$(call quiet, cd packages/textprompts-ts && npm run typecheck)
	@echo "$(GREEN)✓ TS type checking passed$(RESET)"

ts-format-check: ## Check TypeScript formatting (Biome)
	@echo "$(BLUE)Checking TS formatting...$(RESET)"
	$(call quiet, cd packages/textprompts-ts && npm run format:check)
	@echo "$(GREEN)✓ TS formatting OK$(RESET)"

ts-lint: ## Run TypeScript lint (Biome + oxlint)
	@echo "$(BLUE)Running TS lint...$(RESET)"
	$(call quiet, cd packages/textprompts-ts && npm run lint:check)
	@echo "$(GREEN)✓ TS lint passed$(RESET)"

ts-test: ## Run TypeScript tests (bun)
	@echo "$(BLUE)Running TS tests...$(RESET)"
	$(call quiet, cd packages/textprompts-ts && bun test)
	@echo "$(GREEN)✓ TS tests passed$(RESET)"

ts-check: ts-typecheck ts-format-check ts-lint ts-test ## Run all TypeScript checks (PR gate)
	@echo "$(GREEN)✓ All TS checks passed!$(RESET)"

ex-test-examples: ## Run all Elixir example scripts
	@echo "$(BLUE)Running Elixir example scripts...$(RESET)"
	cd packages/textprompts-ex && mix run examples/basic_load.exs \
		&& mix run examples/format_with_placeholders.exs \
		&& mix run examples/sections_toc.exs \
		&& mix run examples/round_trip.exs
	@echo "$(GREEN)✓ Elixir examples passed$(RESET)"

# Development workflow targets
dev-setup: install-dev ## Set up development environment
	@echo "$(GREEN)✓ Development environment ready!$(RESET)"
	@echo "$(YELLOW)Next steps:$(RESET)"
	@echo "  make check    # Run all checks"
	@echo "  make test     # Run tests"
	@echo "  make format   # Format code"

ci: check ## Run CI checks (same as check but with different name for clarity)
	@echo "$(GREEN)✓ CI checks completed!$(RESET)"

pre-commit: format lint typecheck test ## Run pre-commit checks
	@echo "$(GREEN)✓ Pre-commit checks passed!$(RESET)"

# Version management
version-patch: ## Bump patch version
	@echo "$(BLUE)Bumping patch version...$(RESET)"
	@echo "$(YELLOW)Note: Manual version bump required in pyproject.toml$(RESET)"

version-minor: ## Bump minor version
	@echo "$(BLUE)Bumping minor version...$(RESET)"
	@echo "$(YELLOW)Note: Manual version bump required in pyproject.toml$(RESET)"

version-major: ## Bump major version
	@echo "$(BLUE)Bumping major version...$(RESET)"
	@echo "$(YELLOW)Note: Manual version bump required in pyproject.toml$(RESET)"
