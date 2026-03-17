from __future__ import annotations

import itertools
from urllib.parse import quote_plus

from pydantic import BaseModel, Field


class SourceConfig(BaseModel):
    name: str
    source_type: str = Field(pattern=r"^(html_scraper|api|rss)$")
    url_template: str
    headers: dict[str, str] = Field(default_factory=dict)
    rate_limit_seconds: float = 2.0
    selectors: dict[str, str] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Industry → Role taxonomy (used by GET /api/v1/preferences/catalog)
# ---------------------------------------------------------------------------

INDUSTRY_ROLE_CATALOG: dict[str, list[str]] = {
    "IT Software": [
        "Engineering Manager",
        "Project Manager",
        "Technical Architect",
        "Full Stack Developer",
        "DevOps Engineer",
        "Data Engineer",
        "Software Architect",
        "QA Lead",
    ],
    "IT Services & Consulting": [
        "Solutions Architect",
        "Delivery Manager",
        "Practice Lead",
        "Pre-Sales Consultant",
        "Cloud Architect",
        "Integration Specialist",
    ],
    "Finance & Banking": [
        "Financial Analyst",
        "Risk Manager",
        "Portfolio Manager",
        "Compliance Officer",
        "Investment Banker",
        "Quantitative Analyst",
    ],
    "Healthcare": [
        "Clinical Data Manager",
        "Health Informatics Specialist",
        "Medical Director",
        "Regulatory Affairs Manager",
        "Biostatistician",
    ],
    "Manufacturing": [
        "Plant Manager",
        "Quality Engineer",
        "Supply Chain Manager",
        "Process Engineer",
        "Operations Director",
    ],
    "Education & Research": [
        "Research Scientist",
        "Academic Director",
        "Curriculum Developer",
        "EdTech Specialist",
        "Lab Manager",
    ],
    "Government & International Orgs": [
        "Programme Officer",
        "Policy Analyst",
        "Development Specialist",
        "Monitoring & Evaluation Officer",
        "Administrative Officer",
    ],
    "Marketing & Communications": [
        "Marketing Manager",
        "Content Strategist",
        "Digital Marketing Specialist",
        "Brand Manager",
        "PR Director",
    ],
}

# ---------------------------------------------------------------------------
# Shared source templates
# ---------------------------------------------------------------------------

