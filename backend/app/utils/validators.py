"""Validators for everything that ends up in a Git argument or a path. Allow-list based."""
import re
import uuid

from app.core.exceptions import AppError

_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$")
_SHA_RE = re.compile(r"^[0-9a-f]{4,64}$")
_REPO_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_BAD_BRANCH_SUBSTR = ("..", "//", "@{", ".lock/", "\\")
MAX_PATH_LEN, MAX_PATH_DEPTH = 400, 20


class InvalidInput(AppError):
    status, code = 422, "invalid_input"


def parse_uuid(value: str, what: str = "id") -> str:
    try:
        return str(uuid.UUID(str(value)))
    except ValueError:
        raise InvalidInput(f"Invalid {what}") from None


def validate_repo_name(name: str) -> str:
    if not _REPO_NAME_RE.fullmatch(name) or name.endswith((".git", ".")) or name in (".", ".."):
        raise InvalidInput("Repository name must be 1-64 chars: letters, digits, '.', '_', '-'")
    return name


def validate_branch(name: str) -> str:
    """Conservative subset of git's ref rules (also checked by `git check-ref-format` on creation)."""
    if (not _BRANCH_RE.fullmatch(name) or name.endswith(("/", ".", ".lock"))
            or any(s in name for s in _BAD_BRANCH_SUBSTR)
            or any(p.startswith(".") or p == "" for p in name.split("/"))):
        raise InvalidInput("Invalid branch name")
    return name


def validate_ref(ref: str) -> str:
    """A branch name or a hex commit id. Never starts with '-'; no revision expressions (~, ^, :, @)."""
    if _SHA_RE.fullmatch(ref):
        return ref
    return validate_branch(ref)


MAX_QUERY_LEN = 200


def validate_query(q: str) -> str:
    """A literal search needle: printable, trimmed, never passed to a regex engine."""
    q = q.strip()
    if not 2 <= len(q) <= MAX_QUERY_LEN or any(ord(c) < 32 for c in q):
        raise InvalidInput(f"Search query must be 2-{MAX_QUERY_LEN} characters")
    return q


def validate_path(path: str, allow_empty: bool = False) -> str:
    """Normalised repo-relative POSIX path. Rejects traversal, absolute, backslash, NUL, '.git' components."""
    if path in ("", "/") and allow_empty:
        return ""
    if not path or len(path) > MAX_PATH_LEN or "\x00" in path or "\\" in path or any(ord(c) < 32 for c in path):
        raise InvalidInput("Invalid path")
    if path.startswith("/") or re.match(r"^[A-Za-z]:", path):
        raise InvalidInput("Path must be relative")
    parts = path.rstrip("/").split("/")
    if len(parts) > MAX_PATH_DEPTH or any(p in ("", ".", "..") or p.lower() == ".git" for p in parts):
        raise InvalidInput("Invalid path")
    return "/".join(parts)
