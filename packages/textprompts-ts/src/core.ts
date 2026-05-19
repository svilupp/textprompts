// textprompts/core — pure-string APIs, no Node.js built-ins.
// Safe for Cloudflare Workers, Deno Deploy, Vercel Edge, and browsers.
//
// Contract: this module's static import graph contains zero `node:*` imports.
// Enforced by tests/core-contract.test.ts.
//
// `PromptString` is intentionally NOT exported. Use `Prompt.fromString`.

export {
  getMetadata,
  MetadataMode,
  setMetadata,
  skipMetadata,
  warnOnIgnoredMetadata,
} from "./config";
export {
  FileMissingError,
  FormatError,
  FrontmatterError,
  InvalidMetadataError,
  MalformedHeaderError,
  MissingMetadataError,
  ParseError,
  SemanticError,
  TextPromptsError,
} from "./errors";
export type {
  FormatErrorCode,
  FrontmatterErrorCode,
  SemanticErrorCode,
} from "./errors";
export type { FlagDecl, BooleanFlag, EnumFlag, VarDecl } from "./frontmatter-schema";
export type { FrontmatterFormat, PromptLoadOptions, PromptMeta } from "./models";
export { Prompt } from "./models";
export { parseString } from "./parser-core";
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
