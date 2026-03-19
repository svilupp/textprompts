import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  generateSlug,
  getSectionText,
  injectAnchors,
  parseSections,
  type ParseResult,
  renderToc,
  sliceSectionContent,
} from "../src/sections";

interface SharedCase {
  name: string;
  document: string;
  expected: Record<string, unknown>;
}

const SHARED_CASES = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../testdata/sections/cases.json", import.meta.url)), "utf8"),
) as SharedCase[];

const normalizeResult = (result: ParseResult): Record<string, unknown> => ({
  sections: result.sections.map((section) => ({
    kind: section.kind,
    tagName: section.tagName,
    heading: section.heading,
    anchorId: section.anchorId,
    level: section.level,
    startLine: section.startLine,
    endLine: section.endLine,
    parentIdx: section.parentIdx,
    children: [...section.children],
    charCount: section.charCount,
    links: section.links.map((link) => ({
      target: link.target,
      fragment: link.fragment,
      label: link.label,
      line: link.line,
    })),
  })),
  anchors: { ...result.anchors },
  duplicateAnchors: { ...result.duplicateAnchors },
  frontmatter: result.frontmatter ? { ...result.frontmatter } : null,
  totalChars: result.totalChars,
});

const assertParserInvariants = (result: ParseResult): void => {
  result.sections.forEach((section, idx) => {
    expect(section.startLine).toBeGreaterThan(0);
    expect(section.endLine).toBeGreaterThanOrEqual(section.startLine);

    if (idx > 0) {
      const prev = result.sections[idx - 1];
      expect(section.startLine).toBeGreaterThanOrEqual(prev.startLine);
      if (section.startLine === prev.startLine) {
        expect(section.endLine).toBeLessThanOrEqual(prev.endLine);
      }
    }

    if (section.parentIdx >= 0) {
      expect(section.parentIdx).toBeLessThan(idx);
      const parent = result.sections[section.parentIdx];
      expect(parent.startLine).toBeLessThanOrEqual(section.startLine);
      expect(parent.endLine).toBeGreaterThanOrEqual(section.endLine);
    }

    for (const childIdx of section.children) {
      expect(childIdx).toBeGreaterThan(idx);
      expect(childIdx).toBeLessThan(result.sections.length);
      expect(result.sections[childIdx].parentIdx).toBe(idx);
    }

    if (section.anchorId !== "") {
      expect(result.anchors[section.anchorId]).toBeDefined();
      const firstIdx = result.anchors[section.anchorId];
      const duplicates = result.duplicateAnchors[section.anchorId];
      if (duplicates) {
        expect(firstIdx).toBe(duplicates[0]);
      } else {
        expect(firstIdx).toBe(idx);
      }
    }
  });
};

describe("sections parity corpus", () => {
  for (const sharedCase of SHARED_CASES) {
    test(sharedCase.name, () => {
      const result = parseSections(sharedCase.document);
      assertParserInvariants(result);
      expect(normalizeResult(result)).toEqual(sharedCase.expected);
    });
  }
});

test("parseSections accepts Uint8Array", () => {
  const doc = "## Unicode\n\nCafé\n";
  expect(normalizeResult(parseSections(doc))).toEqual(
    normalizeResult(parseSections(new TextEncoder().encode(doc))),
  );
});

test("generateSlug", () => {
  const cases = [
    ["Hello World", "hello_world"],
    ["GCP Projects", "gcp_projects"],
    ["Memory Architecture Design", "memory_architecture_design"],
    ["**Bold** and *italic*", "bold_and_italic"],
    ["`code` blocks", "code_blocks"],
    ["[Link Text](http://example.com)", "link_text"],
    ["<em>Inline HTML</em>", "inline_html"],
    ["Multiple   Spaces", "multiple_spaces"],
    ["Special!@#$%^&*()chars", "special_chars"],
    ["  Leading/Trailing  ", "leading_trailing"],
    ["123 Numbers First", "123_numbers_first"],
    ["---dashes---", "dashes"],
    ["", "section"],
  ] as const;

  for (const [raw, expected] of cases) {
    expect(generateSlug(raw)).toBe(expected);
  }
});

test("duplicate explicit anchors are reported", () => {
  const doc = "<a id=\"dup\"></a>\n## One\n\n<a id='dup'></a>\n## Two";
  const result = parseSections(doc);
  assertParserInvariants(result);

  expect(result.sections).toHaveLength(2);
  expect(result.sections[0].anchorId).toBe("dup");
  expect(result.sections[1].anchorId).toBe("dup");
  expect(result.anchors.dup).toBe(0);
  expect(result.duplicateAnchors).toEqual({ dup: [0, 1] });
});

