package textprompts

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

const (
	sectionKindPreamble = "preamble"
	sectionKindMarkdown = "markdown"
	sectionKindXML      = "xml"
	defaultSectionSlug  = "section"
	frontmatterYAML     = "yaml"
	frontmatterTOML     = "toml"
	selfClosingAttrKey  = "__self_closing__"
	selfClosingAttrTrue = "true"
)

// Section represents a parsed section of a text document.
type Section struct {
	Kind      string // "preamble", "markdown", or "xml"
	TagName   string // XML tag name when Kind == "xml"
	Heading   string // raw heading text for markdown, derived label for XML
	AnchorID  string // stable ID: explicit > {#id} > auto-slug
	Children  []int  // indices of child sections
	Links     []Link // cross-references found in section content
	Level     int    // markdown heading level, or derived display level for XML
	StartLine int    // 1-based inclusive
	EndLine   int    // 1-based inclusive
	CharCount int    // characters in this section's content (excluding heading/tag wrapper)
	ParentIdx int    // index of parent section (-1 for top-level)
}

// Link represents a cross-reference found in section content.
type Link struct {
	Target   string // raw href
	Fragment string // part after #
	Label    string // link text
	Line     int    // 1-based
}

// Anchor represents an anchor point in the document.
type Anchor struct {
	Kind string // "explicit", "attribute", or "auto"
	ID   string
	Line int
}

// ParseResult holds the complete result of parsing a document into sections.
type ParseResult struct {
	Anchors          map[string]int   // anchor_id -> first section index
	DuplicateAnchors map[string][]int // anchor_id -> all section indices sharing it
	Frontmatter      *FrontmatterBlock
	Sections         []Section // ordered section tree with line ranges
	TotalChars       int       // total characters in the document body after frontmatter
}

// FrontmatterBlock holds parsed frontmatter metadata.
type FrontmatterBlock struct {
	Raw       string
	Format    string // "yaml" or "toml"
	Title     string // extracted from title/name key
	StartLine int
	EndLine   int
}

type pendingAnchor struct {
	id        string
	startLine int
	endLine   int
}

type sectionState struct {
	tagName          string
	kind             string
	idx              int
	markdownLevel    int
	startLine        int
	contentStartLine int
	contentStartCol  int
	sourceStartLine  int
}

type xmlStartToken struct {
	attrs      map[string]string
	tagName    string
	startLine  int
	openEndCol int
}

type xmlBlock struct {
	attrs         map[string]string
	tagName       string
	startLine     int
	endLine       int
	openEndCol    int
	closeStartCol int
}

type fenceState struct {
	active bool
	marker rune
	count  int
}

var (
	reHeading      = regexp.MustCompile(`^\s{0,3}(#{1,6})[ \t]+(.+?)\s*$`)
	reAttrID       = regexp.MustCompile(`\s+\{#([a-zA-Z0-9._-]+)\}\s*$`)
	reXMLComment   = regexp.MustCompile(`^\s*<!--\s*@id:([a-zA-Z0-9._-]+)\s*-->\s*$`)
	reOpenTag      = regexp.MustCompile(`^\s*<([A-Za-z][A-Za-z0-9:._-]*)([^>]*)>`)
	reTagAttr      = regexp.MustCompile(`([A-Za-z_:][A-Za-z0-9:._-]*)\s*=\s*("([^"]*)"|'([^']*)')`)
	reMarkdownLink = regexp.MustCompile(`\[([^\]]*)\]\(([^)]+)\)`)
	reMDFormatting = regexp.MustCompile(`[*_~` + "`" + `]`)
	reLinkInline   = regexp.MustCompile(`\[([^\]]*)\]\([^)]+\)`)
	reHTMLTag      = regexp.MustCompile(`</?[^>]+>`)
)

