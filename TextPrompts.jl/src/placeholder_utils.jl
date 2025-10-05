module PlaceholderUtils

export extract_placeholders, validate_format_args, get_placeholder_info, should_ignore_validation

using Base: isempty
using Base.Iterators: enumerate

function extract_placeholders(text::AbstractString)
    replaced = replace(replace(String(text), "{{" => "\0ESCAPED_OPEN\0"), "}}" => "\0ESCAPED_CLOSE\0")
    pattern = r"\{([^}:]*)(?::[^}]*)?\}"
    result = Set{String}()
    for m in eachmatch(Regex(pattern), replaced)
        capture = m.captures[1]
        capture === nothing && continue
        push!(result, String(capture))
    end
    return result
end

function validate_format_args(placeholders::AbstractSet{<:AbstractString}, args::Tuple, kwargs::Dict{String,Any}; skip_validation::Bool=false)
    skip_validation && return nothing
    all_kwargs = copy(kwargs)
    for (idx, value) in enumerate(args)
        all_kwargs[string(idx - 1)] = value
    end
    if "" in placeholders && !isempty(args)
        all_kwargs[""] = args[1]
    end
    provided = Set(string(k) for k in keys(all_kwargs))
    expected = Set(String(p) for p in placeholders)
    missing = setdiff(expected, provided)
    if !isempty(missing)
        throw(ArgumentError("Missing format variables: $(collect(sort(missing)))"))
    end
    return nothing
end

should_ignore_validation(ignore_flag::Bool) = ignore_flag

function get_placeholder_info(text::AbstractString)
    placeholders = extract_placeholders(text)
    is_positional(name) = !isempty(name) && all(isdigit, name)
    has_positional = any(is_positional(name) for name in placeholders)
    has_named = any(!is_positional(name) for name in placeholders)
    return Dict(
        "count" => length(placeholders),
        "names" => placeholders,
        "has_positional" => has_positional,
        "has_named" => has_named,
        "is_mixed" => has_positional && has_named,
    )
end

end
