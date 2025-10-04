module Config

export MetadataMode, set_metadata, get_metadata, skip_metadata, warn_on_ignored_metadata,
       resolve_metadata_mode, with_metadata_mode

@enum MetadataMode begin
    STRICT
    ALLOW
    IGNORE
end

const ENV_VAR = "TEXTPROMPTS_METADATA_MODE"
const _metadata_mode = Ref(MetadataMode.IGNORE)
const _warn_on_ignored = Ref(true)

function __init__()
    if haskey(ENV, ENV_VAR)
        try
            set_metadata(ENV[ENV_VAR])
        catch err
            @warn "Ignoring invalid TEXTPROMPTS_METADATA_MODE" value=ENV[ENV_VAR] err
        end
    end
end

_parse_metadata_symbol(mode::AbstractString) = Symbol(lowercase(strip(mode)))

function _mode_from_string(mode::AbstractString)
    sym = _parse_metadata_symbol(mode)
    sym === :strict && return MetadataMode.STRICT
    sym === :allow && return MetadataMode.ALLOW
    sym === :ignore && return MetadataMode.IGNORE
    throw(ArgumentError("Invalid metadata mode: $(mode). Valid modes: strict, allow, ignore"))
end

set_metadata(mode::MetadataMode) = (_metadata_mode[] = mode; nothing)

function set_metadata(mode::AbstractString)
    set_metadata(_mode_from_string(mode))
end

function get_metadata()::MetadataMode
    return _metadata_mode[]
end

function skip_metadata(; skip_warning::Bool=false)
    _warn_on_ignored[] = !skip_warning
    set_metadata(MetadataMode.IGNORE)
    return nothing
end

warn_on_ignored_metadata() = _warn_on_ignored[]

function resolve_metadata_mode(meta)
    if meta === nothing
        return get_metadata()
    elseif meta isa MetadataMode
        return meta
    elseif meta isa AbstractString
        return _mode_from_string(meta)
    else
        throw(ArgumentError("Invalid metadata mode type: $(typeof(meta))"))
    end
end

function with_metadata_mode(f::Function, mode)
    current = get_metadata()
    set_metadata(mode)
    try
        return f()
    finally
        set_metadata(current)
    end
end

end
