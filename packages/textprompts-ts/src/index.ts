// textprompts — full API including Node.js file-system operations.
// For edge runtimes without fs, use "textprompts/core" instead.
//
// `PromptString` is intentionally NOT exported. Use `Prompt.fromString` or
// `loadPrompt`.

// Core pure-string APIs (re-exported so index is always a superset of core)
export * from "./core";

// Node.js file-system APIs
export { loadPrompt, loadSection } from "./loaders";
export { parseFile } from "./parser";
export type { FrontMatterFormat } from "./savers";
export { savePrompt } from "./savers";
