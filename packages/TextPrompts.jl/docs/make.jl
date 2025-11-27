using TextPrompts
using Documenter

DocMeta.setdocmeta!(TextPrompts, :DocTestSetup, :(using TextPrompts); recursive = true)

makedocs(;
    modules = [TextPrompts],
    authors = "svilupp",
    sitename = "TextPrompts.jl",
    format = Documenter.HTML(;
        canonical = "https://svilupp.github.io/textprompts/julia",
        edit_link = "main",
        assets = String[]
    ),
    pages = [
        "Home" => "index.md",
        "API Reference" => "api.md"
    ]
)

deploydocs(;
    repo = "github.com/svilupp/textprompts",
    devbranch = "main",
    dirname = "julia"
)