// ParseSections parses a document into structured sections.
func ParseSections(data []byte) *ParseResult {
	lines := strings.Split(string(data), "\n")
	result := &ParseResult{
		Anchors:          make(map[string]int),
		DuplicateAnchors: make(map[string][]int),
	}

	fmEnd := detectFrontmatter(lines, result)
	bodyStartLine := fmEnd + 1
	if bodyStartLine < 1 {
		bodyStartLine = 1
	}

	result.TotalChars = computeWindowCharCount(
		lines,
		bodyStartLine,
		0,
		len(lines),
		lineEndCol(lines, len(lines)),
	)

	xmlBlocks, unclosedXML := collectXMLBlocks(lines, bodyStartLine)
	xmlStarts := make(map[int][]xmlBlock)
	xmlEnds := make(map[int][]xmlBlock)

	for _, block := range xmlBlocks {
		xmlStarts[block.startLine] = append(xmlStarts[block.startLine], block)
		xmlEnds[block.endLine] = append(xmlEnds[block.endLine], block)
	}

	for lineNum := range xmlStarts {
		sort.Slice(xmlStarts[lineNum], func(i, j int) bool {
			left := xmlStarts[lineNum][i]
			right := xmlStarts[lineNum][j]

			switch {
			case left.startLine != right.startLine:
				return left.startLine < right.startLine
			case left.endLine != right.endLine:
				return left.endLine > right.endLine
			default:
				return left.openEndCol < right.openEndCol
			}
		})
	}

	for lineNum := range xmlEnds {
		sort.Slice(xmlEnds[lineNum], func(i, j int) bool {
			left := xmlEnds[lineNum][i]
			right := xmlEnds[lineNum][j]

			switch {
			case left.endLine != right.endLine:
				return left.endLine < right.endLine
			case left.startLine != right.startLine:
				return left.startLine > right.startLine
			default:
				return left.closeStartCol < right.closeStartCol
			}
		})
	}

	anchorOnlyLines := make(map[int]bool)
	usedAnchorIDs := make(map[string]struct{})
	var stack []sectionState
	var pending *pendingAnchor
	gapStart := bodyStartLine
	var fence fenceState

	for i := bodyStartLine - 1; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		lineNum := i + 1

		if updateFenceState(line, &fence) {
			pending = nil

			continue
		}
		if fence.active {
			pending = nil

			continue
		}

		if id, ok := parseStandaloneAnchorTag(line); ok {
			anchorOnlyLines[lineNum] = true
			pending = mergePendingAnchor(pending, id, lineNum)

			continue
		}

		if id := extractXMLCommentAnchor(line); id != "" {
			anchorOnlyLines[lineNum] = true
			pending = mergePendingAnchor(pending, id, lineNum)

			continue
		}

		if token, ok := unclosedXML[lineNum]; ok {
			if id := explicitAnchorFromAttrs(token.attrs); id != "" {
				anchorOnlyLines[lineNum] = true
				pending = mergePendingAnchor(pending, id, lineNum)

				continue
			}
		}

		if strings.TrimSpace(line) == "" {
			pending = nil
		}

		startBlocks := xmlStarts[lineNum]
		if len(startBlocks) > 0 {
			wasTopLevel := len(stack) == 0
			eventStartLine := lineNum
			if pending != nil {
				eventStartLine = pending.startLine
			}
			if wasTopLevel {
				gapStart = maybeAppendPreamble(result, lines, gapStart, eventStartLine-1, anchorOnlyLines)
			}

			for blockIdx, block := range startBlocks {
				startLine := block.startLine
				if pending != nil && blockIdx == 0 {
					startLine = pending.startLine
				}

				heading := deriveXMLHeading(block.tagName, block.attrs)
				parentIdx := parentIndex(stack)
				level := deriveXMLLevel(result, parentIdx)

				anchorID, explicit := resolveSectionAnchor(
					heading,
					pending,
					explicitAnchorFromAttrs(block.attrs),
					usedAnchorIDs,
				)

				sectionIdx := appendSection(result, &Section{
					Kind:      sectionKindXML,
					TagName:   block.tagName,
					Heading:   heading,
					AnchorID:  anchorID,
					Level:     level,
					StartLine: startLine,
					EndLine:   block.endLine,
					ParentIdx: parentIdx,
				})
				registerAnchor(result, usedAnchorIDs, anchorID, sectionIdx, explicit)

				stack = append(stack, sectionState{
					idx:              sectionIdx,
					kind:             sectionKindXML,
					tagName:          block.tagName,
					markdownLevel:    level,
					startLine:        startLine,
					contentStartLine: block.startLine,
					contentStartCol:  block.openEndCol,
					sourceStartLine:  block.startLine,
				})
			}

			pending = nil
			if wasTopLevel {
				gapStart = len(lines) + 1
			}
		}

		if level, heading, attrID, ok := parseMarkdownHeading(line); ok {
			wasTopLevel := len(stack) == 0
			eventStartLine := lineNum
			if pending != nil {
				eventStartLine = pending.startLine
			}
			if wasTopLevel {
				gapStart = maybeAppendPreamble(result, lines, gapStart, eventStartLine-1, anchorOnlyLines)
			}

			stack = closeMarkdownSections(result, lines, stack, level, lineNum-1, lineEndCol(lines, lineNum-1))

			startLine := lineNum
			if pending != nil {
				startLine = pending.startLine
			}

			parentIdx := parentIndex(stack)
			anchorID, explicit := resolveSectionAnchor(heading, pending, attrID, usedAnchorIDs)

			sectionIdx := appendSection(result, &Section{
				Kind:      sectionKindMarkdown,
				Heading:   heading,
				AnchorID:  anchorID,
				Level:     level,
				StartLine: startLine,
				EndLine:   lineNum,
				ParentIdx: parentIdx,
			})
			registerAnchor(result, usedAnchorIDs, anchorID, sectionIdx, explicit)

			stack = append(stack, sectionState{
				idx:              sectionIdx,
				kind:             sectionKindMarkdown,
				markdownLevel:    level,
				startLine:        startLine,
				contentStartLine: lineNum + 1,
				contentStartCol:  0,
				sourceStartLine:  lineNum,
			})

			pending = nil
			if wasTopLevel {
				gapStart = len(lines) + 1
			}
		}

		if endBlocks := xmlEnds[lineNum]; len(endBlocks) > 0 {
			for _, block := range endBlocks {
				stack = closeXMLBlock(result, lines, stack, block)
			}
			if len(stack) == 0 {
				gapStart = lineNum + 1
			}
		}
	}

	for len(stack) > 0 {
		top := &stack[len(stack)-1]
		finalizeSection(result, lines, top, len(lines), lineEndCol(lines, len(lines)))
		stack = stack[:len(stack)-1]
	}

	if len(result.Sections) == 0 {
		maybeAppendPreamble(result, lines, bodyStartLine, len(lines), anchorOnlyLines)
	} else if gapStart <= len(lines) {
		maybeAppendPreamble(result, lines, gapStart, len(lines), anchorOnlyLines)
	}

	if len(result.DuplicateAnchors) == 0 {
		result.DuplicateAnchors = nil
	}

	return result
}

