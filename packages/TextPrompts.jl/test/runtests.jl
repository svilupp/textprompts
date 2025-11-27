using TextPrompts
using Test
using Aqua
using Dates

const FIXTURES_DIR = joinpath(@__DIR__, "fixtures")

@testset "TextPrompts.jl" begin
    @testset "Code quality (Aqua.jl)" begin
        Aqua.test_all(TextPrompts)
    end

    @testset "MetadataMode" begin
        @testset "parse_metadata_mode" begin
            @test TextPrompts.parse_metadata_mode(:strict) == STRICT
            @test TextPrompts.parse_metadata_mode(:allow) == ALLOW
            @test TextPrompts.parse_metadata_mode(:ignore) == IGNORE

            @test TextPrompts.parse_metadata_mode("strict") == STRICT
            @test TextPrompts.parse_metadata_mode("allow") == ALLOW
            @test TextPrompts.parse_metadata_mode("ignore") == IGNORE

            # Case insensitive
            @test TextPrompts.parse_metadata_mode(:STRICT) == STRICT

            # Invalid mode
            @test_throws ArgumentError TextPrompts.parse_metadata_mode(:invalid)
        end

        @testset "convert" begin
            # convert delegates to parse_metadata_mode
            @test convert(MetadataMode, :strict) == STRICT
            @test convert(MetadataMode, "allow") == ALLOW
        end
    end

    @testset "Global Configuration" begin
        # Save original state
        original_mode = get_metadata()

        @testset "set_metadata and get_metadata" begin
            set_metadata(STRICT)
            @test get_metadata() == STRICT

            set_metadata(:allow)
            @test get_metadata() == ALLOW

            set_metadata("ignore")
            @test get_metadata() == IGNORE
        end

        @testset "skip_metadata" begin
            set_metadata(STRICT)
            skip_metadata()
            @test get_metadata() == IGNORE

            # With skip_warning=true
            skip_metadata(skip_warning = true)
            @test get_metadata() == IGNORE
            @test warn_on_ignored_metadata() == false
        end

        @testset "warn_on_ignored_metadata" begin
            @test warn_on_ignored_metadata() isa Bool
        end

        # Restore original state
        set_metadata(original_mode)
    end

    @testset "PromptMeta" begin
        @testset "construction" begin
            meta = PromptMeta()
            @test isnothing(meta.title)
            @test isnothing(meta.version)
            @test isnothing(meta.author)
            @test isnothing(meta.created)
            @test isnothing(meta.description)

            meta = PromptMeta(
                title = "Test",
                version = "1.0.0",
                author = "Author",
                created = Date(2024, 1, 15),
                description = "Description"
            )
            @test meta.title == "Test"
            @test meta.version == "1.0.0"
            @test meta.author == "Author"
            @test meta.created == Date(2024, 1, 15)
            @test meta.description == "Description"
        end

        @testset "show" begin
            meta = PromptMeta(title = "Test", version = "1.0.0")
            str = sprint(show, meta)
            @test occursin("title", str)
            @test occursin("Test", str)
        end
    end

    @testset "Placeholder Extraction" begin
        @testset "extract_placeholders" begin
            @test extract_placeholders("Hello, {name}!") == Set(["name"])
            @test extract_placeholders("{a} and {b} and {a}") == Set(["a", "b"])
            @test extract_placeholders("No placeholders") == Set{String}()
            @test extract_placeholders("{0} {1} {2}") == Set(["0", "1", "2"])
        end

        @testset "escaped braces" begin
            @test extract_placeholders("{{escaped}}") == Set{String}()
            @test extract_placeholders("{{escaped}} and {real}") == Set(["real"])
            @test extract_placeholders("{{{{double}}}}") == Set{String}()
        end

        @testset "format specifiers" begin
            @test extract_placeholders("{value:02d}") == Set(["value"])
            @test extract_placeholders("{price:.2f}") == Set(["price"])
            @test extract_placeholders("{name:>10s}") == Set(["name"])
        end

        @testset "empty placeholders" begin
            @test extract_placeholders("{}") == Set{String}()
            @test extract_placeholders("{} and {name}") == Set(["name"])
        end
    end

    @testset "get_placeholder_info" begin
        info = get_placeholder_info("Hello, {name}!")
        @test info.count == 1
        @test info.names == Set(["name"])
        @test info.has_named == true
        @test info.has_positional == false
        @test info.is_mixed == false

        info = get_placeholder_info("{0} {1}")
        @test info.count == 2
        @test info.has_positional == true
        @test info.has_named == false

        info = get_placeholder_info("{0} {name}")
        @test info.is_mixed == true
    end

    @testset "PromptString" begin
        @testset "construction and properties" begin
            ps = PromptString("Hello, {name}!")
            @test String(ps) == "Hello, {name}!"
            @test ps.placeholders == Set(["name"])
            @test length(ps) == length("Hello, {name}!")
        end

        @testset "string interface" begin
            ps = PromptString("Hello, World!")
            @test length(ps) == 13
            @test ps[1] == 'H'
            @test ps[1:5] == "Hello"
            @test occursin("World", ps)

            # AbstractString methods delegate to content
            @test sizeof(ps) == sizeof("Hello, World!")
            @test codeunit(ps) == UInt8
            @test SubString(ps, 1, 5) == "Hello"
        end

        @testset "format" begin
            ps = PromptString("Hello, {name}!")
            @test format(ps; name = "World") == "Hello, World!"

            ps = PromptString("{greeting}, {name}!")
            @test format(ps; greeting = "Hi", name = "Julia") == "Hi, Julia!"
        end

        @testset "format validation" begin
            ps = PromptString("Hello, {name}!")
            @test_throws TextPrompts.PlaceholderError format(ps)
            @test_throws TextPrompts.PlaceholderError format(ps; wrong = "value")
        end

        @testset "format skip_validation" begin
            ps = PromptString("Hello, {name}! Today is {day}.")
            result = format(ps; name = "World", skip_validation = true)
            @test result == "Hello, World! Today is {day}."
        end

        @testset "format with escaped braces" begin
            ps = PromptString("JSON: {{\"key\": \"{value}\"}}")
            result = format(ps; value = "test")
            @test result == "JSON: {\"key\": \"test\"}"
        end

        @testset "show" begin
            ps = PromptString("Test content")
            # Default show (used in REPL output)
            str = sprint(show, ps)
            @test occursin("PromptString", str)
            @test occursin("Test content", str)

            # text/plain show (used when displaying)
            plain = sprint(show, MIME("text/plain"), ps)
            @test plain == "Test content"
        end
    end

    @testset "Prompt" begin
        @testset "construction" begin
            meta = PromptMeta(title = "Test")
            prompt = Prompt("path.txt", meta, "Hello, {name}!")

            @test prompt.path == "path.txt"
            @test prompt.meta.title == "Test"
            @test prompt.prompt isa PromptString
            @test prompt.placeholders == Set(["name"])
            @test prompt.content == "Hello, {name}!"
        end

        @testset "string operations" begin
            meta = PromptMeta(title = "Test")
            prompt = Prompt("path.txt", meta, "Hello")

            @test length(prompt) == 5
            @test String(prompt) == "Hello"
            @test prompt + "!" == "Hello!"
            @test "Say: " + prompt == "Say: Hello"

            # Prompt + Prompt concatenation
            prompt2 = Prompt("other.txt", meta, " World")
            @test prompt + prompt2 == "Hello World"
        end

        @testset "propertynames" begin
            meta = PromptMeta(title = "Test")
            prompt = Prompt("path.txt", meta, "Hello")
            names = propertynames(prompt)
            @test :path in names
            @test :meta in names
            @test :prompt in names
            @test :placeholders in names
            @test :content in names
        end

        @testset "show" begin
            meta = PromptMeta(title = "Test Title", version = "1.0")
            prompt = Prompt("myfile.txt", meta, "Line 1\nLine 2")

            # Default show
            str = sprint(show, prompt)
            @test occursin("Prompt", str)
            @test occursin("myfile.txt", str)
            @test occursin("PromptMeta", str)

            # text/plain show (multi-line display)
            plain = sprint(show, MIME("text/plain"), prompt)
            @test occursin("Prompt:", plain)
            @test occursin("path: myfile.txt", plain)
            @test occursin("meta:", plain)
            @test occursin("content:", plain)
            @test occursin("Line 1", plain)
            @test occursin("Line 2", plain)
        end

        @testset "format" begin
            meta = PromptMeta(title = "Test")
            prompt = Prompt("path.txt", meta, "Hello, {name}!")

            @test format(prompt; name = "World") == "Hello, World!"
        end
    end

    @testset "Parser - _split_front_matter" begin
        @testset "valid front-matter" begin
            text = """
            ---
            title = "Test"
            ---

            Body content
            """
            header, body = TextPrompts._split_front_matter(text)
            @test header !== nothing
            @test occursin("title", header)
            @test occursin("Body content", body)
        end

        @testset "no front-matter" begin
            text = "Just plain content"
            header, body = TextPrompts._split_front_matter(text)
            @test header === nothing
            @test body == text
        end

        @testset "dashes in body preserved" begin
            text = """
            ---
            title = "Test"
            ---

            Content here
            ---
            More content after dashes
            """
            header, body = TextPrompts._split_front_matter(text)
            @test header !== nothing
            @test occursin("---", body)
        end

        @testset "edge cases" begin
            # Just "---" with no newline
            header, body = TextPrompts._split_front_matter("---")
            @test header === nothing
            @test body == "---"

            # "---" with newline but no closing
            header, body = TextPrompts._split_front_matter("---\ntitle = \"x\"")
            @test header === nothing
        end
    end

    @testset "Parser - _dedent" begin
        @testset "removes common indentation" begin
            text = """
                Line 1
                Line 2
                Line 3
            """
            result = TextPrompts._dedent(text)
            @test startswith(result, "Line 1")
        end

        @testset "handles mixed indentation" begin
            text = """
                Line 1
            Line 2
                Line 3
            """
            result = TextPrompts._dedent(text)
            # Line 2 has zero indentation, so minimum common indentation is 0
            # _dedent correctly preserves the original string in this case
            @test startswith(result, "    ")  # Line 1 keeps its 4-space indent
        end
    end

    @testset "load_prompt - metadata modes" begin
        good_path = joinpath(FIXTURES_DIR, "good.txt")
        no_meta_path = joinpath(FIXTURES_DIR, "no_meta.txt")
        missing_fields_path = joinpath(FIXTURES_DIR, "missing_fields.txt")

        @testset "ALLOW mode (default)" begin
            # Good file works
            prompt = load_prompt(good_path; meta = :allow)
            @test prompt.meta.title == "Good Prompt"
            @test prompt.meta.version == "1.0.0"
            @test prompt.meta.author == "Test Author"
            @test prompt.meta.created == Date(2024, 1, 15)

            # No metadata file works (uses filename as title)
            prompt = load_prompt(no_meta_path; meta = :allow)
            @test prompt.meta.title == "no_meta"

            # Missing fields file works
            prompt = load_prompt(missing_fields_path; meta = :allow)
            @test prompt.meta.title == "Only Title"
            @test isnothing(prompt.meta.version)
        end

        @testset "STRICT mode" begin
            # Good file works
            prompt = load_prompt(good_path; meta = :strict)
            @test prompt.meta.title == "Good Prompt"

            # No metadata file fails
            @test_throws TextPrompts.MissingMetadataError load_prompt(no_meta_path; meta = :strict)

            # Missing fields file fails
            @test_throws TextPrompts.MissingMetadataError load_prompt(missing_fields_path; meta = :strict)
        end

        @testset "IGNORE mode" begin
            # Good file - metadata ignored
            prompt = load_prompt(good_path; meta = :ignore)
            @test prompt.meta.title == "good"  # Filename stem
            @test occursin("---", String(prompt))  # Front-matter preserved as content

            # No metadata file works
            prompt = load_prompt(no_meta_path; meta = :ignore)
            @test prompt.meta.title == "no_meta"
        end
    end

    @testset "load_prompt - error cases" begin
        @testset "FileMissingError" begin
            @test_throws TextPrompts.FileMissingError load_prompt("nonexistent.txt")
        end

        @testset "EmptyContentError" begin
            @test_throws TextPrompts.EmptyContentError load_prompt(joinpath(FIXTURES_DIR, "empty.txt"))
            @test_throws TextPrompts.EmptyContentError load_prompt(
                joinpath(FIXTURES_DIR, "whitespace_only.txt"))
            @test_throws TextPrompts.EmptyContentError load_prompt(
                joinpath(FIXTURES_DIR, "header_only.txt");
                meta = :allow
            )
        end

        @testset "InvalidMetadataError" begin
            @test_throws TextPrompts.InvalidMetadataError load_prompt(
                joinpath(FIXTURES_DIR, "bad_meta.txt");
                meta = :allow
            )
        end
    end

    @testset "load_prompt - special cases" begin
        @testset "triple dashes in body" begin
            prompt = load_prompt(joinpath(FIXTURES_DIR, "triple_dash_body.txt"); meta = :allow)
            @test occursin("---", String(prompt))
            @test prompt.meta.title == "Has Dashes In Body"
        end

        @testset "format specifiers" begin
            prompt = load_prompt(joinpath(FIXTURES_DIR, "format_specifiers.txt"); meta = :allow)
            @test "price" in prompt.placeholders
            @test "count" in prompt.placeholders
            @test "name" in prompt.placeholders
        end

        @testset "escaped braces" begin
            prompt = load_prompt(joinpath(FIXTURES_DIR, "escaped_braces.txt"); meta = :allow)
            @test "value" in prompt.placeholders
            @test "name" in prompt.placeholders
            @test !("key" in prompt.placeholders)  # {{key}} is escaped

            result = format(prompt; value = "test", name = "World")
            @test occursin("{\"key\":", result)  # Escaped braces become single braces
        end
    end

    @testset "load_prompts" begin
        @testset "empty paths" begin
            prompts = load_prompts()
            @test prompts == Prompt[]
        end

        @testset "load directory" begin
            prompts = load_prompts(FIXTURES_DIR; meta = :ignore, glob_pattern = "good.txt")
            @test length(prompts) >= 1
        end

        @testset "load multiple files" begin
            good = joinpath(FIXTURES_DIR, "good.txt")
            no_meta = joinpath(FIXTURES_DIR, "no_meta.txt")
            prompts = load_prompts(good, no_meta; meta = :allow)
            @test length(prompts) == 2
        end

        @testset "recursive loading" begin
            # Use good*.txt pattern to avoid empty.txt and other error test files
            prompts = load_prompts(FIXTURES_DIR; recursive = true, meta = :ignore, glob_pattern = "nested*.txt")
            paths = [p.path for p in prompts]
            # Should include nested file
            @test any(occursin("subdir", p) for p in paths)
        end

        @testset "custom glob pattern" begin
            prompts = load_prompts(
                FIXTURES_DIR;
                glob_pattern = "good*.txt",
                meta = :ignore
            )
            @test all(occursin("good", basename(p.path)) for p in prompts)
        end

        @testset "nonexistent path" begin
            @test_throws TextPrompts.FileMissingError load_prompts("nonexistent_dir/")
        end
    end

    @testset "save_prompt" begin
        mktempdir() do tmpdir
            @testset "save string" begin
                path = joinpath(tmpdir, "new_prompt.txt")
                save_prompt(path, "Hello, {name}!")

                @test isfile(path)
                content = read(path, String)
                @test occursin("---", content)
                @test occursin("title = \"\"", content)
                @test occursin("Hello, {name}!", content)
            end

            @testset "save Prompt object" begin
                meta = PromptMeta(
                    title = "Saved Prompt",
                    version = "2.0.0",
                    description = "A saved prompt",
                    author = "Test",
                    created = Date(2024, 6, 15)
                )
                prompt = Prompt("original.txt", meta, "Content: {value}")

                path = joinpath(tmpdir, "saved_prompt.txt")
                save_prompt(path, prompt)

                @test isfile(path)
                content = read(path, String)
                @test occursin("Saved Prompt", content)
                @test occursin("2.0.0", content)
                @test occursin("2024-06-15", content)
            end

            @testset "round-trip save/load" begin
                meta = PromptMeta(
                    title = "Round Trip",
                    version = "1.0.0",
                    description = "Testing round trip"
                )
                original = Prompt("test.txt", meta, "Hello, {name}!")

                path = joinpath(tmpdir, "roundtrip.txt")
                save_prompt(path, original)
                loaded = load_prompt(path; meta = :allow)

                @test loaded.meta.title == original.meta.title
                @test loaded.meta.version == original.meta.version
                @test loaded.meta.description == original.meta.description
                @test String(loaded) == String(original)
            end

            @testset "creates parent directories" begin
                path = joinpath(tmpdir, "nested", "dir", "prompt.txt")
                save_prompt(path, "Content")
                @test isfile(path)
            end
        end
    end

    @testset "Error types" begin
        @testset "FileMissingError" begin
            err = TextPrompts.FileMissingError("test.txt")
            @test err.path == "test.txt"
            @test occursin("test.txt", err.message)
            @test occursin("test.txt", sprint(showerror, err))
        end

        @testset "MissingMetadataError" begin
            err = TextPrompts.MissingMetadataError("test.txt", ["title", "version"])
            @test err.path == "test.txt"
            @test "title" in err.missing_fields
            @test occursin("title", err.message)
            @test occursin("meta=:allow", err.message)
            @test occursin("MissingMetadataError", sprint(showerror, err))

            err2 = TextPrompts.MissingMetadataError("test.txt")
            @test isempty(err2.missing_fields)
        end

        @testset "InvalidMetadataError" begin
            err = TextPrompts.InvalidMetadataError("test.txt", "parse error")
            @test err.path == "test.txt"
            @test occursin("parse error", err.message)
            @test occursin("InvalidMetadataError", sprint(showerror, err))
        end

        @testset "MalformedHeaderError" begin
            err = TextPrompts.MalformedHeaderError("test.txt")
            @test err.path == "test.txt"
            @test occursin("---", err.message)
            @test occursin("MalformedHeaderError", sprint(showerror, err))
        end

        @testset "PlaceholderError" begin
            err = TextPrompts.PlaceholderError(["name", "value"])
            @test "name" in err.missing_keys
            @test "value" in err.missing_keys
            @test occursin("name", err.message)
            @test occursin("PlaceholderError", sprint(showerror, err))
        end

        @testset "EmptyContentError" begin
            err = TextPrompts.EmptyContentError("test.txt")
            @test err.path == "test.txt"
            @test occursin("no content", err.message)
            @test occursin("EmptyContentError", sprint(showerror, err))
        end

        @testset "FileReadError" begin
            err = TextPrompts.FileReadError("test.txt", "permission denied")
            @test err.path == "test.txt"
            @test occursin("permission denied", err.message)
            @test occursin("test.txt", sprint(showerror, err))
        end

        @testset "PromptLoadError" begin
            err = TextPrompts.PromptLoadError("test.txt", "unexpected error")
            @test err.path == "test.txt"
            @test occursin("unexpected error", err.message)
            @test occursin("test.txt", sprint(showerror, err))
        end
    end

    @testset "validate_format_args" begin
        placeholders = Set(["name", "value"])
        provided = Dict{String, Any}("name" => "test", "value" => 123)

        # Should not throw
        @test validate_format_args(placeholders, provided) === nothing

        # Missing keys
        missing_provided = Dict{String, Any}("name" => "test")
        @test_throws TextPrompts.PlaceholderError validate_format_args(placeholders, missing_provided)

        # Extra keys are OK
        extra_provided = Dict{String, Any}("name" => "test", "value" => 123, "extra" => "ok")
        @test validate_format_args(placeholders, extra_provided) === nothing
    end
end
