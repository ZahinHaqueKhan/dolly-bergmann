"""PLAN 6.7 — Email template renderer.

Templates live in `backend/app/templates/emails/*.html` and `*.txt`.
Each template is a handwritten, table-based HTML email with inline CSS
(no flex / grid, no external stylesheets, no JS) so it works in Gmail,
Outlook, and Apple Mail.

We do NOT pull in Jinja2 — the renderer does simple `{var}` and
`{if var}...{endif}` substitution. This keeps the dep surface
minimal and the templates readable.

Usage
-----
    from app.services.email import render_email

    html, text = render_email(
        "welcome",
        {
            "first_name": "Sara",
            "site_url": "https://modestwear.com",
        },
    )

Then hand the result to a mail transport (Resend in Phase 7+; for
v1, we just print to stdout).
"""
from __future__ import annotations

import re
from pathlib import Path

EMAILS_DIR = Path(__file__).parent.parent / "templates" / "emails"

# {var} pattern. Letters, digits, underscore only. Avoids mis-matching
# JSON braces, URL-encoded segments, etc.
_VAR_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
# {if var}...{else}...{endif} block. `else` is optional.
_BLOCK_RE = re.compile(
    r"\{if\s+([a-zA-Z_][a-zA-Z0-9_]*)\}(.*?)(?:\{else\}(.*?))?\{endif\}",
    re.DOTALL,
)


def _resolve_blocks(text: str, context: dict) -> str:
    """Substitute {if var}...{else}...{endif} blocks. Loops until no
    more blocks remain so nested blocks (if we ever need them) work.
    """
    prev = None
    while prev != text:
        prev = text
        def _r(m: re.Match) -> str:
            var, then_branch, else_branch = m.group(1), m.group(2), m.group(3) or ""
            return then_branch if context.get(var) else else_branch
        text = _BLOCK_RE.sub(_r, text)
    return text


def _render(text: str, context: dict) -> str:
    text = _resolve_blocks(text, context)
    return _VAR_RE.sub(
        lambda m: str(context.get(m.group(1), ""))
        if context.get(m.group(1)) is not None
        else "",
        text,
    )


def render_email(slug: str, context: dict) -> tuple[str, str]:
    """Render an email template. `slug` is the base filename (no
    extension). Returns (html, text).
    """
    html_path = EMAILS_DIR / f"{slug}.html"
    txt_path = EMAILS_DIR / f"{slug}.txt"
    if not html_path.exists():
        raise FileNotFoundError(f"email template not found: {html_path}")
    if not txt_path.exists():
        raise FileNotFoundError(f"email template not found: {txt_path}")
    html = _render(html_path.read_text(encoding="utf-8"), context)
    text = _render(txt_path.read_text(encoding="utf-8"), context)
    return html, text


def list_templates() -> list[str]:
    """Return all available email template slugs (the filename stem)."""
    if not EMAILS_DIR.exists():
        return []
    slugs: set[str] = set()
    for p in EMAILS_DIR.glob("*.html"):
        slugs.add(p.stem)
    return sorted(slugs)