// GenerateSlug creates a GFM-compatible anchor slug from heading text.
func GenerateSlug(heading string) string {
	s := reLinkInline.ReplaceAllString(heading, "$1")
	s = reHTMLTag.ReplaceAllString(s, "")
	s = reMDFormatting.ReplaceAllString(s, "")
	s = strings.ToLower(s)

	var b strings.Builder
	for _, r := range s {
		switch {
		case unicode.IsSpace(r):
			b.WriteByte('-')
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-':
			b.WriteRune(r)
		}
	}

	slug := b.String()
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = defaultSectionSlug
	}

	return slug
}

// InjectAnchors idempotently injects <a id="..."></a> anchors before markdown headings.
func InjectAnchors(data []byte) ([]byte, *ParseResult) {
	result := ParseSections(data)
	lines := strings.Split(string(data), "\n")

	for i := len(result.Sections) - 1; i >= 0; i-- {
		section := &result.Sections[i]
		if section.Kind != sectionKindMarkdown {
			continue
		}

		headingIdx := findMarkdownHeadingLine(lines, section.StartLine, section.EndLine)
		if headingIdx < 0 {
			continue
		}

		if headingIdx > 0 {
			prevLine := strings.TrimSpace(lines[headingIdx-1])
			if _, ok := parseStandaloneAnchorTag(prevLine); ok || extractXMLCommentAnchor(prevLine) != "" {
				continue
			}
		}

		if _, _, _, ok := parseMarkdownHeading(lines[headingIdx]); !ok {
			continue
		}
		if _, _, attrID, ok := parseMarkdownHeading(lines[headingIdx]); ok && attrID != "" {
			continue
		}

		anchor := fmt.Sprintf(`<a id=%q></a>`, section.AnchorID)
		newLines := make([]string, 0, len(lines)+1)
		newLines = append(newLines, lines[:headingIdx]...)
		newLines = append(newLines, anchor)
		newLines = append(newLines, lines[headingIdx:]...)
		lines = newLines
	}

	output := []byte(strings.Join(lines, "\n"))

	return output, ParseSections(output)
}

