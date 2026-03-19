package textprompts

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type expectedSection struct {
	kind      string
	tag       string
	heading   string
	anchor    string
	children  []int
	level     int
	startLine int
	endLine   int
	parentIdx int
	charCount int
}

type sharedCorpusCase struct {
	Name     string         `json:"name"`
	Document string         `json:"document"`
	Expected sharedExpected `json:"expected"`
}

type sharedExpected struct {
	Anchors          map[string]int     `json:"anchors"`
	DuplicateAnchors map[string][]int   `json:"duplicateAnchors"`
	Frontmatter      *sharedFrontmatter `json:"frontmatter"`
	Sections         []sharedSection    `json:"sections"`
	TotalChars       int                `json:"totalChars"`
}

type sharedSection struct {
	Kind      string       `json:"kind"`
	TagName   string       `json:"tagName"`
	Heading   string       `json:"heading"`
	AnchorID  string       `json:"anchorId"`
	Links     []sharedLink `json:"links"`
	Children  []int        `json:"children"`
	Level     int          `json:"level"`
	StartLine int          `json:"startLine"`
	EndLine   int          `json:"endLine"`
	ParentIdx int          `json:"parentIdx"`
	CharCount int          `json:"charCount"`
}

type sharedLink struct {
	Target   string `json:"target"`
	Fragment string `json:"fragment"`
	Label    string `json:"label"`
	Line     int    `json:"line"`
}

type sharedFrontmatter struct {
	Raw       string `json:"raw"`
	Format    string `json:"format"`
	Title     string `json:"title"`
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
}

func TestGenerateSlug(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Hello World", "hello_world"},
		{"GCP Projects", "gcp_projects"},
		{"Memory Architecture Design", "memory_architecture_design"},
		{"**Bold** and *italic*", "bold_and_italic"},
		{"`code` blocks", "code_blocks"},
		{"[Link Text](http://example.com)", "link_text"},
		{"<em>Inline HTML</em>", "inline_html"},
		{"Multiple   Spaces", "multiple_spaces"},
		{"Special!@#$%^&*()chars", "special_chars"},
		{"  Leading/Trailing  ", "leading_trailing"},
		{"123 Numbers First", "123_numbers_first"},
		{"---dashes---", "dashes"},
		{"", "section"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := GenerateSlug(tt.input)
			if got != tt.want {
				t.Fatalf("GenerateSlug(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseSections_MarkdownHierarchyUsesOverlappingRanges(t *testing.T) {
	doc := `# Title

Some intro text.

## Section One

Content of section one.

## Section Two

Content of section two.

### Subsection

Nested content.`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindMarkdown,
			heading:   "Title",
			anchor:    "title",
			level:     1,
			startLine: 1,
			endLine:   15,
			parentIdx: -1,
			children:  []int{1, 2},
			charCount: 132,
		},
		{
			kind:      sectionKindMarkdown,
			heading:   "Section One",
			anchor:    "section_one",
			level:     2,
			startLine: 5,
			endLine:   8,
			parentIdx: 0,
			children:  nil,
			charCount: 25,
		},
		{
			kind:      sectionKindMarkdown,
			heading:   "Section Two",
			anchor:    "section_two",
			level:     2,
			startLine: 9,
			endLine:   15,
			parentIdx: 0,
			children:  []int{3},
			charCount: 57,
		},
		{
			kind:      sectionKindMarkdown,
			heading:   "Subsection",
			anchor:    "subsection",
			level:     3,
			startLine: 13,
			endLine:   15,
			parentIdx: 2,
			children:  nil,
			charCount: 16,
		},
	})
}

func TestParseSections_PreambleBeforeFirstSection(t *testing.T) {
	doc := `Some content before any heading.

More preamble.

## First Heading

Content.`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindPreamble,
			heading:   "",
			anchor:    "",
			level:     0,
			startLine: 1,
			endLine:   4,
			parentIdx: -1,
			children:  nil,
			charCount: 49,
		},
		{
			kind:      sectionKindMarkdown,
			heading:   "First Heading",
			anchor:    "first_heading",
			level:     2,
			startLine: 5,
			endLine:   7,
			parentIdx: -1,
			children:  nil,
			charCount: 9,
		},
	})
}

