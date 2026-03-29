# API Reference

## Types

```@docs
MetadataMode
PromptMeta
PromptString
Prompt
Section
Link
FrontmatterBlock
ParseResult
```

## Loading and Saving

```@docs
load_prompt
load_section
save_prompt
```

## Formatting

```@docs
TextPrompts.format
```

## Section Parsing

```@docs
parse_sections
generate_slug
normalize_anchor_id
inject_anchors
render_toc
get_section_text
```

## Configuration

```@docs
set_metadata
get_metadata
skip_metadata
warn_on_ignored_metadata
```

## Placeholder Utilities

```@docs
extract_placeholders
get_placeholder_info
validate_format_args
```