// RenderTOC renders a human-readable table of contents.
func RenderTOC(result *ParseResult, path string) string {
	if len(result.Sections) == 0 {
		return ""
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s (%d chars, %d sections)\n", path, result.TotalChars, countRenderableSections(result))

	for i := range result.Sections {
		section := &result.Sections[i]
		if section.Kind == sectionKindPreamble {
			continue
		}

		indent := strings.Repeat("  ", sectionDepth(result.Sections, i))
		prefix := renderSectionPrefix(section)
		fmt.Fprintf(&b, "%s%s %s [#%s] (L%d-L%d, %d chars)\n",
			indent,
			prefix,
			section.Heading,
			section.AnchorID,
			section.StartLine,
			section.EndLine,
			section.CharCount,
		)
	}

	return b.String()
}

// --- internal helpers ---

func detectFrontmatter(lines []string, result *ParseResult) int {
	if len(lines) == 0 {
		return 0
	}

	first := strings.TrimSpace(lines[0])
	var delim string
	var format string

	switch first {
	case "---":
		delim = "---"
		format = frontmatterYAML
	case "+++":
		delim = "+++"
		format = frontmatterTOML
	default:
		return 0
	}

	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == delim {
			raw := strings.Join(lines[1:i], "\n")
			result.Frontmatter = &FrontmatterBlock{
				Raw:       raw,
				Format:    format,
				StartLine: 1,
				EndLine:   i + 1,
				Title:     extractFrontmatterTitle(raw, format),
			}

			return i + 1
		}
	}

	return 0
}

func extractFrontmatterTitle(raw, format string) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		for _, key := range []string{"title", "name"} {
			switch format {
			case frontmatterYAML:
				prefix := key + ":"
				if strings.HasPrefix(line, prefix) {
					return strings.Trim(strings.TrimSpace(strings.TrimPrefix(line, prefix)), `"'`)
				}
			case frontmatterTOML:
				for _, prefix := range []string{key + " =", key + "="} {
					if strings.HasPrefix(line, prefix) {
						return strings.Trim(strings.TrimSpace(strings.TrimPrefix(line, prefix)), `"'`)
					}
				}
			}
		}
	}

	return ""
}

func collectXMLBlocks(lines []string, bodyStartLine int) (blocks []xmlBlock, unclosed map[int]xmlStartToken) {
	unclosed = make(map[int]xmlStartToken)
	var stack []xmlStartToken
	var fence fenceState

	for i := bodyStartLine - 1; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		lineNum := i + 1

		if updateFenceState(line, &fence) {
			continue
		}
		if fence.active {
			continue
		}
		if _, ok := parseStandaloneAnchorTag(line); ok || extractXMLCommentAnchor(line) != "" {
			continue
		}

		if token, ok := parseXMLStartToken(line, lineNum); ok && !tokenIsAnchor(token) && !tokenIsSelfClosing(token) {
			if closeStart, ok := findClosingTagStart(line, token.tagName, token.openEndCol); ok {
				blocks = append(blocks, xmlBlock{
					tagName:       token.tagName,
					attrs:         token.attrs,
					startLine:     token.startLine,
					endLine:       lineNum,
					openEndCol:    token.openEndCol,
					closeStartCol: closeStart,
				})
			} else {
				stack = append(stack, token)
				unclosed[token.startLine] = token
			}
		}

		searchFrom := 0
		for len(stack) > 0 {
			top := stack[len(stack)-1]
			closeStart, ok := findClosingTagStart(line, top.tagName, searchFrom)
			if !ok {
				break
			}
			blocks = append(blocks, xmlBlock{
				tagName:       top.tagName,
				attrs:         top.attrs,
				startLine:     top.startLine,
				endLine:       lineNum,
				openEndCol:    top.openEndCol,
				closeStartCol: closeStart,
			})
			delete(unclosed, top.startLine)
			stack = stack[:len(stack)-1]
			searchFrom = closeStart + 1
		}
	}

	sort.Slice(blocks, func(i, j int) bool {
		left := blocks[i]
		right := blocks[j]

		switch {
		case left.startLine != right.startLine:
			return left.startLine < right.startLine
		case left.endLine != right.endLine:
			return left.endLine > right.endLine
		default:
			return left.openEndCol < right.openEndCol
		}
	})

	return blocks, unclosed
}

