# Changelog

All notable changes to the textprompts TypeScript package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

#### BREAKING: Default metadata mode changed from IGNORE to ALLOW

The default metadata handling mode has been changed from `MetadataMode.IGNORE` to `MetadataMode.ALLOW` to provide a better out-of-box experience for newcomers.

**Previous behavior (v0.2.0 and earlier):**
- Default: `MetadataMode.IGNORE` - metadata was not parsed by default
- Users had to explicitly enable metadata parsing with `setMetadata(MetadataMode.ALLOW)`

**New behavior (v0.3.0+):**
- Default: `MetadataMode.ALLOW` - metadata is parsed if present, no error if absent
- More intuitive for new users - "just works" with or without metadata
- Reduces friction when getting started with the library

**Migration guide:**

If you relied on the default IGNORE behavior, you can restore it by explicitly setting the mode:

```typescript
import { setMetadata, MetadataMode } from "textprompts";

// Restore previous default behavior
setMetadata(MetadataMode.IGNORE);
```

Or set the environment variable:
```bash
export TEXTPROMPTS_METADATA_MODE=ignore
```

**Rationale:**
The ALLOW mode is more beginner-friendly as it:
- Parses metadata when present (no configuration needed)
- Doesn't fail when metadata is missing or incomplete
- Removes friction for newcomers trying the library

### Added

#### Dual ESM and CJS build support

The package now ships with both ESM and CommonJS builds, ensuring compatibility with all Node.js projects.

**What changed:**
- ESM output: `dist/esm/*.mjs`
- CJS output: `dist/cjs/*.cjs`
- Type declarations: `dist/types/*.d.ts`
- Package exports now include both `import` and `require` conditions

**Benefits:**
- ✅ Works with modern ESM projects (`import`)
- ✅ Works with legacy CommonJS projects (`require`)
- ✅ No build tool configuration needed
- ✅ Tree-shaking friendly (ESM)
- ✅ Full TypeScript support for both formats

**Migration guide:**
No changes needed! The package automatically serves the correct format based on how you import it:

```typescript
// ESM projects (works as before)
import { loadPrompt } from "textprompts";

// CommonJS projects (now supported!)
const { loadPrompt } = require("textprompts");
```

**Build system changes:**
- Migrated to Bun build for ESM and CJS generation
- tsup used only for type declaration generation (--dts-only)
- Explicit file extensions (.mjs/.cjs) for unambiguous module resolution
- Build now generates: dist/*.mjs (ESM), dist/*.cjs (CJS), dist/*.d.ts (types)
- Three-step build process: ESM → CJS → types

## [0.2.0] - 2024-XX-XX

### Added
- `Prompt.fromString()` static method for loading prompts from string content
- Support for bundlers (Vite, Webpack) via `?raw` imports
- Improved documentation with bundler examples

### Changed
- Enhanced error messages with better context

## [0.1.0] - 2024-XX-XX

### Added
- Initial TypeScript implementation
- Core features: `loadPrompt`, `loadPrompts`, `savePrompt`
- `PromptString` class for safe string formatting
- TOML front-matter support for metadata
- Three metadata modes: STRICT, ALLOW, IGNORE
- CLI tool for prompt inspection
- Comprehensive test suite
- Examples for OpenAI, Anthropic, and Vercel AI SDK

[Unreleased]: https://github.com/svilupp/textprompts/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/svilupp/textprompts/releases/tag/v0.2.0
[0.1.0]: https://github.com/svilupp/textprompts/releases/tag/v0.1.0