test("injectAnchors is idempotent and markdown only", () => {
  const doc =
    "<instructions>\n" +
    "Body.\n" +
    "</instructions>\n\n" +
    "## First Section\n\n" +
    "Content.\n\n" +
    "## Existing {#custom-id}\n\n" +
    "More.";

  const output = injectAnchors(doc);
  assertParserInvariants(output.result);

  expect(output.text).toContain('<a id="first_section"></a>');
  expect(output.text).not.toContain('<a id="instructions"></a>');
  expect(output.text.match(/<a id="first_section"><\/a>/g)?.length ?? 0).toBe(1);

  const output2 = injectAnchors(output.text);
  assertParserInvariants(output2.result);
  expect(output2.text).toBe(output.text);
});

test("renderToc uses hierarchy depth for mixed sections", () => {
  const result = parseSections("<instructions>\n# Root\n## Child\n</instructions>");
  assertParserInvariants(result);

  const toc = renderToc(result, "prompt.xml");
  expect(toc).toContain("prompt.xml");
  expect(toc).toContain("<instructions> Instructions [#instructions]");
  expect(toc).toContain("  # Root [#root]");
  expect(toc).toContain("    ## Child [#child]");
});

test("adversarial corpus", () => {
  const cases = [
    {
      doc:
        "<a id=\"explicit-one\"></a>\n" +
        "## First\n\n" +
        "## Second {#attr-two}\n\n" +
        "<!-- @id:comment-three -->\n" +
        "## Third\n\n" +
        "## Fourth",
      anchors: ["explicit_one", "attr_two", "comment_three", "fourth"],
      kinds: ["markdown", "markdown", "markdown", "markdown"],
    },
    {
      doc: "<example>Body.</example>\n\n## Markdown",
      anchors: ["example", "markdown"],
      kinds: ["xml", "markdown"],
    },
    {
      doc:
        "<prompt>\n" +
        "## Overview\n" +
        "<examples id=\"worked-examples\">\n" +
        "Example.\n" +
        "</examples>\n" +
        "</prompt>",
      anchors: ["prompt", "overview", "worked_examples"],
      kinds: ["xml", "markdown", "xml"],
    },
  ] as const;

  for (const sharedCase of cases) {
    const result = parseSections(sharedCase.doc);
    assertParserInvariants(result);
    expect(result.sections.map((section) => section.anchorId)).toEqual(sharedCase.anchors);
    expect(result.sections.map((section) => section.kind)).toEqual(sharedCase.kinds);
  }
});

test("counts UTF-8 bytes", () => {
  const result = parseSections("## Unicode\n\nCafé\n");
  assertParserInvariants(result);

  expect(result.totalChars).toBe(18);
  expect(result.sections).toHaveLength(1);
  expect(result.sections[0].charCount).toBe(7);
});

test("extracts links and line numbers", () => {
  const doc =
    "## Links\n\n" +
    "See [Docs](https://example.com/path#frag) and [Local](#local).\n\n" +
    "### Local\n\n" +
    "Done.\n";
  const result = parseSections(doc);
  assertParserInvariants(result);

  expect(result.totalChars).toBe(91);
  expect(result.sections[0].links.map((link) => link.line)).toEqual([3, 3]);
  expect(result.sections[0].links.map((link) => link.label)).toEqual(["Docs", "Local"]);
  expect(result.sections[0].links.map((link) => link.target)).toEqual([
    "https://example.com/path#frag",
    "#local",
  ]);
  expect(result.sections[0].links.map((link) => link.fragment)).toEqual(["frag", "local"]);
});

test("extracts section bodies with normalized lookups", () => {
  const doc =
    "<system id=\"default-agent\">\n" +
    "You are helpful.\n" +
    "</system>\n\n" +
    "<user_template>\n" +
    "User: {question}\n" +
    "</user_template>\n";

  const result = parseSections(doc);
  assertParserInvariants(result);

  expect(sliceSectionContent(doc, result.sections[0])).toBe("You are helpful.");
  expect(sliceSectionContent(doc, result.sections[1])).toBe("User: {question}");
  expect(getSectionText(doc, "default-agent")).toBe("You are helpful.");
  expect(getSectionText(doc, "default_agent")).toBe("You are helpful.");
  expect(getSectionText(doc, "user-template")).toBe("User: {question}");
});
