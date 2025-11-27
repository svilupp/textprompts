"""
Placeholder extraction and validation utilities.
"""

# Regex to match placeholders in Python-style format strings
# Matches: {name}, {0}, {name:format_spec}, etc.
# Does NOT match: {{escaped}}, {}
const PLACEHOLDER_REGEX = r"\{([^{}:]+)(?::[^{}]*)?\}"

# Regex to detect escaped braces
const ESCAPED_BRACE_REGEX = r"\{\{|\}\}"

"""
    extract_placeholders(text::AbstractString) -> Set{String}

Extract placeholder names from a format string.

Handles:
- Named placeholders: `{name}`
- Positional placeholders: `{0}`, `{1}`
- Format specifiers: `{value:02d}`, `{price:.2f}`
- Escaped braces: `{{literal}}` (ignored)
- Empty placeholders: `{}` (ignored)

# Arguments
- `text::AbstractString`: The format string to analyze

# Returns
A `Set{String}` of unique placeholder names.

# Examples
```julia
extract_placeholders("Hello, {name}!")  # Set(["name"])
extract_placeholders("{a} and {b} and {a}")  # Set(["a", "b"])
extract_placeholders("{{escaped}} and {real}")  # Set(["real"])
extract_placeholders("{0} {1} {2}")  # Set(["0", "1", "2"])
```
"""
function extract_placeholders(text::AbstractString)::Set{String}
    placeholders = Set{String}()

    # Remove escaped braces to avoid false matches
    text_cleaned = replace(text, ESCAPED_BRACE_REGEX => "")

    for m in eachmatch(PLACEHOLDER_REGEX, text_cleaned)
        name = strip(m.captures[1])
        if !isempty(name)
            push!(placeholders, name)
        end
    end

    return placeholders
end

"""
    validate_format_args(placeholders::Set{String}, provided::Dict{String, Any})

Validate that all required placeholders have values provided.

# Arguments
- `placeholders::Set{String}`: The set of required placeholder names
- `provided::Dict{String, Any}`: The provided argument values

# Throws
- `PlaceholderError`: If any placeholders are missing values
"""
function validate_format_args(placeholders::Set{String}, provided::Dict{String, Any})
    provided_keys = Set(keys(provided))
    missing_keys = setdiff(placeholders, provided_keys)

    if !isempty(missing_keys)
        throw(PlaceholderError(sort(collect(missing_keys))))
    end

    return nothing
end

"""
    get_placeholder_info(text::AbstractString) -> NamedTuple

Get detailed information about placeholders in a format string.

# Returns
A named tuple with fields:
- `count::Int`: Number of unique placeholders
- `names::Set{String}`: Set of placeholder names
- `has_positional::Bool`: Whether there are positional placeholders (0, 1, 2, ...)
- `has_named::Bool`: Whether there are named placeholders
- `is_mixed::Bool`: Whether there are both positional and named placeholders

# Examples
```julia
info = get_placeholder_info("Hello, {name}!")
# (count=1, names=Set(["name"]), has_positional=false, has_named=true, is_mixed=false)
```
"""
function get_placeholder_info(text::AbstractString)
    names = extract_placeholders(text)

    # Check for positional vs named
    positional = Set{String}()
    named = Set{String}()

    for name in names
        if all(isdigit, name)
            push!(positional, name)
        else
            push!(named, name)
        end
    end

    return (
        count = length(names),
        names = names,
        has_positional = !isempty(positional),
        has_named = !isempty(named),
        is_mixed = !isempty(positional) && !isempty(named)
    )
end

"""
    _substitute_placeholders(text::AbstractString, values::Dict{String, Any}) -> String

Internal function to substitute placeholders with values.

Handles escaped braces by preserving them.
"""
function _substitute_placeholders(text::AbstractString, values::Dict{String, Any})::String
    # First, temporarily replace escaped braces with placeholders
    temp_open = "\x00OPEN_BRACE\x00"
    temp_close = "\x00CLOSE_BRACE\x00"

    result = replace(text, "{{" => temp_open)
    result = replace(result, "}}" => temp_close)

    # Replace placeholders with values
    # Match both simple {name} and {name:format_spec}
    result = replace(result, r"\{([^{}:]+)(?::[^{}]*)?\}" => function(match)
        # Extract the name from the match
        m = Base.match(r"\{([^{}:]+)", match)
        if m !== nothing
            name = strip(m.captures[1])
            if haskey(values, name)
                return string(values[name])
            end
        end
        return match  # Return unchanged if no value
    end)

    # Restore escaped braces
    result = replace(result, temp_open => "{")
    result = replace(result, temp_close => "}")

    return result
end
