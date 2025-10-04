module TextPrompts

export MetadataMode,
       set_metadata,
       get_metadata,
       skip_metadata,
       warn_on_ignored_metadata,
       PromptMeta,
       Prompt,
       PromptString,
       format,
       TextPromptsError,
       TextPromptsException,
       FileMissingError,
       MissingMetadataError,
       InvalidMetadataError,
       MalformedHeaderError,
       load_prompt,
       load_prompts,
       save_prompt,
       with_metadata_mode,
       main

include("config.jl")
include("errors.jl")
include("placeholder_utils.jl")
include("prompt_string.jl")
include("models.jl")
include("parser.jl")
include("loaders.jl")
include("savers.jl")
include("cli.jl")

using .Config: MetadataMode, set_metadata, get_metadata, skip_metadata, warn_on_ignored_metadata, with_metadata_mode
using .Errors: TextPromptsException, TextPromptsError, FileMissingError, MissingMetadataError, InvalidMetadataError, MalformedHeaderError
using .Models: PromptMeta, Prompt
using .PromptStrings: PromptString, format
using .Loaders: load_prompt, load_prompts
using .Savers: save_prompt
using .CLI: main

end
