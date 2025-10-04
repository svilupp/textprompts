module CLI

export main

using JSON3
using ..Config: MetadataMode
using ..Errors: TextPromptsError, TextPromptsException
using ..Loaders: load_prompts
using ..Models: asdict

function _usage()
    return "Usage: textprompts <file-or-directory> [--json]"
end

function main(args=Base.ARGS)
    json_mode = false
    targets = String[]
    for arg in args
        if arg == "--json"
            json_mode = true
        else
            push!(targets, arg)
        end
    end
    if isempty(targets)
        println(_usage())
        return 0
    end
    try
        prompts = load_prompts(targets...; meta=MetadataMode.IGNORE)
        if json_mode
            data = [Dict(
                "path" => prompt.path,
                "meta" => asdict(prompt.meta),
                "prompt" => String(prompt.prompt),
            ) for prompt in prompts]
            println(JSON3.write(data))
        else
            for (idx, prompt) in enumerate(prompts)
                idx > 1 && println()
                println(String(prompt.prompt))
            end
        end
        return 0
    catch err
        if err isa TextPromptsException
            println(stderr, err)
            return 1
        elseif err isa TextPromptsError
            println(stderr, err)
            return 1
        else
            rethrow()
        end
    end
end

end