func TestParseSections_ExplicitAnchorCharCountExcludesHeading(t *testing.T) {
	doc := `<a id="custom-id"></a>
## My Section

Body.`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindMarkdown,
			heading:   "My Section",
			anchor:    "custom_id",
			level:     2,
			startLine: 1,
			endLine:   4,
			parentIdx: -1,
			children:  nil,
			charCount: 6,
		},
	})
}

func TestParseSections_ClosedXMLSectionsBecomeRealSections(t *testing.T) {
	doc := `<section id="data-flow">
## Data Flow

Content.
</section>`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindXML,
			tag:       "section",
			heading:   "Data Flow",
			anchor:    "data_flow",
			level:     1,
			startLine: 1,
			endLine:   5,
			parentIdx: -1,
			children:  []int{1},
			charCount: 24,
		},
		{
			kind:      sectionKindMarkdown,
			heading:   "Data Flow",
			anchor:    "data_flow_2",
			level:     2,
			startLine: 2,
			endLine:   5,
			parentIdx: 0,
			children:  nil,
			charCount: 10,
		},
	})
}

func TestParseSections_GenericXMLSectionsSupportDerivedHeadings(t *testing.T) {
	doc := `<instructions>
Follow the instructions carefully.
</instructions>

<examples title="Worked Example">Example.</examples>`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindXML,
			tag:       "instructions",
			heading:   "Instructions",
			anchor:    "instructions",
			level:     1,
			startLine: 1,
			endLine:   3,
			parentIdx: -1,
			children:  nil,
			charCount: 36,
		},
		{
			kind:      sectionKindXML,
			tag:       "examples",
			heading:   "Worked Example",
			anchor:    "examples",
			level:     1,
			startLine: 5,
			endLine:   5,
			parentIdx: -1,
			children:  nil,
			charCount: 8,
		},
	})
}

func TestParseSections_NestedXMLOuterFirst(t *testing.T) {
	doc := `<prompt id="prompt-root">
<section id="inner-one">
Inner one.
</section>
<section id="inner-two">
Inner two.
</section>
</prompt>`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindXML,
			tag:       "prompt",
			heading:   "Prompt Root",
			anchor:    "prompt_root",
			level:     1,
			startLine: 1,
			endLine:   8,
			parentIdx: -1,
			children:  []int{1, 2},
			charCount: 95,
		},
		{
			kind:      sectionKindXML,
			tag:       "section",
			heading:   "Inner One",
			anchor:    "inner_one",
			level:     2,
			startLine: 2,
			endLine:   4,
			parentIdx: 0,
			children:  nil,
			charCount: 12,
		},
		{
			kind:      sectionKindXML,
			tag:       "section",
			heading:   "Inner Two",
			anchor:    "inner_two",
			level:     2,
			startLine: 5,
			endLine:   7,
			parentIdx: 0,
			children:  nil,
			charCount: 12,
		},
	})
}

func TestParseSections_UnclosedXMLFallsBackToPendingAnchor(t *testing.T) {
	doc := `<section id="custom-id">
## Heading

Body.`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindMarkdown,
			heading:   "Heading",
			anchor:    "custom_id",
			level:     2,
			startLine: 1,
			endLine:   4,
			parentIdx: -1,
			children:  nil,
			charCount: 6,
		},
	})
}

func TestParseSections_IgnoresCodeFences(t *testing.T) {
	doc := "```xml\n<section id=\"ignored\">\n## Also Ignored\n</section>\n```\n\n## Real Heading\n\nBody."

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindPreamble,
			heading:   "",
			anchor:    "",
			level:     0,
			startLine: 1,
			endLine:   6,
			parentIdx: -1,
			children:  nil,
			charCount: 61,
		},
		{
			kind:      sectionKindMarkdown,
			heading:   "Real Heading",
			anchor:    "real_heading",
			level:     2,
			startLine: 7,
			endLine:   9,
			parentIdx: -1,
			children:  nil,
			charCount: 6,
		},
	})
}

func TestParseSections_AlternateAnchorSyntaxAndHeadingCleanup(t *testing.T) {
	doc := `<a class="x" name='named-anchor'></a>
   ## Heading ##`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindMarkdown,
			heading:   "Heading",
			anchor:    "named_anchor",
			level:     2,
			startLine: 1,
			endLine:   2,
			parentIdx: -1,
			children:  nil,
			charCount: 0,
		},
	})
}

