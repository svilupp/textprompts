"""
Global configuration for TextPrompts.
"""

"""
    MetadataMode

Enum for metadata handling modes.

- `STRICT`: Requires title, description, and version fields to be present and non-empty
- `ALLOW`: Parses metadata if present, but doesn't require it
- `IGNORE`: Treats entire file as body text, uses filename as title
"""
@enum MetadataMode begin
    STRICT
    ALLOW
    IGNORE
end

"""
    parse_metadata_mode(mode) -> MetadataMode

Parse a metadata mode from various input types.
"""
function parse_metadata_mode(mode::MetadataMode)
    return mode
end

function parse_metadata_mode(mode::Symbol)
    mode_lower = lowercase(string(mode))
    if mode_lower == "strict"
        return STRICT
    elseif mode_lower == "allow"
        return ALLOW
    elseif mode_lower == "ignore"
        return IGNORE
    else
        throw(ArgumentError("Invalid metadata mode: $(mode). Use :strict, :allow, or :ignore."))
    end
end

function parse_metadata_mode(mode::AbstractString)
    return parse_metadata_mode(Symbol(mode))
end

# Enable conversion from Symbol and String to MetadataMode
# This allows using symbols directly where MetadataMode is expected
Base.convert(::Type{MetadataMode}, s::Symbol) = parse_metadata_mode(s)
Base.convert(::Type{MetadataMode}, s::AbstractString) = parse_metadata_mode(s)

# Global state for metadata mode
# Default is ALLOW as requested by user
const _METADATA_MODE = Ref{MetadataMode}(ALLOW)
const _WARN_ON_IGNORED = Ref{Bool}(true)

# This method depends on get_metadata, so it's defined after the Ref
function parse_metadata_mode(::Nothing)
    return get_metadata()
end

"""
    set_metadata(mode::Union{MetadataMode, Symbol, String})

Set the global metadata handling mode.

# Arguments
- `mode`: Can be a `MetadataMode` enum value, a Symbol (`:strict`, `:allow`, `:ignore`),
  or a String ("strict", "allow", "ignore")

# Examples
```julia
set_metadata(STRICT)
set_metadata(:allow)
set_metadata("ignore")
```
"""
function set_metadata(mode)
    _METADATA_MODE[] = parse_metadata_mode(mode)
    return nothing
end

"""
    get_metadata() -> MetadataMode

Get the current global metadata handling mode.

# Returns
The current `MetadataMode`.

# Examples
```julia
mode = get_metadata()  # Returns MetadataMode.ALLOW by default
```
"""
function get_metadata()
    return _METADATA_MODE[]
end

"""
    skip_metadata(; skip_warning::Bool=false)

Convenience function to set metadata mode to IGNORE.

# Arguments
- `skip_warning::Bool=false`: If true, also disables warnings about ignored metadata

# Examples
```julia
skip_metadata()  # Set mode to IGNORE
skip_metadata(skip_warning=true)  # Also disable warnings
```
"""
function skip_metadata(; skip_warning::Bool = false)
    _METADATA_MODE[] = IGNORE
    if skip_warning
        _WARN_ON_IGNORED[] = false
    end
    return nothing
end

"""
    warn_on_ignored_metadata() -> Bool

Check if warnings are enabled for ignored metadata.

# Returns
`true` if warnings are enabled, `false` otherwise.
"""
function warn_on_ignored_metadata()
    return _WARN_ON_IGNORED[]
end

# Initialize from environment variable
function __init_config__()
    env_mode = get(ENV, "TEXTPROMPTS_METADATA_MODE", nothing)
    if !isnothing(env_mode)
        try
            set_metadata(env_mode)
        catch
            # Invalid mode, keep default (ALLOW)
            @warn "Invalid TEXTPROMPTS_METADATA_MODE: $(env_mode). Using default mode ALLOW."
        end
    end
end
