from __future__ import annotations

import re
from typing import Any


def normalize_external_id(value: Any) -> str:
    """Stable string for provider+external_id keys (matches upsert + DB lookups).

    JSON numbers may arrive as int or float; avoid ``123.0`` vs ``123`` mismatches.
    Numeric strings (including ``\"123.0\"``) normalize to the same canonical form.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()[:1024]
    if isinstance(value, float) and value.is_integer():
        return str(int(value))[:1024]
    if isinstance(value, int):
        return str(value)[:1024]
    s = str(value).strip()[:1024]
    if not s:
        return ""
    try:
        f = float(s)
        if f.is_integer():
            return str(int(f))
    except ValueError:
        pass
    return s


def plain_from_html(html: str) -> str:
    """Strip tags for plain-text job descriptions (no BeautifulSoup dependency)."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