func parseMarkdownHeading(line string) (level int, heading, attrID string, ok bool) {
	matches := reHeading.FindStringSubmatch(strings.TrimRight(line, "\r"))
	if matches == nil {
		return 0, "", "", false
	}

	level = len(matches[1])
	heading = strings.TrimSpace(matches[2])
	heading = stripClosingHeadingHashes(heading)
	if attrMatch := reAttrID.FindStringSubmatch(heading); attrMatch != nil {
		attrID = attrMatch[1]
		heading = strings.TrimSpace(reAttrID.ReplaceAllString(heading, ""))
	}

	if heading == "" {
		heading = defaultSectionSlug
	}

	return level, heading, attrID, true
}

func stripClosingHeadingHashes(heading string) string {
	trimmed := strings.TrimSpace(heading)
	if idx := strings.LastIndex(trimmed, " #"); idx >= 0 {
		suffix := strings.TrimSpace(trimmed[idx:])
		if suffix != "" && strings.Trim(suffix, "#") == "" {
			return strings.TrimSpace(trimmed[:idx])
		}
	}

	return trimmed
}

func parseXMLStartToken(line string, lineNum int) (xmlStartToken, bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" ||
		strings.HasPrefix(trimmed, "</") ||
		strings.HasPrefix(trimmed, "<!") ||
		strings.HasPrefix(trimmed, "<?") {
		return xmlStartToken{}, false
	}

	loc := reOpenTag.FindStringSubmatchIndex(line)
	if loc == nil {
		return xmlStartToken{}, false
	}

	matches := reOpenTag.FindStringSubmatch(line)
	if len(matches) < 3 {
		return xmlStartToken{}, false
	}

	attrText := matches[2]
	selfClosing := strings.HasSuffix(strings.TrimSpace(attrText), "/")
	if selfClosing {
		attrText = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(attrText), "/"))
	}

	token := xmlStartToken{
		tagName:    matches[1],
		attrs:      parseTagAttributes(attrText),
		startLine:  lineNum,
		openEndCol: loc[1],
	}

	if selfClosing {
		// Use a sentinel tag name to signal that this is not a block section.
		token.openEndCol = loc[1]
	}

	if selfClosing {
		token.attrs[selfClosingAttrKey] = selfClosingAttrTrue
	}

	return token, true
}

func tokenIsAnchor(token xmlStartToken) bool {
	return strings.EqualFold(token.tagName, "a")
}

func tokenIsSelfClosing(token xmlStartToken) bool {
	return token.attrs[selfClosingAttrKey] == selfClosingAttrTrue
}

func parseStandaloneAnchorTag(line string) (string, bool) {
	token, ok := parseXMLStartToken(line, 1)
	if !ok || !strings.EqualFold(token.tagName, "a") {
		return "", false
	}

	id := explicitAnchorFromAttrs(token.attrs)
	if id == "" {
		return "", false
	}

	remainder := strings.TrimSpace(line[token.openEndCol:])
	if token.attrs[selfClosingAttrKey] == selfClosingAttrTrue {
		return id, remainder == ""
	}

	closeStart, closeEnd, ok := findClosingTagRange(line, token.tagName, token.openEndCol)
	if !ok {
		return "", false
	}

	if strings.TrimSpace(line[token.openEndCol:closeStart]) != "" {
		return "", false
	}
	if strings.TrimSpace(line[closeEnd:]) != "" {
		return "", false
	}

	return id, true
}