_INDEED: SourceConfig = SourceConfig(
    name="indeed",
    source_type="html_scraper",
    url_template="https://www.indeed.com/jobs?q={role}&l={location}&sort=date",
    headers={"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
    rate_limit_seconds=3.0,
    selectors={
        "job_card": "div.job_seen_beacon",
        "title": "h2.jobTitle span[title]",
        "company": "span[data-testid='company-name']",
        "location": "div[data-testid='text-location']",
        "description": "div.job-snippet",
        "link": "a.jcs-JobTitle",
    },
)

_LINKEDIN: SourceConfig = SourceConfig(
    name="linkedin",
    source_type="html_scraper",
    url_template=(
        "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/"
        "search?keywords={role}&location={location}&start=0"
    ),
    headers={"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
    rate_limit_seconds=5.0,
    selectors={
        "job_card": "li",
        "title": "h3.base-search-card__title",
        "company": "h4.base-search-card__subtitle",
        "location": "span.job-search-card__location",
        "description": "p.base-search-card__metadata",
        "link": "a.base-card__full-link",
    },
)

_REMOTEOK: SourceConfig = SourceConfig(
    name="remoteok",
    source_type="api",
    url_template="https://remoteok.com/api",
    headers={"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
    rate_limit_seconds=4.0,
    selectors={},
)

_ADZUNA: SourceConfig = SourceConfig(
    name="adzuna",
    source_type="api",
    url_template=(
        "https://api.adzuna.com/v1/api/jobs/us/search/1"
        "?app_id=demo&app_key=demo&results_per_page=20"
        "&what={role}&where={location}"
    ),
    headers={"Accept": "application/json"},
    rate_limit_seconds=2.0,
    selectors={},
)

_GLASSDOOR: SourceConfig = SourceConfig(
    name="glassdoor",
    source_type="html_scraper",
    url_template="https://www.glassdoor.com/Job/jobs.htm?sc.keyword={role}&locT=C&locKeyword={location}",
    headers={"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
    rate_limit_seconds=4.0,
    selectors={
        "job_card": "li.react-job-listing",
        "title": "a.jobLink span",
        "company": "div.job-search-key-l2wjgv",
        "location": "span.job-search-key-1rdszsd",
        "description": "div.job-snippet",
        "link": "a.jobLink",
    },
)

_STACKOVERFLOW: SourceConfig = SourceConfig(
    name="stackoverflow",
    source_type="rss",
    url_template="https://stackoverflow.com/jobs/feed?q={role}&l={location}",
    headers={"Accept": "application/rss+xml"},
    rate_limit_seconds=3.0,
    selectors={},
)

# ---------------------------------------------------------------------------
# Per-industry source sets
# ---------------------------------------------------------------------------

_TECH_SOURCES: list[SourceConfig] = [_INDEED, _LINKEDIN, _REMOTEOK, _ADZUNA, _STACKOVERFLOW]
_CORPORATE_SOURCES: list[SourceConfig] = [_INDEED, _LINKEDIN, _ADZUNA, _GLASSDOOR]
_PUBLIC_SECTOR_SOURCES: list[SourceConfig] = [_INDEED, _LINKEDIN, _ADZUNA]

_INDUSTRY_SOURCE_MAP: dict[str, list[SourceConfig]] = {
    "IT Software": _TECH_SOURCES,
    "IT Services & Consulting": _TECH_SOURCES,
    "Finance & Banking": _CORPORATE_SOURCES,
    "Healthcare": _CORPORATE_SOURCES,
    "Manufacturing": _CORPORATE_SOURCES,
    "Education & Research": [_INDEED, _LINKEDIN, _ADZUNA],
    "Government & International Orgs": _PUBLIC_SECTOR_SOURCES,
    "Marketing & Communications": _CORPORATE_SOURCES,
}

# ---------------------------------------------------------------------------
# JOB_SOURCE_REGISTRY — industry → role → list[SourceConfig]
# ---------------------------------------------------------------------------

JOB_SOURCE_REGISTRY: dict[str, dict[str, list[SourceConfig]]] = {
    industry: {
        role: _INDUSTRY_SOURCE_MAP[industry]
        for role in roles
    }
    for industry, roles in INDUSTRY_ROLE_CATALOG.items()
}

# ---------------------------------------------------------------------------
# Helper: resolve sources for user preferences
# ---------------------------------------------------------------------------


def _resolve_url(template: str, role: str, location: str, keywords_str: str) -> str:
    return (
        template
        .replace("{role}", quote_plus(role))
        .replace("{location}", quote_plus(location))
        .replace("{keywords}", quote_plus(keywords_str))
    )


def get_sources_for_preferences(
    industry: str,
    role_categories: list[str],
    locations: list[str],
    keywords: list[str],
) -> list[tuple[SourceConfig, str]]:
    """Return ``(source_config, resolved_url)`` pairs for every combination
    of role, location, and source that matches the given preferences.

    If *industry* is not present in the registry the function falls back to
    the generic Indeed + LinkedIn + Adzuna set so callers always get results.
    """
    keywords_str: str = " ".join(keywords) if keywords else ""
    fallback_sources: list[SourceConfig] = [_INDEED, _LINKEDIN, _ADZUNA]
    industry_roles: dict[str, list[SourceConfig]] = JOB_SOURCE_REGISTRY.get(industry, {})

    effective_locations: list[str] = locations if locations else [""]

    results: list[tuple[SourceConfig, str]] = []

    for role, location in itertools.product(role_categories, effective_locations):
        sources = industry_roles.get(role, fallback_sources)
        for src in sources:
            resolved = _resolve_url(src.url_template, role, location, keywords_str)
            results.append((src, resolved))

    return results
