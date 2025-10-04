using Test
using TextPrompts
using Dates

@testset "PromptString" begin
    ps = PromptString("Hello {name}! Today is {0:04d}.")
    @test "name" in ps.placeholders
    @test "0" in ps.placeholders
    formatted = format(ps, 7; name="Alice")
    @test formatted == "Hello Alice! Today is 0007."
    partial = format(ps; skip_validation=true, name="Bob")
    @test occursin("Bob", partial)
    @test occursin("{0:04d}", partial)
    @test_throws ArgumentError format(ps; name="Charlie")
end

function write_prompt(dir, filename, content)
    path = joinpath(dir, filename)
    open(path, "w") do io
        write(io, content)
    end
    return path
end

sample_prompt = """---
title = "Sample"
description = "Demo"
version = "1.0"
---

You are {role}."""

@testset "Parser" begin
    mktempdir() do dir
        path = write_prompt(dir, "prompt.txt", sample_prompt)
        prompt = TextPrompts.Parser.parse_file(path; metadata_mode=MetadataMode.ALLOW)
        @test prompt.meta.title == "Sample"
        @test String(prompt.prompt) == "You are {role}."
        @test_throws MissingMetadataError TextPrompts.Parser.parse_file(path; metadata_mode=MetadataMode.STRICT)
        prompt_ignore = TextPrompts.Parser.parse_file(path; metadata_mode=MetadataMode.IGNORE)
        @test prompt_ignore.meta.title == "prompt"
        @test occursin("You are", String(prompt_ignore.prompt))
    end
end

@testset "Loaders" begin
    mktempdir() do dir
        write_prompt(dir, "a.txt", sample_prompt)
        write_prompt(dir, "b.txt", replace(sample_prompt, "Sample" => "Second"))
        prompts = load_prompts(dir; glob="*.txt", meta=MetadataMode.ALLOW)
        @test length(prompts) == 2
        titles = sort([p.meta.title for p in prompts])
        @test titles == ["Sample", "Second"]
    end
end

@testset "Savers" begin
    mktempdir() do dir
        outpath = joinpath(dir, "saved.txt")
        save_prompt(outpath, "Testing body")
        text = read(outpath, String)
        @test occursin("title", text)
        prompt = load_prompt(outpath; meta=MetadataMode.ALLOW)
        prompt.meta.title = "Saved"
        save_prompt(outpath, prompt)
        text2 = read(outpath, String)
        @test occursin("Saved", text2)
    end
end

