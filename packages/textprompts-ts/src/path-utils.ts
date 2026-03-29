/**
 * Pure-JS path utilities for edge-runtime compatibility.
 * These mirror the subset of node:path used by the parser,
 * without importing any Node.js built-ins.
 */

/** Extract the file name from a path, optionally stripping an extension. */
export const basename = (filepath: string, ext?: string): string => {
  const base = filepath.split(/[/\\]/).filter(Boolean).pop() ?? filepath;
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  return base;
};

/** Return the extension of a path (including the leading dot). */
export const extname = (filepath: string): string => {
  const base = filepath.split(/[/\\]/).filter(Boolean).pop() ?? filepath;
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx <= 0) return "";
  return base.slice(dotIdx);
};
