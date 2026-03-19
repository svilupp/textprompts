const SECTION_KIND_PREAMBLE = "preamble";
const SECTION_KIND_MARKDOWN = "markdown";
const SECTION_KIND_XML = "xml";

export type SectionKind =
  | typeof SECTION_KIND_PREAMBLE
  | typeof SECTION_KIND_MARKDOWN
  | typeof SECTION_KIND_XML;

export interface Link {
  target: string;
  fragment: string;
  label: string;
  line: number;
}

export interface Section {
  kind: SectionKind;
  tagName: string;
  heading: string;
  anchorId: string;
  level: number;
  startLine: number;
  endLine: number;
  /** Line where section body content begins (1-indexed, after heading/opening tag). */
  contentStartLine: number;
  /** Column offset where content begins on contentStartLine. */
  contentStartCol: number;
  /** Line where section body content ends (1-indexed). */
  contentEndLine: number;
  /** Column offset where content ends on contentEndLine (-1 means end of line). */
  contentEndCol: number;
  charCount: number;
  parentIdx: number;
  children: number[];
  links: Link[];
}

export interface FrontmatterBlock {
  raw: string;
  format: "yaml" | "toml";
  startLine: number;
  endLine: number;
  title: string;
}

export interface ParseResult {
  sections: Section[];
  anchors: Record<string, number>;
  duplicateAnchors: Record<string, number[]>;
  frontmatter: FrontmatterBlock | null;
  totalChars: number;
}

interface PendingAnchor {
  id: string;
  startLine: number;
  endLine: number;
}

interface SectionState {
  idx: number;
  kind: SectionKind;
  tagName: string;
  markdownLevel: number;
  startLine: number;
  contentStartLine: number;
  contentStartCol: number;
  sourceStartLine: number;
}

interface XMLStartToken {
  tagName: string;
  attrs: Record<string, string>;
  startLine: number;
  openEndCol: number;
}

interface XMLBlock {
  tagName: string;
  attrs: Record<string, string>;
  startLine: number;
  endLine: number;
  openEndCol: number;
  closeStartCol: number;
}

interface FenceState {
  active: boolean;
  marker: string;
  count: number;
}