func parseTagAttributes(attrText string) map[string]string {
	attrs := make(map[string]string)
	for _, match := range reTagAttr.FindAllStringSubmatch(attrText, -1) {
		if len(match) < 5 {
			continue
		}
		value := match[3]
		if value == "" {
			value = match[4]
		}
		attrs[strings.ToLower(match[1])] = value
	}

	return attrs
}

func explicitAnchorFromAttrs(attrs map[string]string) string {
	for _, key := range []string{"id", "name"} {
		if value := strings.TrimSpace(attrs[key]); value != "" {
			return value
		}
	}

	return ""
}

func extractXMLCommentAnchor(line string) string {
	matches := reXMLComment.FindStringSubmatch(strings.TrimRight(line, "\r"))
	if matches == nil {
		return ""
	}

	return matches[1]
}

func mergePendingAnchor(existing *pendingAnchor, id string, lineNum int) *pendingAnchor {
	if existing == nil {
		return &pendingAnchor{id: id, startLine: lineNum, endLine: lineNum}
	}

	return &pendingAnchor{id: id, startLine: existing.startLine, endLine: lineNum}
}

func resolveSectionAnchor(
	heading string,
	pending *pendingAnchor,
	explicitID string,
	usedAnchorIDs map[string]struct{},
) (string, bool) {
	switch {
	case pending != nil && pending.id != "":
		return pending.id, true
	case explicitID != "":
		return explicitID, true
	default:
		return uniqueGeneratedAnchor(GenerateSlug(heading), usedAnchorIDs), false
	}
}

func uniqueGeneratedAnchor(base string, used map[string]struct{}) string {
	if base == "" {
		base = defaultSectionSlug
	}
	if _, exists := used[base]; !exists {
		return base
	}
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s-%d", base, i)
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
}

func registerAnchor(result *ParseResult, used map[string]struct{}, anchorID string, sectionIdx int, explicit bool) {
	if anchorID == "" {
		return
	}
	if !explicit {
		result.Anchors[anchorID] = sectionIdx
		used[anchorID] = struct{}{}

		return
	}

	if _, exists := used[anchorID]; !exists {
		result.Anchors[anchorID] = sectionIdx
		used[anchorID] = struct{}{}

		return
	}

	if _, ok := result.DuplicateAnchors[anchorID]; !ok {
		result.DuplicateAnchors[anchorID] = []int{result.Anchors[anchorID]}
	}
	result.DuplicateAnchors[anchorID] = append(result.DuplicateAnchors[anchorID], sectionIdx)
}

func appendSection(result *ParseResult, section *Section) int {
	idx := len(result.Sections)
	if section.ParentIdx >= 0 {
		result.Sections[section.ParentIdx].Children = append(result.Sections[section.ParentIdx].Children, idx)
	}

	result.Sections = append(result.Sections, *section)

	return idx
}

func maybeAppendPreamble(
	result *ParseResult,
	lines []string,
	startLine int,
	endLine int,
	skipLines map[int]bool,
) int {
	if startLine <= 0 {
		startLine = 1
	}
	if endLine < startLine {
		return startLine
	}
	if !windowHasContent(lines, startLine, endLine, skipLines) {
		return endLine + 1
	}

	chars, links := computeWindowStatsSkippingLines(lines, startLine, 0, endLine, lineEndCol(lines, endLine), skipLines)
	appendSection(result, &Section{
		Kind:      sectionKindPreamble,
		Heading:   "",
		AnchorID:  "",
		Level:     0,
		StartLine: startLine,
		EndLine:   endLine,
		CharCount: chars,
		ParentIdx: -1,
		Links:     links,
	})

	return endLine + 1
}