func TestParseSections_DuplicateExplicitAnchorsAreReported(t *testing.T) {
	doc := `<a id="dup"></a>
## One

<a id='dup'></a>
## Two`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)

	if len(result.Sections) != 2 {
		t.Fatalf("expected 2 sections, got %d", len(result.Sections))
	}
	if result.Sections[0].AnchorID != "dup" || result.Sections[1].AnchorID != "dup" {
		t.Fatalf("explicit anchors should be preserved, got %q and %q", result.Sections[0].AnchorID, result.Sections[1].AnchorID)
	}
	if idx := result.Anchors["dup"]; idx != 0 {
		t.Fatalf("expected first duplicate anchor to remain canonical, got %d", idx)
	}
	if !reflect.DeepEqual(result.DuplicateAnchors["dup"], []int{0, 1}) {
		t.Fatalf("unexpected duplicate anchor map: %#v", result.DuplicateAnchors)
	}
}

func TestParseSections_InterstitialTopLevelGapBecomesPreamble(t *testing.T) {
	doc := `<section id="outer">
Body.
</section>

Loose text.

## Next

Body.`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)
	assertSections(t, result.Sections, []expectedSection{
		{
			kind:      sectionKindXML,
			tag:       "section",
			heading:   "Outer",
			anchor:    "outer",
			level:     1,
			startLine: 1,
			endLine:   3,
			parentIdx: -1,
			children:  nil,
			charCount: 7,
		},
		{
			kind:      sectionKindPreamble,
			heading:   "",
			anchor:    "",
			level:     0,
			startLine: 4,
			endLine:   6,
			parentIdx: -1,
			children:  nil,
			charCount: 13,
		},
		{
			kind:      sectionKindMarkdown,
			heading:   "Next",
			anchor:    "next",
			level:     2,
			startLine: 7,
			endLine:   9,
			parentIdx: -1,
			children:  nil,
			charCount: 6,
		},
	})
}

func TestParseSections_FrontmatterAndTotalChars(t *testing.T) {
	doc := `---
title: My Document
tags: [memory, retrieval]
---

## First Section

Content.`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)

	if result.Frontmatter == nil {
		t.Fatal("expected frontmatter to be parsed")
	}
	if result.Frontmatter.Format != "yaml" {
		t.Fatalf("expected yaml frontmatter, got %q", result.Frontmatter.Format)
	}
	if result.Frontmatter.Title != "My Document" {
		t.Fatalf("expected title My Document, got %q", result.Frontmatter.Title)
	}
	if result.TotalChars != 27 {
		t.Fatalf("expected body char count 27, got %d", result.TotalChars)
	}
}

func TestInjectAnchors_IsIdempotentAndMarkdownOnly(t *testing.T) {
	doc := `<instructions>
Body.
</instructions>

## First Section

Content.

## Existing {#custom-id}

More.`

	output, result := InjectAnchors([]byte(doc))
	assertParserInvariants(t, result)

	text := string(output)
	if !strings.Contains(text, `<a id="first_section"></a>`) {
		t.Fatal("expected anchor injection for markdown heading without explicit id")
	}
	if strings.Contains(text, `<a id="instructions"></a>`) {
		t.Fatal("should not inject anchors for XML sections")
	}
	if strings.Count(text, `<a id="first_section"></a>`) != 1 {
		t.Fatal("expected exactly one injected first_section anchor")
	}

	output2, result2 := InjectAnchors(output)
	assertParserInvariants(t, result2)
	if !bytes.Equal(output, output2) {
		t.Fatal("InjectAnchors should be idempotent")
	}
}

func TestRenderTOC_UsesHierarchyDepthForMixedSections(t *testing.T) {
	doc := `<instructions>
# Root
## Child
</instructions>`

	result := ParseSections([]byte(doc))
	assertParserInvariants(t, result)

	toc := RenderTOC(result, "prompt.xml")
	if !strings.Contains(toc, "prompt.xml") {
		t.Fatal("TOC should include the path")
	}
	if !strings.Contains(toc, `<instructions> Instructions [#instructions]`) {
		t.Fatal("TOC should render XML sections with their tag names")
	}
	if !strings.Contains(toc, "  # Root [#root]") {
		t.Fatal("TOC should indent markdown sections under XML parents")
	}
	if !strings.Contains(toc, "    ## Child [#child]") {
		t.Fatal("TOC should indent nested markdown children by hierarchy depth")
	}
}

