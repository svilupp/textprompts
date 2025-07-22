using Test
using TextPrompts
using Dates

@testset "Config" begin
    set_metadata(IGNORE)
    @test get_metadata() == IGNORE
    set_metadata("allow")
    @test get_metadata() == ALLOW
    skip_metadata()
    @test get_metadata() == IGNORE
end

@testset "PromptString" begin
    ps = PromptString("Hello {name}")
    @test "name" in ps.placeholders
    @test format(ps; name="Bob") == "Hello Bob"
    @test_throws ArgumentError format(ps)
    @test format(ps; name="Bob", skip_validation=true) == "Hello Bob"
end

function writefile(path, txt)
    open(path, "w") do io
        write(io, txt)
    end
end

tmp = mktempdir()

@testset "Load/Save" begin
    file = joinpath(tmp, "prompt.txt")
    writefile(file, "---\ntitle = 'Hi'\ndescription = 'd'\nversion = '1'\n---\nBody")
    p = load_prompt(file; meta="strict")
    @test p.meta.title == "Hi"
    @test p.prompt == "Body"

    # allow mode missing metadata
    writefile(file, "Just body")
    p2 = load_prompt(file; meta="ignore")
    @test occursin("Just body", p2.prompt)
    @test p2.meta.title == "prompt"

    savefile = joinpath(tmp, "out.txt")
    save_prompt(savefile, p)
    @test isfile(savefile)
    s = read(savefile, String)
    @test occursin("title = \"Hi\"", s)

    save_prompt(savefile, "Simple")
    @test occursin("Simple", read(savefile, String))
end

@testset "load_prompts" begin
    d = joinpath(tmp, "dir")
    mkdir(d)
    writefile(joinpath(d, "a.txt"), "a")
    writefile(joinpath(d, "b.md"), "b")
    ps = load_prompts(d; meta="ignore")
    @test length(ps) == 1
    ps2 = load_prompts(d; glob="*.md", meta="ignore")
    @test length(ps2) == 1
end

rm(tmp; force=true)
