from textprompts.models import Prompt, PromptMeta
from textprompts.prompt_string import PromptString


def test_prompt_dunder_methods(tmp_path):
    path = tmp_path / "test.txt"
    prompt = Prompt(
        path=path, meta=PromptMeta(title="T"), prompt=PromptString("Hello {name}")
    )

    # __repr__ with meta
    rep = repr(prompt)
    assert "Prompt(title='T'" in rep

    # __str__
    assert str(prompt) == "Hello {name}"

    # __len__
    assert len(prompt) == len("Hello {name}")

    # __getitem__ slicing
    assert prompt[0:5] == "Hello"

    # __add__
    assert prompt + "!" == "Hello {name}!"

    # strip forwarded
    assert prompt.strip() == "Hello {name}"

    # format forwarded
    assert prompt.format(name="Bob") == "Hello Bob"


def test_prompt_repr_path_only(tmp_path):
    p = Prompt(path=tmp_path / "x.txt", meta=None, prompt=PromptString("hi"))
    assert "path" in repr(p)