func closeMarkdownSections(
	result *ParseResult,
	lines []string,
	stack []sectionState,
	newLevel int,
	endLine int,
	endCol int,
) []sectionState {
	for len(stack) > 0 {
		top := &stack[len(stack)-1]
		if top.kind != sectionKindMarkdown || top.markdownLevel < newLevel {
			break
		}
		finalizeSection(result, lines, top, endLine, endCol)
		stack = stack[:len(stack)-1]
	}

	return stack
}

func closeXMLBlock(
	result *ParseResult,
	lines []string,
	stack []sectionState,
	block xmlBlock,
) []sectionState {
	for len(stack) > 0 {
		top := &stack[len(stack)-1]
		finalizeSection(result, lines, top, block.endLine, block.closeStartCol)
		stack = stack[:len(stack)-1]
		if top.kind == sectionKindXML && top.sourceStartLine == block.startLine && top.tagName == block.tagName {
			break
		}
	}

	return stack
}

func finalizeSection(result *ParseResult, lines []string, state *sectionState, endLine, endCol int) {
	section := &result.Sections[state.idx]
	section.EndLine = endLine
	section.CharCount, section.Links = computeWindowStats(
		lines,
		state.contentStartLine,
		state.contentStartCol,
		endLine,
		endCol,
	)
}

func parentIndex(stack []sectionState) int {
	if len(stack) == 0 {
		return -1
	}

	return stack[len(stack)-1].idx
}

func deriveXMLLevel(result *ParseResult, parentIdx int) int {
	if parentIdx < 0 {
		return 1
	}
	parent := result.Sections[parentIdx]
	if parent.Level <= 0 {
		return 1
	}

	return parent.Level + 1
}

func deriveXMLHeading(tagName string, attrs map[string]string) string {
	for _, key := range []string{"heading", "title", "label", "name"} {
		if value := strings.TrimSpace(attrs[key]); value != "" {
			return value
		}
	}
	if id := strings.TrimSpace(attrs["id"]); id != "" {
		return humanizeIdentifier(id)
	}

	return humanizeIdentifier(tagName)
}

func humanizeIdentifier(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Section"
	}
	fields := strings.FieldsFunc(value, func(r rune) bool {
		return r == '-' || r == '_' || r == ':' || unicode.IsSpace(r)
	})
	if len(fields) == 0 {
		return "Section"
	}
	for i, field := range fields {
		runes := []rune(strings.ToLower(field))
		if len(runes) == 0 {
			continue
		}
		runes[0] = unicode.ToUpper(runes[0])
		fields[i] = string(runes)
	}

	return strings.Join(fields, " ")
}

func updateFenceState(line string, state *fenceState) bool {
	trimmed := strings.TrimLeft(line, " \t")
	if trimmed == "" {
		return false
	}

	marker := rune(trimmed[0])
	if marker != '`' && marker != '~' {
		return false
	}

	count := 0
	for _, r := range trimmed {
		if r != marker {
			break
		}
		count++
	}
	if count < 3 {
		return false
	}

	if !state.active {
		state.active = true
		state.marker = marker
		state.count = count

		return true
	}

	if state.marker == marker && count >= state.count {
		state.active = false
		state.marker = 0
		state.count = 0

		return true
	}

	return false
}

func computeWindowStats(lines []string, startLine, startCol, endLine, endCol int) (int, []Link) {
	return computeWindowStatsSkippingLines(lines, startLine, startCol, endLine, endCol, nil)
}

func computeWindowStatsSkippingLines(
	lines []string,
	startLine, startCol, endLine, endCol int,
	skipLines map[int]bool,
) (int, []Link) {
	if !validWindow(lines, startLine, endLine) {
		return 0, nil
	}

	segments := make([]string, 0, endLine-startLine+1)
	segmentLines := make([]int, 0, endLine-startLine+1)

	for lineNum := startLine; lineNum <= endLine; lineNum++ {
		if skipLines != nil && skipLines[lineNum] {
			continue
		}
		segment := sliceWindowLine(lines, lineNum, startLine, startCol, endLine, endCol)
		segments = append(segments, segment)
		segmentLines = append(segmentLines, lineNum)
	}

	if len(segments) == 0 {
		return 0, nil
	}

	chars := 0
	for i, segment := range segments {
		chars += len(segment)
		if i < len(segments)-1 {
			chars++
		}
	}

	var links []Link
	for i, segment := range segments {
		for _, match := range reMarkdownLink.FindAllStringSubmatch(segment, -1) {
			href := match[2]
			fragment := ""
			if hashIdx := strings.Index(href, "#"); hashIdx >= 0 {
				fragment = href[hashIdx+1:]
			}
			links = append(links, Link{
				Target:   match[2],
				Fragment: fragment,
				Label:    match[1],
				Line:     segmentLines[i],
			})
		}
	}

	return chars, links
}