const RE_HEADING = /^\s{0,3}(#{1,6})[ \t]+(.+?)\s*$/;
const RE_ATTR_ID = /\s+\{#([a-zA-Z0-9._-]+)\}\s*$/;
const RE_XML_COMMENT = /^\s*<!--\s*@id:([a-zA-Z0-9._-]+)\s*-->\s*$/;
const RE_OPEN_TAG = /^\s*<([A-Za-z][A-Za-z0-9:._-]*)([^>]*)>/;
const RE_TAG_ATTR = /([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
const RE_MD_FORMATTING = /[*_~`]/g;
const RE_LINK_INLINE = /\[([^\]]*)\]\([^)]+\)/g;
const RE_HTML_TAG = /<\/?[^>]+>/g;

export const parseSections = (text: string | Uint8Array): ParseResult => {
  const source = coerceText(text);
  const lines = source.split("\n");
  const result: ParseResult = {
    sections: [],
    anchors: {},
    duplicateAnchors: {},
    frontmatter: null,
    totalChars: 0,
  };

  const fmEnd = detectFrontmatter(lines, result);
  let bodyStartLine = fmEnd + 1;
  if (bodyStartLine < 1) {
    bodyStartLine = 1;
  }

  result.totalChars = computeWindowCharCount(
    lines,
    bodyStartLine,
    0,
    lines.length,
    lineEndCol(lines, lines.length),
  );

  const [xmlBlocks, unclosedXml] = collectXMLBlocks(lines, bodyStartLine);
  const xmlStarts: Record<number, XMLBlock[]> = {};
  const xmlEnds: Record<number, XMLBlock[]> = {};

  for (const block of xmlBlocks) {
    if (!xmlStarts[block.startLine]) {
      xmlStarts[block.startLine] = [];
    }
    if (!xmlEnds[block.endLine]) {
      xmlEnds[block.endLine] = [];
    }
    xmlStarts[block.startLine].push(block);
    xmlEnds[block.endLine].push(block);
  }

  for (const blocks of Object.values(xmlStarts)) {
    blocks.sort((a, b) => {
      if (a.startLine === b.startLine) {
        if (a.endLine === b.endLine) {
          return a.openEndCol - b.openEndCol;
        }
        return b.endLine - a.endLine;
      }
      return a.startLine - b.startLine;
    });
  }

  for (const blocks of Object.values(xmlEnds)) {
    blocks.sort((a, b) => {
      if (a.endLine === b.endLine) {
        if (a.startLine === b.startLine) {
          return a.closeStartCol - b.closeStartCol;
        }
        return b.startLine - a.startLine;
      }
      return a.endLine - b.endLine;
    });
  }

  const anchorOnlyLines = new Set<number>();
  const usedAnchorIds = new Set<string>();
  let stack: SectionState[] = [];
  let pending: PendingAnchor | null = null;
  let gapStart = bodyStartLine;
  const fence: FenceState = { active: false, marker: "", count: 0 };

  for (let lineIdx = bodyStartLine - 1; lineIdx < lines.length; lineIdx += 1) {
    const line = trimRightCr(lines[lineIdx]);
    const lineNum = lineIdx + 1;

    if (updateFenceState(line, fence)) {
      pending = null;
      continue;
    }
    if (fence.active) {
      pending = null;
      continue;
    }

    const anchorTag = parseStandaloneAnchorTag(line);
    if (anchorTag.ok) {
      anchorOnlyLines.add(lineNum);
      pending = mergePendingAnchor(pending, anchorTag.id, lineNum);
      continue;
    }

    const commentAnchor = extractXMLCommentAnchor(line);
    if (commentAnchor) {
      anchorOnlyLines.add(lineNum);
      pending = mergePendingAnchor(pending, commentAnchor, lineNum);
      continue;
    }

    const unclosedToken = unclosedXml[lineNum];
    if (unclosedToken) {
      const tokenAnchor = explicitAnchorFromAttrs(unclosedToken.attrs);
      if (tokenAnchor) {
        anchorOnlyLines.add(lineNum);
        pending = mergePendingAnchor(pending, tokenAnchor, lineNum);
        continue;
      }
    }

    if (line.trim() === "") {
      pending = null;
    }

    const startBlocks = xmlStarts[lineNum] ?? [];
    if (startBlocks.length > 0) {
      const wasTopLevel = stack.length === 0;
      let eventStartLine = lineNum;
      if (pending) {
        eventStartLine = pending.startLine;
      }
      if (wasTopLevel) {
        gapStart = maybeAppendPreamble(
          result,
          lines,
          gapStart,
          eventStartLine - 1,
          anchorOnlyLines,
        );
      }

      for (const [blockIdx, block] of startBlocks.entries()) {
        let startLine = block.startLine;
        if (pending && blockIdx === 0) {
          startLine = pending.startLine;
        }

        const heading = deriveXMLHeading(block.tagName, block.attrs);
        const parentIdx = parentIndex(stack);
        const level = deriveXMLLevel(result, parentIdx);
        const explicitId = explicitAnchorFromAttrs(block.attrs);
        const defaultId = explicitId !== "" ? explicitId : normalizeAnchorId(block.tagName);
        const { anchorId, explicit } = resolveSectionAnchor(
          heading,
          pending,
          defaultId,
          usedAnchorIds,
        );
        const sectionIdx = appendSection(result, {
          kind: SECTION_KIND_XML,
          tagName: block.tagName,
          heading,
          anchorId,
          level,
          startLine,
          endLine: block.endLine,
          contentStartLine: block.startLine,
          contentStartCol: block.openEndCol,
          contentEndLine: block.endLine,
          contentEndCol: block.closeStartCol,
          charCount: 0,
          parentIdx,
          children: [],
          links: [],
        });
        registerAnchor(result, usedAnchorIds, anchorId, sectionIdx, explicit);
        stack.push({
          idx: sectionIdx,
          kind: SECTION_KIND_XML,
          tagName: block.tagName,
          markdownLevel: level,
          startLine,
          contentStartLine: block.startLine,
          contentStartCol: block.openEndCol,
          sourceStartLine: block.startLine,
        });
      }

      pending = null;
      if (wasTopLevel) {
        gapStart = lines.length + 1;
      }
    }

    const markdownHeading = parseMarkdownHeading(line);
    if (markdownHeading.ok) {
      const wasTopLevel = stack.length === 0;
      let eventStartLine = lineNum;
      if (pending) {
        eventStartLine = pending.startLine;
      }
      if (wasTopLevel) {
        gapStart = maybeAppendPreamble(
          result,
          lines,
          gapStart,
          eventStartLine - 1,
          anchorOnlyLines,
        );
      }

      stack = closeMarkdownSections(
        result,
        lines,
        stack,
        markdownHeading.level,
        lineNum - 1,
        lineEndCol(lines, lineNum - 1),
      );

      const startLine = pending ? pending.startLine : lineNum;
      const parentIdx = parentIndex(stack);
      const { anchorId, explicit } = resolveSectionAnchor(
        markdownHeading.heading,
        pending,
        markdownHeading.attrId,
        usedAnchorIds,
      );
      const sectionIdx = appendSection(result, {
        kind: SECTION_KIND_MARKDOWN,
        tagName: "",
        heading: markdownHeading.heading,
        anchorId,
        level: markdownHeading.level,
        startLine,
        endLine: lineNum,
        contentStartLine: lineNum + 1,
        contentStartCol: 0,
        contentEndLine: lineNum,
        contentEndCol: -1,
        charCount: 0,
        parentIdx,
        children: [],
        links: [],
      });
      registerAnchor(result, usedAnchorIds, anchorId, sectionIdx, explicit);
      stack.push({
        idx: sectionIdx,
        kind: SECTION_KIND_MARKDOWN,
        tagName: "",
        markdownLevel: markdownHeading.level,
        startLine,
        contentStartLine: lineNum + 1,
        contentStartCol: 0,
        sourceStartLine: lineNum,
      });

      pending = null;
      if (wasTopLevel) {
        gapStart = lines.length + 1;
      }
    }

    const endBlocks = xmlEnds[lineNum] ?? [];
    if (endBlocks.length > 0) {
      for (const block of endBlocks) {
        stack = closeXMLBlock(result, lines, stack, block);
      }
      if (stack.length === 0) {
        gapStart = lineNum + 1;
      }
    }
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) {
      break;
    }
    finalizeSection(result, lines, top, lines.length, lineEndCol(lines, lines.length));
  }

  if (result.sections.length === 0) {
    maybeAppendPreamble(result, lines, bodyStartLine, lines.length, anchorOnlyLines);
  } else if (gapStart <= lines.length) {
    maybeAppendPreamble(result, lines, gapStart, lines.length, anchorOnlyLines);
  }

  return result;
};

export const generateSlug = (heading: string): string => {
  let slug = heading.replace(RE_LINK_INLINE, "$1");
  slug = slug.replace(RE_HTML_TAG, "");
  slug = slug.replace(RE_MD_FORMATTING, "");
  return normalizeAnchorId(slug);
};

export const injectAnchors = (text: string | Uint8Array): { text: string; result: ParseResult } => {
  const source = coerceText(text);
  const result = parseSections(source);
  const lines = source.split("\n");

  for (let idx = result.sections.length - 1; idx >= 0; idx -= 1) {
    const section = result.sections[idx];
    if (section.kind !== SECTION_KIND_MARKDOWN) {
      continue;
    }

    const headingIdx = findMarkdownHeadingLine(lines, section.startLine, section.endLine);
    if (headingIdx < 0) {
      continue;
    }

    if (headingIdx > 0) {
      const prevLine = lines[headingIdx - 1].trim();
      if (parseStandaloneAnchorTag(prevLine).ok || extractXMLCommentAnchor(prevLine)) {
        continue;
      }
    }

    const markdownHeading = parseMarkdownHeading(lines[headingIdx]);
    if (!markdownHeading.ok || markdownHeading.attrId !== "") {
      continue;
    }

    lines.splice(headingIdx, 0, `<a id="${section.anchorId}"></a>`);
  }

  const output = lines.join("\n");
  return { text: output, result: parseSections(output) };
};

export const renderToc = (result: ParseResult, path: string): string => {
  if (result.sections.length === 0) {
    return "";
  }

  const lines = [
    `${path} (${result.totalChars} chars, ${countRenderableSections(result)} sections)`,
  ];

  for (const [idx, section] of result.sections.entries()) {
    if (section.kind === SECTION_KIND_PREAMBLE) {
      continue;
    }
    const indent = "  ".repeat(sectionDepth(result.sections, idx));
    const prefix = renderSectionPrefix(section);
    lines.push(
      `${indent}${prefix} ${section.heading} [#${section.anchorId}] ` +
        `(L${section.startLine}-L${section.endLine}, ${section.charCount} chars)`,
    );
  }

  return `${lines.join("\n")}\n`;
};

const coerceText = (text: string | Uint8Array): string => {
  return typeof text === "string" ? text : Buffer.from(text).toString("utf8");
};

const detectFrontmatter = (lines: string[], result: ParseResult): number => {
  if (lines.length === 0) {
    return 0;
  }

  const first = lines[0].trim();
  let delimiter = "";
  let format: FrontmatterBlock["format"] | "" = "";
  if (first === "---") {
    delimiter = "---";
    format = "yaml";
  } else if (first === "+++") {
    delimiter = "+++";
    format = "toml";
  } else {
    return 0;
  }

  for (let idx = 1; idx < lines.length; idx += 1) {
    if (lines[idx].trim() === delimiter) {
      const raw = lines.slice(1, idx).join("\n");
      result.frontmatter = {
        raw,
        format,
        startLine: 1,
        endLine: idx + 1,
        title: extractFrontmatterTitle(raw, format),
      };
      return idx + 1;
    }
  }
  return 0;
};

const extractFrontmatterTitle = (raw: string, format: FrontmatterBlock["format"]): string => {
  for (const line of raw.split("\n")) {
    const stripped = line.trim();
    for (const key of ["title", "name"]) {
      if (format === "yaml") {
        const prefix = `${key}:`;
        if (stripped.startsWith(prefix)) {
          return stripped
            .slice(prefix.length)
            .trim()
            .replace(/^["']|["']$/g, "");
        }
      }
      if (format === "toml") {
        for (const prefix of [`${key} =`, `${key}=`]) {
          if (stripped.startsWith(prefix)) {
            return stripped
              .slice(prefix.length)
              .trim()
              .replace(/^["']|["']$/g, "");
          }
        }
      }
    }
  }
  return "";
};

const collectXMLBlocks = (
  lines: string[],
  bodyStartLine: number,
): [XMLBlock[], Record<number, XMLStartToken>] => {
  const blocks: XMLBlock[] = [];
  const unclosed: Record<number, XMLStartToken> = {};
  const stack: XMLStartToken[] = [];
  const fence: FenceState = { active: false, marker: "", count: 0 };

  for (let lineIdx = bodyStartLine - 1; lineIdx < lines.length; lineIdx += 1) {
    const line = trimRightCr(lines[lineIdx]);
    const lineNum = lineIdx + 1;

    if (updateFenceState(line, fence)) {
      continue;
    }
    if (fence.active) {
      continue;
    }
    if (parseStandaloneAnchorTag(line).ok || extractXMLCommentAnchor(line)) {
      continue;
    }

    const startToken = parseXMLStartToken(line, lineNum);
    if (
      startToken.ok &&
      !tokenIsAnchor(startToken.token) &&
      !tokenIsSelfClosing(startToken.token)
    ) {
      const [closeStart, found] = findClosingTagStart(
        line,
        startToken.token.tagName,
        startToken.token.openEndCol,
      );
      if (found) {
        blocks.push({
          tagName: startToken.token.tagName,
          attrs: startToken.token.attrs,
          startLine: startToken.token.startLine,
          endLine: lineNum,
          openEndCol: startToken.token.openEndCol,
          closeStartCol: closeStart,
        });
      } else {
        stack.push(startToken.token);
        unclosed[startToken.token.startLine] = startToken.token;
      }
    }

    let searchFrom = 0;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const [closeStart, found] = findClosingTagStart(line, top.tagName, searchFrom);
      if (!found) {
        break;
      }
      blocks.push({
        tagName: top.tagName,
        attrs: top.attrs,
        startLine: top.startLine,
        endLine: lineNum,
        openEndCol: top.openEndCol,
        closeStartCol: closeStart,
      });
      delete unclosed[top.startLine];
      stack.pop();
      searchFrom = closeStart + 1;
    }
  }

  blocks.sort((a, b) => {
    if (a.startLine === b.startLine) {
      if (a.endLine === b.endLine) {
        return a.openEndCol - b.openEndCol;
      }
      return b.endLine - a.endLine;
    }
    return a.startLine - b.startLine;
  });

  return [blocks, unclosed];
};

const parseMarkdownHeading = (
  line: string,
): { level: number; heading: string; attrId: string; ok: boolean } => {
  const match = RE_HEADING.exec(trimRightCr(line));
  if (!match) {
    return { level: 0, heading: "", attrId: "", ok: false };
  }

  const level = match[1].length;
  let heading = stripClosingHeadingHashes(match[2].trim());
  let attrId = "";
  const attrMatch = RE_ATTR_ID.exec(heading);
  if (attrMatch) {
    attrId = normalizeAnchorId(attrMatch[1]);
    heading = heading.replace(RE_ATTR_ID, "").trim();
  }

  if (heading === "") {
    heading = "section";
  }

  return { level, heading, attrId, ok: true };
};

const stripClosingHeadingHashes = (heading: string): string => {
  const trimmed = heading.trim();
  const idx = trimmed.lastIndexOf(" #");
  if (idx >= 0) {
    const suffix = trimmed.slice(idx).trim();
    if (suffix !== "" && suffix.replaceAll("#", "") === "") {
      return trimmed.slice(0, idx).trim();
    }
  }
  return trimmed;
};

const parseXMLStartToken = (
  line: string,
  lineNum: number,
): { token: XMLStartToken; ok: boolean } => {
  const trimmed = line.trim();
  if (
    trimmed === "" ||
    trimmed.startsWith("</") ||
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<?")
  ) {
    return { token: emptyXMLStartToken(), ok: false };
  }

  const match = RE_OPEN_TAG.exec(line);
  if (!match) {
    return { token: emptyXMLStartToken(), ok: false };
  }

  let attrText = match[2];
  const selfClosing = attrText.trim().endsWith("/");
  if (selfClosing) {
    attrText = attrText.trim().slice(0, -1).trim();
  }

  const token: XMLStartToken = {
    tagName: match[1],
    attrs: parseTagAttributes(attrText),
    startLine: lineNum,
    openEndCol: match.index + match[0].length,
  };

  if (selfClosing) {
    token.attrs.__self_closing__ = "true";
  }

  return { token, ok: true };
};

const emptyXMLStartToken = (): XMLStartToken => ({
  tagName: "",
  attrs: {},
  startLine: 0,
  openEndCol: 0,
});

const tokenIsAnchor = (token: XMLStartToken): boolean => token.tagName.toLowerCase() === "a";

const tokenIsSelfClosing = (token: XMLStartToken): boolean =>
  token.attrs.__self_closing__ === "true";

const parseStandaloneAnchorTag = (line: string): { id: string; ok: boolean } => {
  const startToken = parseXMLStartToken(line, 1);
  if (!startToken.ok || startToken.token.tagName.toLowerCase() !== "a") {
    return { id: "", ok: false };
  }

  const anchorId = explicitAnchorFromAttrs(startToken.token.attrs);
  if (anchorId === "") {
    return { id: "", ok: false };
  }

  const remainder = line.slice(startToken.token.openEndCol).trim();
  if (startToken.token.attrs.__self_closing__ === "true") {
    return { id: anchorId, ok: remainder === "" };
  }

  const [closeStart, closeEnd, found] = findClosingTagRange(
    line,
    startToken.token.tagName,
    startToken.token.openEndCol,
  );
  if (!found) {
    return { id: "", ok: false };
  }
  if (line.slice(startToken.token.openEndCol, closeStart).trim() !== "") {
    return { id: "", ok: false };
  }
  if (line.slice(closeEnd).trim() !== "") {
    return { id: "", ok: false };
  }

  return { id: anchorId, ok: true };
};

const parseTagAttributes = (attrText: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  RE_TAG_ATTR.lastIndex = 0;
  let match = RE_TAG_ATTR.exec(attrText);
  while (match) {
    attrs[match[1].toLowerCase()] = match[3] || match[4] || "";
    match = RE_TAG_ATTR.exec(attrText);
  }
  RE_TAG_ATTR.lastIndex = 0;
  return attrs;
};

const explicitAnchorFromAttrs = (attrs: Record<string, string>): string => {
  for (const key of ["id", "name"]) {
    const value = attrs[key]?.trim() ?? "";
    if (value) {
      return normalizeAnchorId(value);
    }
  }
  return "";
};

const extractXMLCommentAnchor = (line: string): string => {
  const match = RE_XML_COMMENT.exec(trimRightCr(line));
  return match ? normalizeAnchorId(match[1]) : "";
};

const mergePendingAnchor = (
  existing: PendingAnchor | null,
  anchorId: string,
  lineNum: number,
): PendingAnchor => {
  if (!existing) {
    return { id: anchorId, startLine: lineNum, endLine: lineNum };
  }
  return { id: anchorId, startLine: existing.startLine, endLine: lineNum };
};

const resolveSectionAnchor = (
  heading: string,
  pending: PendingAnchor | null,
  explicitId: string,
  usedAnchorIds: Set<string>,
): { anchorId: string; explicit: boolean } => {
  if (pending?.id) {
    return { anchorId: pending.id, explicit: true };
  }
  if (explicitId !== "") {
    return { anchorId: explicitId, explicit: true };
  }
  return { anchorId: uniqueGeneratedAnchor(generateSlug(heading), usedAnchorIds), explicit: false };
};

const uniqueGeneratedAnchor = (base: string, used: Set<string>): string => {
  const root = base || "section";
  if (!used.has(root)) {
    return root;
  }
  for (let idx = 2; ; idx += 1) {
    const candidate = `${root}_${idx}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
};

const registerAnchor = (
  result: ParseResult,
  used: Set<string>,
  anchorId: string,
  sectionIdx: number,
  explicit: boolean,
): void => {
  if (anchorId === "") {
    return;
  }
  if (!explicit) {
    result.anchors[anchorId] = sectionIdx;
    used.add(anchorId);
    return;
  }
  if (!used.has(anchorId)) {
    result.anchors[anchorId] = sectionIdx;
    used.add(anchorId);
    return;
  }
  if (!Object.hasOwn(result.duplicateAnchors, anchorId)) {
    result.duplicateAnchors[anchorId] = [result.anchors[anchorId]];
  }
  result.duplicateAnchors[anchorId].push(sectionIdx);
};

const appendSection = (result: ParseResult, section: Section): number => {
  const idx = result.sections.length;
  if (section.parentIdx >= 0) {
    result.sections[section.parentIdx].children.push(idx);
  }
  result.sections.push(section);
  return idx;
};

const maybeAppendPreamble = (
  result: ParseResult,
  lines: string[],
  startLine: number,
  endLine: number,
  skipLines: Set<number>,
): number => {
  let normalizedStart = startLine;
  if (normalizedStart <= 0) {
    normalizedStart = 1;
  }
  if (endLine < normalizedStart) {
    return normalizedStart;
  }
  if (!windowHasContent(lines, normalizedStart, endLine, skipLines)) {
    return endLine + 1;
  }

  const { chars, links } = computeWindowStatsSkippingLines(
    lines,
    normalizedStart,
    0,
    endLine,
    lineEndCol(lines, endLine),
    skipLines,
  );
  appendSection(result, {
    kind: SECTION_KIND_PREAMBLE,
    tagName: "",
    heading: "",
    anchorId: "",
    level: 0,
    startLine: normalizedStart,
    endLine,
    contentStartLine: normalizedStart,
    contentStartCol: 0,
    contentEndLine: endLine,
    contentEndCol: lineEndCol(lines, endLine),
    charCount: chars,
    parentIdx: -1,
    children: [],
    links,
  });
  return endLine + 1;
};

const closeMarkdownSections = (
  result: ParseResult,
  lines: string[],
  stack: SectionState[],
  newLevel: number,
  endLine: number,
  endCol: number,
): SectionState[] => {
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.kind !== SECTION_KIND_MARKDOWN || top.markdownLevel < newLevel) {
      break;
    }
    finalizeSection(result, lines, top, endLine, endCol);
    stack = stack.slice(0, -1);
  }
  return stack;
};

const closeXMLBlock = (
  result: ParseResult,
  lines: string[],
  stack: SectionState[],
  block: XMLBlock,
): SectionState[] => {
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    finalizeSection(result, lines, top, block.endLine, block.closeStartCol);
    stack = stack.slice(0, -1);
    if (
      top.kind === SECTION_KIND_XML &&
      top.sourceStartLine === block.startLine &&
      top.tagName === block.tagName
    ) {
      break;
    }
  }
  return stack;
};

const finalizeSection = (
  result: ParseResult,
  lines: string[],
  state: SectionState,
  endLine: number,
  endCol: number,
): void => {
  const section = result.sections[state.idx];
  section.endLine = endLine;
  section.contentStartLine = state.contentStartLine;
  section.contentStartCol = state.contentStartCol;
  section.contentEndLine = endLine;
  section.contentEndCol = endCol;
  const { chars, links } = computeWindowStats(
    lines,
    state.contentStartLine,
    state.contentStartCol,
    endLine,
    endCol,
  );
  section.charCount = chars;
  section.links = links;
};

const parentIndex = (stack: SectionState[]): number =>
  stack.length === 0 ? -1 : stack[stack.length - 1].idx;

const deriveXMLLevel = (result: ParseResult, parentIdx: number): number => {
  if (parentIdx < 0) {
    return 1;
  }
  const parent = result.sections[parentIdx];
  if (parent.level <= 0) {
    return 1;
  }
  return parent.level + 1;
};

const deriveXMLHeading = (tagName: string, attrs: Record<string, string>): string => {
  for (const key of ["heading", "title", "label", "name"]) {
    const value = attrs[key]?.trim() ?? "";
    if (value) {
      return value;
    }
  }
  const anchorId = attrs.id?.trim() ?? "";
  if (anchorId) {
    return humanizeIdentifier(anchorId);
  }
  return humanizeIdentifier(tagName);
};

const humanizeIdentifier = (value: string): string => {
  const stripped = value.trim();
  if (stripped === "") {
    return "Section";
  }
  const fields = stripped.split(/[-_:]|\s+/).filter(Boolean);
  if (fields.length === 0) {
    return "Section";
  }
  return fields
    .map((field) => {
      const lowered = field.toLowerCase();
      return `${lowered.slice(0, 1).toUpperCase()}${lowered.slice(1)}`;
    })
    .join(" ");
};

const updateFenceState = (line: string, state: FenceState): boolean => {
  const trimmed = line.replace(/^[ \t]+/, "");
  if (trimmed === "") {
    return false;
  }

  const marker = trimmed[0];
  if (marker !== "`" && marker !== "~") {
    return false;
  }

  let count = 0;
  for (const char of trimmed) {
    if (char !== marker) {
      break;
    }
    count += 1;
  }
  if (count < 3) {
    return false;
  }

  if (!state.active) {
    state.active = true;
    state.marker = marker;
    state.count = count;
    return true;
  }

  if (state.marker === marker && count >= state.count) {
    state.active = false;
    state.marker = "";
    state.count = 0;
    return true;
  }

  return false;
};

const computeWindowStats = (
  lines: string[],
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): { chars: number; links: Link[] } => {
  return computeWindowStatsSkippingLines(lines, startLine, startCol, endLine, endCol, null);
};

const computeWindowStatsSkippingLines = (
  lines: string[],
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
  skipLines: Set<number> | null,
): { chars: number; links: Link[] } => {
  if (!validWindow(lines, startLine, endLine)) {
    return { chars: 0, links: [] };
  }

  const segments: string[] = [];
  const segmentLines: number[] = [];
  for (let lineNum = startLine; lineNum <= endLine; lineNum += 1) {
    if (skipLines?.has(lineNum)) {
      continue;
    }
    segments.push(sliceWindowLine(lines, lineNum, startLine, startCol, endLine, endCol));
    segmentLines.push(lineNum);
  }

  if (segments.length === 0) {
    return { chars: 0, links: [] };
  }

  let chars = 0;
  for (const [idx, segment] of segments.entries()) {
    chars += Buffer.byteLength(segment, "utf8");
    if (idx < segments.length - 1) {
      chars += 1;
    }
  }

  const links: Link[] = [];
  for (const [idx, segment] of segments.entries()) {
    for (const match of segment.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
      const href = match[2];
      const hashIdx = href.indexOf("#");
      links.push({
        target: href,
        fragment: hashIdx >= 0 ? href.slice(hashIdx + 1) : "",
        label: match[1],
        line: segmentLines[idx],
      });
    }
  }

  return { chars, links };
};

const computeWindowCharCount = (
  lines: string[],
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): number => computeWindowStats(lines, startLine, startCol, endLine, endCol).chars;

const validWindow = (lines: string[], startLine: number, endLine: number): boolean => {
  if (lines.length === 0 || startLine <= 0 || endLine <= 0) {
    return false;
  }
  if (startLine > lines.length) {
    return false;
  }
  return startLine <= endLine;
};

const sliceWindowLine = (
  lines: string[],
  lineNum: number,
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): string => {
  if (lineNum <= 0 || lineNum > lines.length) {
    return "";
  }
  const line = trimRightCr(lines[lineNum - 1]);
  let fromCol = 0;
  let toCol = line.length;

  if (lineNum === startLine) {
    fromCol = clamp(startCol, 0, line.length);
  }
  if (lineNum === endLine && endCol >= 0) {
    toCol = clamp(endCol, 0, line.length);
  }
  if (toCol < fromCol) {
    toCol = fromCol;
  }
  return line.slice(fromCol, toCol);
};

const lineEndCol = (lines: string[], lineNum: number): number => {
  if (lineNum <= 0 || lineNum > lines.length) {
    return 0;
  }
  return trimRightCr(lines[lineNum - 1]).length;
};

const clamp = (value: number, minValue: number, maxValue: number): number => {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
};

const windowHasContent = (
  lines: string[],
  startLine: number,
  endLine: number,
  skipLines: Set<number>,
): boolean => {
  if (!validWindow(lines, startLine, endLine)) {
    return false;
  }
  for (let lineNum = startLine; lineNum <= endLine; lineNum += 1) {
    if (skipLines.has(lineNum)) {
      continue;
    }
    if (trimRightCr(lines[lineNum - 1]).trim() !== "") {
      return true;
    }
  }
  return false;
};

const findClosingTagStart = (line: string, tagName: string, fromCol: number): [number, boolean] => {
  const [start, , found] = findClosingTagRange(line, tagName, fromCol);
  return [start, found];
};

const findClosingTagRange = (
  line: string,
  tagName: string,
  fromCol: number,
): [number, number, boolean] => {
  const pattern = new RegExp(`</\\s*${escapeRegExp(tagName)}\\s*>`);
  const match = pattern.exec(line.slice(fromCol));
  if (!match || match.index === undefined) {
    return [0, 0, false];
  }
  return [fromCol + match.index, fromCol + match.index + match[0].length, true];
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderSectionPrefix = (section: Section): string => {
  if (section.kind === SECTION_KIND_XML) {
    return `<${section.tagName || "xml"}>`;
  }
  if (section.level <= 0) {
    return "-";
  }
  return "#".repeat(section.level);
};

const sectionDepth = (sections: Section[], idx: number): number => {
  let depth = 0;
  for (let parent = sections[idx].parentIdx; parent >= 0; parent = sections[parent].parentIdx) {
    depth += 1;
  }
  return depth;
};

const countRenderableSections = (result: ParseResult): number =>
  result.sections.filter((section) => section.kind !== SECTION_KIND_PREAMBLE).length;

const findMarkdownHeadingLine = (lines: string[], startLine: number, endLine: number): number => {
  let normalizedStart = startLine;
  let normalizedEnd = endLine;
  if (normalizedStart < 1) {
    normalizedStart = 1;
  }
  if (normalizedEnd > lines.length) {
    normalizedEnd = lines.length;
  }
  for (let idx = normalizedStart - 1; idx < normalizedEnd; idx += 1) {
    if (parseMarkdownHeading(lines[idx]).ok) {
      return idx;
    }
  }
  return -1;
};

/**
 * Convert any string to a canonical anchor ID:
 * lowercase, runs of non-alphanumeric characters collapsed to a single
 * underscore, leading and trailing underscores stripped.
 *
 * Applied to all anchor sources: tag names, id attributes, <a id="">,
 * comment anchors, and markdown {#attr} values.
 */
export const normalizeAnchorId = (id: string): string => {
  const lower = id.toLowerCase();
  let out = "";
  for (const char of lower) {
    if (/^[a-z0-9]$/.test(char)) {
      out += char;
    } else if (out.length > 0 && !out.endsWith("_")) {
      out += "_";
    }
  }
  out = out.replace(/_+$/g, "");
  return out || "section";
};

const trimRightCr = (line: string): string => (line.endsWith("\r") ? line.slice(0, -1) : line);

/**
 * Extract the body text of a specific section by its anchor ID.
 * Returns null if no section with that anchor ID exists.
 *
 * For XML sections: returns the content between the opening and closing tags.
 * For markdown sections: returns the content after the heading line.
 *
 * @example
 * const text = `<system>\nYou are a helpful assistant.\n</system>`;
 * getSectionText(text, "system"); // "You are a helpful assistant."
 */
export const getSectionText = (text: string | Uint8Array, anchorId: string): string | null => {
  const source = coerceText(text);
  const result = parseSections(source);
  let section = result.sections.find((s) => s.anchorId === anchorId);
  if (!section) {
    const normalizedQuery = normalizeAnchorId(anchorId);
    section = result.sections.find((s) => normalizeAnchorId(s.anchorId) === normalizedQuery);
  }
  if (!section) {
    return null;
  }
  return sliceSectionContent(source, section);
};

/**
 * Extract the body text of a section given its parsed Section descriptor.
 * Returns the content between the opening/heading line and closing tag/end.
 */
export const sliceSectionContent = (text: string | Uint8Array, section: Section): string => {
  const source = coerceText(text);
  const lines = source.split("\n");

  const startLine = section.contentStartLine;
  const startCol = section.contentStartCol;
  const endLine = section.contentEndLine;
  const endCol = section.contentEndCol;

  if (startLine <= 0 || startLine > lines.length) {
    return "";
  }

  const parts: string[] = [];

  if (startLine === endLine) {
    const line = trimRightCr(lines[startLine - 1] ?? "");
    const from = clamp(startCol, 0, line.length);
    const to = endCol < 0 ? line.length : clamp(endCol, from, line.length);
    parts.push(line.slice(from, to));
  } else {
    for (let lineNum = startLine; lineNum <= Math.min(endLine, lines.length); lineNum += 1) {
      let line = trimRightCr(lines[lineNum - 1] ?? "");
      if (lineNum === startLine && startCol > 0) {
        line = line.slice(startCol);
      } else if (lineNum === endLine && endCol >= 0) {
        line = line.slice(0, endCol);
      }
      parts.push(line);
    }
  }

  // Trim leading and trailing blank lines, preserve internal whitespace
  while (parts.length > 0 && parts[0].trim() === "") {
    parts.shift();
  }
  while (parts.length > 0 && parts[parts.length - 1].trim() === "") {
    parts.pop();
  }

  return parts.join("\n");
};