func TestParseSections_AdversarialCorpus(t *testing.T) {
	cases := []struct {
		name        string
		doc         string
		wantAnchors []string
		wantKinds   []string
	}{
		{
			name: "mixed anchor sources",
			doc: `<a id="explicit-one"></a>
## First

## Second {#attr-two}

<!-- @id:comment-three -->
## Third

## Fourth`,
			wantAnchors: []string{"explicit_one", "attr_two", "comment_three", "fourth"},
			wantKinds:   []string{sectionKindMarkdown, sectionKindMarkdown, sectionKindMarkdown, sectionKindMarkdown},
		},
		{
			name: "same-line xml and generated anchor",
			doc: `<example>Body.</example>

## Markdown`,
			wantAnchors: []string{"example", "markdown"},
			wantKinds:   []string{sectionKindXML, sectionKindMarkdown},
		},
		{
			name: "mixed xml and markdown nesting",
			doc: `<prompt>
## Overview
<examples id="worked-examples">
Example.
</examples>
</prompt>`,
			wantAnchors: []string{"prompt", "overview", "worked_examples"},
			wantKinds:   []string{sectionKindXML, sectionKindMarkdown, sectionKindXML},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := ParseSections([]byte(tc.doc))
			assertParserInvariants(t, result)

			if len(result.Sections) != len(tc.wantAnchors) {
				t.Fatalf("expected %d sections, got %d", len(tc.wantAnchors), len(result.Sections))
			}

			for i, anchor := range tc.wantAnchors {
				if result.Sections[i].AnchorID != anchor {
					t.Fatalf("section %d anchor = %q, want %q", i, result.Sections[i].AnchorID, anchor)
				}
				if result.Sections[i].Kind != tc.wantKinds[i] {
					t.Fatalf("section %d kind = %q, want %q", i, result.Sections[i].Kind, tc.wantKinds[i])
				}
			}
		})
	}
}

func TestParseSections_SharedCorpus(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", "sections", "cases.json"))
	if err != nil {
		t.Fatalf("read shared corpus: %v", err)
	}

	var cases []sharedCorpusCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatalf("unmarshal shared corpus: %v", err)
	}

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			result := ParseSections([]byte(tc.Document))
			assertParserInvariants(t, result)

			got := normalizeParseResult(result)
			if !reflect.DeepEqual(got, tc.Expected) {
				t.Fatalf("normalized ParseSections result mismatch\n got: %#v\nwant: %#v", got, tc.Expected)
			}
		})
	}
}

func assertParserInvariants(t *testing.T, result *ParseResult) {
	t.Helper()

	for i := range result.Sections {
		section := &result.Sections[i]
		if section.StartLine <= 0 {
			t.Fatalf("section %d has invalid StartLine %d", i, section.StartLine)
		}
		if section.EndLine < section.StartLine {
			t.Fatalf("section %d has invalid line range %d-%d", i, section.StartLine, section.EndLine)
		}
		if i > 0 {
			prev := result.Sections[i-1]
			if section.StartLine < prev.StartLine {
				t.Fatalf("sections are not sorted by StartLine at %d", i)
			}
			if section.StartLine == prev.StartLine && section.EndLine > prev.EndLine {
				t.Fatalf("parent sections should appear before children when sharing a start line")
			}
		}
		if section.ParentIdx >= 0 {
			if section.ParentIdx >= i {
				t.Fatalf("section %d has invalid parent index %d", i, section.ParentIdx)
			}
			parent := result.Sections[section.ParentIdx]
			if parent.StartLine > section.StartLine || parent.EndLine < section.EndLine {
				t.Fatalf("parent %d does not contain child %d", section.ParentIdx, i)
			}
		}
		for _, childIdx := range section.Children {
			if childIdx <= i || childIdx >= len(result.Sections) {
				t.Fatalf("section %d has invalid child index %d", i, childIdx)
			}
			if result.Sections[childIdx].ParentIdx != i {
				t.Fatalf("child %d does not point back to parent %d", childIdx, i)
			}
		}
		if section.AnchorID != "" {
			firstIdx, ok := result.Anchors[section.AnchorID]
			if !ok {
				t.Fatalf("section %d anchor %q missing from anchor map", i, section.AnchorID)
			}
			duplicates, duplicated := result.DuplicateAnchors[section.AnchorID]
			if duplicated {
				if firstIdx != duplicates[0] {
					t.Fatalf("duplicate anchor %q should map to first section", section.AnchorID)
				}
			} else if firstIdx != i {
				t.Fatalf("unique anchor %q should map to its own section index", section.AnchorID)
			}
		}
	}
}

