# Feature Request: Edge-compatible entry point (no `fs` dependency)

## Problem

When importing `textprompts` in a Cloudflare Workers bundle, the build fails with 24+ errors because the single entry point (`index.ts`) re-exports everything — including `loaders.ts` and `savers.ts` which pull in `node:fs/promises`, `node:path`, and `fast-glob`. Even if the consumer only uses `Prompt.fromString()`, the bundler still resolves the entire dependency graph.

```
✘ Could not resolve "stream"   — via fast-glob → @nodelib/fs.walk
✘ Could not resolve "fs"       — via fast-glob → @nodelib/fs.scandir
✘ Could not resolve "path"     — via fast-glob, picomatch, glob-parent
✘ Could not resolve "os"       — via fast-glob, glob-parent
✘ Could not resolve "events"   — via fast-glob → @nodelib/fs.walk
✘ Could not resolve "util"     — via fill-range, micromatch
```

CF Workers (and other edge runtimes like Deno Deploy, Vercel Edge) have **no filesystem**. `nodejs_compat` covers `path`, `stream`, `events`, `util`, `os` — but **never `fs`**. Since `fast-glob` fundamentally needs `fs` to crawl directories, no compat flag can fix this.

## Current module map

| Module               | Node.js APIs           | Pure? |
|----------------------|------------------------|-------|
| `prompt-string.ts`   | none                   | Yes   |
| `placeholder-utils.ts` | none                | Yes   |
| `sections.ts`        | none                   | Yes   |
| `toml.ts`            | none (@iarna/toml is pure JS) | Yes |
| `yaml.ts`            | none (yaml is pure JS) | Yes   |
| `parser.ts`          | `node:fs/promises`, `node:path` | **No** — but only for `loadPrompt()`, not `parseString()` |
| `config.ts`          | `process.env` (optional) | Yes |
| `errors.ts`          | none                   | Yes   |
| `constants.ts`       | none                   | Yes   |
| `models.ts`          | `node:path` (resolve)  | **No** — but path works under nodejs_compat |
| `loaders.ts`         | `node:fs/promises`, `fast-glob` | **No** |
| `savers.ts`          | `node:fs/promises`     | **No** |
| `cli.ts`             | `node:process`, fs     | **No** |

## Proposed solution: add a `textprompts/core` export

Add a second package entry point that re-exports only the pure-string APIs:

```jsonc
// package.json exports map
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  },
  "./core": {
    "types": "./dist/core.d.ts",
    "import": "./dist/core.mjs",
    "require": "./dist/core.cjs"
  }
}
```

### What `textprompts/core` should export

Everything a consumer needs to **parse and format prompts from strings** — no file I/O:

```typescript
// core.ts — new entry point
export { Prompt } from "./models"          // Prompt.fromString(), .format(), .meta, .prompt
export { PromptString } from "./prompt-string"  // PromptString.format(), .placeholders
export { parseString } from "./parser"     // parse text with TOML/YAML frontmatter
export { extractPlaceholders, getPlaceholderInfo } from "./placeholder-utils"
export { parseSections, renderToc, generateSlug, getSectionText, injectAnchors } from "./sections"
export { parseToml } from "./toml"
export { parseYaml } from "./yaml"
export { MetadataMode, setMetadata, getMetadata, skipMetadata } from "./config"
export * from "./errors"
```

### What needs to change in existing modules

1. **`parser.ts`** — split into two: `parser-core.ts` (pure `parseString()` + frontmatter parsing) and `parser.ts` (adds `loadPrompt()` which needs `fs`). The core entry imports only `parser-core.ts`.

2. **`models.ts`** — currently uses `path.resolve()` for normalizing file paths. This is fine under `nodejs_compat` but for maximum portability, the core entry could skip the path normalization or use a simple string fallback. Alternatively, keep it as-is since `path` works on all edge runtimes.

3. **`tsup.config.ts`** — add `core: "src/core.ts"` to the entry points. Ensure `fast-glob` stays external only for the main entry, and the core entry has zero Node.js imports.

### Consumer usage (before → after)

```typescript
// Before (pulls in everything, breaks on edge)
import { Prompt } from "textprompts"

// After (pure string APIs, works everywhere)
import { Prompt } from "textprompts/core"

const prompt = Prompt.fromString(rawText, { meta: "strict" })
const rendered = prompt.prompt.format({ soul: "...", channel_hint: "..." })
```

## Why not just tree-shake?

Wrangler uses esbuild which **does** tree-shake, but:
- `fast-glob` is currently marked `external` in tsup config, so it's left as a bare import
- Even when not external, esbuild resolves all imports before tree-shaking — the `require('fs')` calls in `@nodelib/fs.*` cause hard build errors before any dead code can be eliminated
- A separate entry point is the only reliable way to guarantee no `fs` resolution

## Additional nice-to-haves

- **`"sideEffects": false`** in package.json — helps bundlers tree-shake more aggressively
- **Conditional `"browser"` export** — point it at the core entry so bundlers targeting browser/edge automatically get the pure version
- **Keep `fast-glob` as optional/peer dependency** — since it's only needed for `loadPrompts()` glob patterns, make it a peer dep so consumers who don't use file loading don't pay the cost

## Environments that would benefit

- Cloudflare Workers (immediate use case)
- Deno Deploy
- Vercel Edge Functions
- AWS Lambda@Edge
- Browser (if anyone wants client-side prompt formatting)
- Any bundled context where `fs` is unavailable
