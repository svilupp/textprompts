// textprompts/core — pure-string APIs, no Node.js built-ins.
// Safe for Cloudflare Workers, Deno Deploy, Vercel Edge, and browsers.
//
// Contract: this module's static import graph contains zero `node:*` imports.
// Enforced by tests/core-contract.test.ts.

export {
  getMetadata,
  MetadataMode,
  setMetadata,
  skipMetadata,
  warnOnIgnoredMetadata,
} from "./config";
export {
  FileMissingError,
  InvalidMetadataError,
  MalformedHeaderError,
  MissingMetadataError,
  TextPromptsError,
} from "./errors";
export type { PromptMeta } from "./models";
export { Prompt } from "./models";
export { parseString } from "./parser-core";
export { extractPlaceholders, getPlaceholderInfo } from "./placeholder-utils";
export { PromptString } from "./prompt-string";
export type { FrontmatterBlock, Link, ParseResult, Section, SectionKind } from "./sections";
export {
  generateSlug,
  getSectionText,
  injectAnchors,
  normalizeAnchorId,
  parseSections,
  renderToc,
  sliceSectionContent,
} from "./sections";
