# Contributing to TextPrompts

Thank you for considering contributing to TextPrompts! This document outlines the development workflow and guidelines.

## Development Setup

### Prerequisites

- Python 3.11+ 
- [uv](https://docs.astral.sh/uv/) package manager
- Make (comes with most Unix systems)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/svilupp/textprompts.git
cd textprompts

# Set up development environment
make dev-setup

# Run all checks
make check
```

## Development Workflow

### Available Commands

Run `make help` to see all available commands:

```bash
make help                 # Show available commands
make install             # Install package in development mode
make install-dev         # Install with all dev dependencies

# Code Quality
make lint                # Run linting checks
make format              # Format code with ruff
make typecheck           # Run type checking with mypy

# Testing
make test                # Run tests
make test-cov            # Run tests with coverage
make test-examples       # Test example scripts

# All-in-one
make check               # Run lint + typecheck + test + examples
make ci                  # Same as check (for CI)
make pre-commit          # Run pre-commit checks

# Build & Publish
make build               # Build package for distribution
make publish-test        # Publish to Test PyPI
make publish             # Publish to PyPI

# Documentation
make docs-install        # Install documentation dependencies  
make docs-serve          # Serve docs locally
make docs-build          # Build documentation

# Maintenance
make clean               # Clean build artifacts
make all                 # Full setup and check
```

### Code Style

We use automated code formatting and linting:

- **Ruff** for linting and formatting
- **MyPy** for type checking
- **Pytest** for testing

Format your code before submitting:

```bash
make format
```

### Testing

Write tests for new features:

```bash
# Run tests
make test

# Run with coverage
make test-cov

# Test examples work
make test-examples
```

Tests are located in `tests/` and follow pytest conventions.

### Type Hints

TextPrompts is fully typed. All public APIs must include type hints:

```python
from typing import Optional
from pathlib import Path

def load_prompt(path: str | Path, *, skip_meta: bool = False) -> Prompt:
    """Load a single prompt file."""
    ...
```

Run type checking:

```bash
make typecheck
```

## Pull Request Guidelines

1. **Fork and branch**: Create a feature branch from `main`
2. **Write tests**: Add tests for new functionality
3. **Run checks**: Ensure `make check` passes
4. **Update docs**: Update documentation if needed
5. **Write clear commits**: Use descriptive commit messages
6. **Small PRs**: Keep changes focused and small

### PR Checklist

- [ ] `make check` passes (lint, typecheck, tests, examples)
- [ ] New features have tests
- [ ] Documentation updated if needed
- [ ] Commit messages are clear
- [ ] No breaking changes (or clearly documented)

## Code Organization

```
textprompts/
├── __init__.py          # Public API exports
├── models.py            # Pydantic models (Prompt, PromptMeta)
├── safe_string.py       # SafeString class
├── loaders.py           # Main loading functions
├── _parser.py           # Internal parsing logic
├── errors.py            # Exception classes
├── cli.py               # Command-line interface
└── py.typed             # Type hints marker

tests/
├── test_loaders.py      # Test loading functionality
├── test_safe_string.py  # Test SafeString class
└── test_edge_cases.py   # Test edge cases and errors

examples/
├── basic_usage.py       # Comprehensive usage examples
├── simple_format_demo.py # SafeString demonstration
└── pydantic_ai_example.py # Integration example

docs/                    # Documentation site
├── index.md
├── getting-started.md
├── api-reference.md
└── ...
```

## Design Principles

TextPrompts follows these principles:

1. **Simplicity**: Simple APIs, minimal magic
2. **Reliability**: Fail fast with clear error messages  
3. **Type Safety**: Full type hints and validation
4. **Zero Dependencies**: Only Pydantic for validation
5. **Backward Compatibility**: Changes should be additive

### Adding Features

Before adding new features, consider:

- Does this solve a common problem (not edge cases)?
- Can it be implemented simply?
- Does it maintain backward compatibility?
- Are there alternatives using existing features?

## CI/CD

### GitHub Actions

We use GitHub Actions for CI:

- **Test**: Runs on multiple Python versions and OS
- **Lint & Type Check**: Code quality checks
- **Documentation**: Builds and deploys docs
- **Build**: Creates distribution packages

All checks must pass before merging.

### Pre-commit Hooks

Set up pre-commit hooks for automatic checks:

```bash
# Install pre-commit
uv pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

Or use the Makefile:

```bash
make pre-commit
```

## Documentation

### Code Documentation

- Use clear docstrings for all public functions
- Include parameter types and descriptions
- Add usage examples for complex features
- Keep docstrings concise but complete

### User Documentation

Documentation is in `docs/` using Jekyll/GitHub Pages:

- `docs/index.md` - Main landing page
- `docs/getting-started.md` - Tutorial
- `docs/api-reference.md` - Complete API docs
- `docs/examples.md` - Usage examples
- `docs/integrations.md` - Framework integrations

Serve locally:

```bash
make docs-serve
```

## Release Process

1. Update version in `pyproject.toml`
2. Update `CHANGELOG.md` (if we add one)
3. Ensure all tests pass: `make check`
4. Build package: `make build`
5. Test with Test PyPI: `make publish-test`
6. Create GitHub release
7. Publish to PyPI: `make publish`

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues and PRs
- Ask questions in discussions
- Review the documentation

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help maintain a welcoming environment
- Follow GitHub's community guidelines

Thank you for contributing to TextPrompts! 🎉