func computeWindowCharCount(lines []string, startLine, startCol, endLine, endCol int) int {
	chars, _ := computeWindowStats(lines, startLine, startCol, endLine, endCol)
	return chars
}

func validWindow(lines []string, startLine, endLine int) bool {
	if len(lines) == 0 || startLine <= 0 || endLine <= 0 {
		return false
	}
	if startLine > len(lines) {
		return false
	}

	return startLine <= endLine
}

func sliceWindowLine(lines []string, lineNum, startLine, startCol, endLine, endCol int) string {
	if lineNum <= 0 || lineNum > len(lines) {
		return ""
	}
	line := strings.TrimRight(lines[lineNum-1], "\r")
	from := 0
	to := len(line)

	if lineNum == startLine {
		from = clamp(startCol, 0, len(line))
	}
	if lineNum == endLine {
		if endCol >= 0 {
			to = clamp(endCol, 0, len(line))
		}
	}
	if to < from {
		to = from
	}

	return line[from:to]
}

func lineEndCol(lines []string, lineNum int) int {
	if lineNum <= 0 || lineNum > len(lines) {
		return 0
	}

	return len(strings.TrimRight(lines[lineNum-1], "\r"))
}

func clamp(value, lower, upper int) int {
	if value < lower {
		return lower
	}
	if value > upper {
		return upper
	}

	return value
}

func windowHasContent(lines []string, startLine, endLine int, skipLines map[int]bool) bool {
	if !validWindow(lines, startLine, endLine) {
		return false
	}
	for lineNum := startLine; lineNum <= endLine; lineNum++ {
		if skipLines != nil && skipLines[lineNum] {
			continue
		}
		if strings.TrimSpace(strings.TrimRight(lines[lineNum-1], "\r")) != "" {
			return true
		}
	}

	return false
}

func findClosingTagStart(line, tagName string, from int) (int, bool) {
	start, _, ok := findClosingTagRange(line, tagName, from)

	return start, ok
}

func findClosingTagRange(line, tagName string, from int) (start, end int, ok bool) {
	pattern := regexp.MustCompile(`</\s*` + regexp.QuoteMeta(tagName) + `\s*>`)
	loc := pattern.FindStringIndex(line[from:])
	if loc == nil {
		return 0, 0, false
	}

	return from + loc[0], from + loc[1], true
}

func renderSectionPrefix(section *Section) string {
	if section.Kind == sectionKindXML {
		if section.TagName == "" {
			return "<xml>"
		}

		return fmt.Sprintf("<%s>", section.TagName)
	}
	if section.Level <= 0 {
		return "-"
	}

	return strings.Repeat("#", section.Level)
}

func sectionDepth(sections []Section, idx int) int {
	depth := 0
	for parent := sections[idx].ParentIdx; parent >= 0; parent = sections[parent].ParentIdx {
		depth++
	}

	return depth
}

func countRenderableSections(result *ParseResult) int {
	count := 0
	for i := range result.Sections {
		section := &result.Sections[i]
		if section.Kind != sectionKindPreamble {
			count++
		}
	}

	return count
}

func findMarkdownHeadingLine(lines []string, startLine, endLine int) int {
	if startLine < 1 {
		startLine = 1
	}
	if endLine > len(lines) {
		endLine = len(lines)
	}
	for i := startLine - 1; i < endLine; i++ {
		if _, _, _, ok := parseMarkdownHeading(lines[i]); ok {
			return i
		}
	}

	return -1
}
