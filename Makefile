.PHONY: help install install-dev lint format typecheck test test-cov clean build publish docs docs-serve all check
.DEFAULT_GOAL := help

# Colors for terminal output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

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
	uv run ruff check .
	@echo "$(GREEN)✓ Linting passed$(RESET)"

format: ## Format code with ruff
	@echo "$(BLUE)Formatting code...$(RESET)"
	uv run ruff format .
	uv run ruff check --fix .
	@echo "$(GREEN)✓ Code formatted$(RESET)"

typecheck: ## Run type checking with mypy
	@echo "$(BLUE)Running type checks...$(RESET)"
	uv run mypy src
	@echo "$(GREEN)✓ Type checking passed$(RESET)"

test: ## Run tests
	@echo "$(BLUE)Running tests...$(RESET)"
	uv run pytest tests/ -v
	@echo "$(GREEN)✓ All tests passed$(RESET)"

test-cov: ## Run tests with coverage
	@echo "$(BLUE)Running tests with coverage...$(RESET)"
	uv run pytest tests/ --cov=textprompts --cov-report=term-missing --cov-report=html
	@echo "$(GREEN)✓ Tests with coverage completed$(RESET)"

test-examples: ## Test example scripts
	@echo "$(BLUE)Testing example scripts...$(RESET)"
	uv run python examples/simple_format_demo.py > /dev/null
	uv run python examples/basic_usage.py > /dev/null
	uv run python examples/pydantic_ai_example.py > /dev/null
	@echo "$(GREEN)✓ All examples work$(RESET)"

clean: ## Clean build artifacts and cache
	@echo "$(BLUE)Cleaning build artifacts...$(RESET)"
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf .pytest_cache/
	rm -rf .mypy_cache/
	rm -rf .ruff_cache/
	rm -rf htmlcov/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	@echo "$(GREEN)✓ Cleaned$(RESET)"

build: ## Build package for distribution
	@echo "$(BLUE)Building package...$(RESET)"
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

check: lint typecheck test test-examples ## Run all checks (lint, typecheck, test, examples)
	@echo "$(GREEN)✓ All checks passed!$(RESET)"

all: clean install-dev check build ## Full development setup and check
	@echo "$(GREEN)✓ Full development setup completed!$(RESET)"

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