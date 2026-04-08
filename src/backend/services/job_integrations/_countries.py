"""ISO 3166-1 alpha-2 helpers for job search APIs and cross-provider location scoping."""

from __future__ import annotations

import re
from typing import Any

# Subset of markets commonly supported by Adzuna job search API; unknown codes are skipped with a log.
ADZUNA_COUNTRY_CODES: frozenset[str] = frozenset({
    "at",
    "au",
    "be",
    "br",
    "ca",
    "ch",
    "cn",
    "de",
    "es",
    "fr",
    "gb",
    "hk",
    "in",
    "it",
    "jp",
    "mx",
    "nl",
    "nz",
    "pl",
    "ru",
    "sg",
    "us",
    "za",
})

# English names for Jooble `location` when scoping by country (Jooble is location-string based).
ISO2_TO_ENGLISH_NAME: dict[str, str] = {
    "at": "Austria",
    "au": "Australia",
    "be": "Belgium",
    "br": "Brazil",
    "ca": "Canada",
    "ch": "Switzerland",
    "cn": "China",
    "de": "Germany",
    "es": "Spain",
    "fr": "France",
    "gb": "United Kingdom",
    "hk": "Hong Kong",
    "in": "India",
    "it": "Italy",
    "jp": "Japan",
    "mx": "Mexico",
    "nl": "Netherlands",
    "nz": "New Zealand",
    "pl": "Poland",
    "ru": "Russia",
    "sg": "Singapore",
    "us": "United States",
    "za": "South Africa",
}


def normalize_adzuna_country_codes(raw: object) -> list[str]:
    """Return validated lowercase Adzuna API country codes, preserving order, deduped."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for x in raw:
        c = str(x).strip().lower()
        if len(c) != 2 or c not in ADZUNA_COUNTRY_CODES:
            continue
        if c in seen:
            continue
        seen.add(c)
        out.append(c)
    return out


def jooble_locations_for_countries(codes: list[str], *, max_locs: int = 5) -> list[str]:
    """Map user country codes to Jooble location strings."""
    out: list[str] = []
    seen: set[str] = set()
    for c in codes:
        if len(out) >= max_locs:
            break
        name = ISO2_TO_ENGLISH_NAME.get(c.lower())
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


# Extra lowercase substrings for matching job location/description (LinkedIn, XING, feeds, etc.).
# ISO2 codes that are common English words are NOT matched as 2-letter tokens (e.g. "in" → India only via aliases).
_COUNTRY_SCOPE_ALIASES: dict[str, tuple[str, ...]] = {
    "at": ("austria", "österreich", "vienna", "wien"),
    "au": ("australia", "sydney", "melbourne"),
    "be": ("belgium", "belgië", "brussels"),
    "br": ("brazil", "brasil", "são paulo", "sao paulo"),
    "ca": ("canada", "toronto", "vancouver", "montreal"),
    "ch": ("switzerland", "schweiz", "suisse", "zurich", "zürich", "geneva"),
    "cn": ("china", "beijing", "shanghai", "shenzhen"),
    "de": ("germany", "deutschland", "berlin", "munich", "münchen", "frankfurt", "hamburg"),
    "es": ("spain", "españa", "madrid", "barcelona"),
    "fr": ("france", "paris", "lyon", "toulouse"),
    "gb": (
        "united kingdom",
        "u.k.",
        "uk",
        "britain",
        "england",
        "scotland",
        "wales",
        "london",
        "manchester",
        "edinburgh",
    ),
    "hk": ("hong kong", "kowloon"),
    "in": ("india", "indian", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune"),
    "it": ("italy", "italia", "rome", "milan", "milano"),
    "jp": ("japan", "tokyo", "osaka", "kyoto", "yokohama"),
    "mx": ("mexico", "méxico", "mexico city", "ciudad de méxico", "guadalajara", "monterrey"),
    "nl": ("netherlands", "nederland", "holland", "amsterdam", "rotterdam", "utrecht"),
    "nz": ("new zealand", "auckland", "wellington"),
    "pl": ("poland", "polska", "warsaw", "krakow", "wrocław"),
    "ru": ("russia", "moscow", "saint petersburg", "spb"),
    "sg": ("singapore",),
    "us": (
        "united states",
        "u.s.",
        "u.s.a",
        "usa",
        "new york",
        "san francisco",
        "los angeles",
        "chicago",
        "seattle",
        "austin",
        "boston",
    ),
    "za": ("south africa", "johannesburg", "cape town", "durban", "pretoria"),
}

# Use word-boundary regex for these ISO2 codes only (exclude "it", "in", etc. — English words).
_ISO2_WORD_BOUNDARY: frozenset[str] = frozenset(
    {"at", "au", "be", "br", "ca", "ch", "cn", "de", "es", "fr", "gb", "hk", "jp", "mx", "nl", "nz", "pl", "ru", "sg", "us", "za"},
)


def _haystack_for_country_match(job: dict[str, Any]) -> str:
    loc = str(job.get("location") or "")
    desc = str(job.get("description_text") or "")[:2500]
    title = str(job.get("title") or "")[:300]
    return f"{loc} {title} {desc}".lower()


def _text_matches_country(hay: str, code: str) -> bool:
    c = code.lower()
    name = ISO2_TO_ENGLISH_NAME.get(c)
    if name:
        n = name.lower()
        if n in hay:
            return True
        # e.g. "U.S." vs "u.s." already covered by aliases for us
    for fragment in _COUNTRY_SCOPE_ALIASES.get(c, ()):
        if fragment in hay:
            return True
    if c in _ISO2_WORD_BOUNDARY:
        if re.search(rf"\b{re.escape(c)}\b", hay):
            return True
    return False


def job_dict_matches_target_countries(job: dict[str, Any], country_codes: list[str]) -> bool:
    """If ``country_codes`` is empty, all jobs pass. Otherwise keep jobs whose location/text
    suggests at least one target country (for LinkedIn, XING, Naukri, and redundant check on APIs).

    Jobs with no location/description to analyse are kept so org-wide postings without geo
    metadata are not dropped silently.
    """
    if not country_codes:
        return True
    hay = _haystack_for_country_match(job).strip()
    if not hay:
        return True
    for code in country_codes:
        if _text_matches_country(hay, code):
            return True
    return False
