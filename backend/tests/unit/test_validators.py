import pytest

from app.utils.validators import InvalidInput, validate_branch, validate_path, validate_ref, validate_repo_name


@pytest.mark.parametrize("p", ["../x", "a/../../b", "/etc/passwd", "a//b", "a/./b", ".git/config", "a/.GIT/x",
                               "a\b", "C:/x", "x\x00y", "", "a/" + "b/" * 30 + "c", "x" * 500, "a\nb"])
def test_bad_paths(p):
    with pytest.raises(InvalidInput):
        validate_path(p)


@pytest.mark.parametrize("p", ["README.md", "src/app/main.py", "dir/", "a b.txt", "ünï/cødé.rs"])
def test_good_paths(p):
    assert validate_path(p)


@pytest.mark.parametrize("b", ["-delete", "--upload-pack=x", "a..b", "a b", "x.lock", "/x", "x/", ".hidden",
                               "a@{1}", "a~1", "a^", "a:b", "a?b", "a*", "", "x" * 101, "refs//x"])
def test_bad_branches(b):
    with pytest.raises(InvalidInput):
        validate_branch(b)


def test_refs_and_names():
    assert validate_ref("main") and validate_ref("deadbeef") and validate_ref("feature/x-1")
    for bad in ("HEAD~1", "main^", "--output=/tmp/x", "a:b"):
        with pytest.raises(InvalidInput):
            validate_ref(bad)
    assert validate_repo_name("my-repo_1.0")
    for bad in ("", ".", "..", "a/b", "-x", "x.git", "a b", "x" * 65):
        with pytest.raises(InvalidInput):
            validate_repo_name(bad)