func assertSections(t *testing.T, got []Section, want []expectedSection) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("expected %d sections, got %d", len(want), len(got))
	}

	for i := range want {
		expected := &want[i]
		actual := &got[i]
		if actual.Kind != expected.kind {
			t.Fatalf("section %d kind = %q, want %q", i, actual.Kind, expected.kind)
		}
		if actual.TagName != expected.tag {
			t.Fatalf("section %d tag = %q, want %q", i, actual.TagName, expected.tag)
		}
		if actual.Heading != expected.heading {
			t.Fatalf("section %d heading = %q, want %q", i, actual.Heading, expected.heading)
		}
		if actual.AnchorID != expected.anchor {
			t.Fatalf("section %d anchor = %q, want %q", i, actual.AnchorID, expected.anchor)
		}
		if actual.Level != expected.level {
			t.Fatalf("section %d level = %d, want %d", i, actual.Level, expected.level)
		}
		if actual.StartLine != expected.startLine || actual.EndLine != expected.endLine {
			t.Fatalf(
				"section %d lines = %d-%d, want %d-%d",
				i,
				actual.StartLine,
				actual.EndLine,
				expected.startLine,
				expected.endLine,
			)
		}
		if actual.ParentIdx != expected.parentIdx {
			t.Fatalf("section %d parent = %d, want %d", i, actual.ParentIdx, expected.parentIdx)
		}
		if !reflect.DeepEqual(actual.Children, expected.children) {
			t.Fatalf("section %d children = %#v, want %#v", i, actual.Children, expected.children)
		}
		if actual.CharCount != expected.charCount {
			t.Fatalf("section %d CharCount = %d, want %d", i, actual.CharCount, expected.charCount)
		}
	}
}

func normalizeParseResult(result *ParseResult) sharedExpected {
	normalized := sharedExpected{
		Sections:         make([]sharedSection, 0, len(result.Sections)),
		Anchors:          copyAnchorMap(result.Anchors),
		DuplicateAnchors: copyDuplicateAnchors(result.DuplicateAnchors),
		TotalChars:       result.TotalChars,
	}

	if normalized.Anchors == nil {
		normalized.Anchors = map[string]int{}
	}
	if normalized.DuplicateAnchors == nil {
		normalized.DuplicateAnchors = map[string][]int{}
	}

	if result.Frontmatter != nil {
		normalized.Frontmatter = &sharedFrontmatter{
			Raw:       result.Frontmatter.Raw,
			Format:    result.Frontmatter.Format,
			StartLine: result.Frontmatter.StartLine,
			EndLine:   result.Frontmatter.EndLine,
			Title:     result.Frontmatter.Title,
		}
	}

	for i := range result.Sections {
		section := &result.Sections[i]
		normalized.Sections = append(normalized.Sections, sharedSection{
			Links:     normalizeLinks(section.Links),
			Children:  copyIntSlice(section.Children),
			Kind:      section.Kind,
			TagName:   section.TagName,
			Heading:   section.Heading,
			AnchorID:  section.AnchorID,
			Level:     section.Level,
			StartLine: section.StartLine,
			EndLine:   section.EndLine,
			ParentIdx: section.ParentIdx,
			CharCount: section.CharCount,
		})
	}

	return normalized
}

func normalizeLinks(links []Link) []sharedLink {
	if len(links) == 0 {
		return []sharedLink{}
	}

	normalized := make([]sharedLink, 0, len(links))
	for _, link := range links {
		normalized = append(normalized, sharedLink(link))
	}

	return normalized
}

func copyAnchorMap(src map[string]int) map[string]int {
	if len(src) == 0 {
		return map[string]int{}
	}

	dst := make(map[string]int, len(src))
	for key, value := range src {
		dst[key] = value
	}

	return dst
}

func copyDuplicateAnchors(src map[string][]int) map[string][]int {
	if len(src) == 0 {
		return map[string][]int{}
	}

	dst := make(map[string][]int, len(src))
	for key, value := range src {
		dst[key] = copyIntSlice(value)
	}

	return dst
}

func copyIntSlice(src []int) []int {
	if len(src) == 0 {
		return []int{}
	}
	dst := make([]int, len(src))
	copy(dst, src)

	return dst
}
