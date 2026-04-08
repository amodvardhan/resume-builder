"""Jooble REST API — primary aggregator (official POST JSON).

Docs: https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation
Register: https://jooble.org/api/about — obtain API key for POST https://jooble.org/api/{api_Key}
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from src.backend.config import settings
from src.backend.services.job_integrations._countries import (
    jooble_locations_for_countries,
    normalize_adzuna_country_codes,
)
from src.backend.services.job_integrations._text import (
    normalize_external_id,
    plain_from_html,
)

logger = logging.getLogger(__name__)

_JOOBLE_API = "https://jooble.org/api"


def _parse_updated(val: Any) -> datetime | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(s[:26], fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _build_keywords(
    role_categories: list[str],
    keywords: list[str],
) -> str:
    parts: list[str] = []
    for r in role_categories:
        r = str(r).strip()
        if r:
            parts.append(r)
    for k in keywords:
        k = str(k).strip()
        if k and k not in parts:
            parts.append(k)
    if not parts:
        return "jobs"
    return ", ".join(parts[:12])


def _first_location(preferred_locations: list[str]) -> str:
    for loc in preferred_locations:
        s = str(loc).strip()
        if s:
            return s
    return ""


def _normalize_job(row: dict[str, Any]) -> dict[str, Any] | None:
    jid = row.get("id")
    title = row.get("title")
    if jid is None or not title:
        return None

    ext = normalize_external_id(jid)
    if not ext:
        return None
    snippet = row.get("snippet") or ""
    desc_text = plain_from_html(str(snippet)) if snippet else str(title)
    link = row.get("link")
    company = row.get("company")
    loc = row.get("location")
    salary = row.get("salary")

    return {
        "provider": "jooble",
        "source_name": "Jooble",
        "external_id": ext,
        "title": str(title)[:512],
        "organization": str(company)[:512] if company else None,
        "location": str(loc)[:512] if loc else None,
        "description_html": str(snippet) if snippet else None,
        "description_text": desc_text[:50000],
        "url": str(link)[:2048] if link else None,
        "salary_range": str(salary)[:255] if salary else None,
        "posted_at": _parse_updated(row.get("updated")),
        "raw_data": row,
    }


async def fetch_jooble_jobs(
    *,
    role_categories: list[str],
    preferred_locations: list[str],
    keywords: list[str],
    country_codes: list[str] | None = None,
) -> list[dict[str, Any]]:
    api_key = (settings.jooble_api_key or "").strip()
    if not api_key:
        logger.info(
            "Jooble skipped: set APP_JOOBLE_API_KEY (https://jooble.org/api/about)",
        )
        return []

    kw_str = _build_keywords(role_categories, keywords)
    page = str(max(1, settings.jooble_page))
    radius = str(settings.jooble_radius_km)

    resolved_cc = normalize_adzuna_country_codes(country_codes or [])
    if resolved_cc:
        locs = jooble_locations_for_countries(resolved_cc)
    else:
        loc = _first_location(preferred_locations)
        locs = [loc] if loc else [""]

    url = f"{_JOOBLE_API}/{api_key}"
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    total_count: object | None = None

    async with httpx.AsyncClient(timeout=60.0) as client:
        for location in locs:
            body: dict[str, Any] = {
                "keywords": kw_str,
                "location": location,
                "radius": radius,
                "page": page,
                "companysearch": "false",
            }
            try:
                resp = await client.post(
                    url,
                    json=body,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                )
            except httpx.RequestError as exc:
                logger.warning("Jooble request error: %s", exc)
                continue

            if resp.status_code == 403:
                logger.warning(
                    "Jooble HTTP 403 — invalid APP_JOOBLE_API_KEY or access denied",
                )
                return out

            if resp.status_code >= 400:
                logger.warning(
                    "Jooble HTTP %s: %s",
                    resp.status_code,
                    resp.text[:500],
                )
                continue

            try:
                data = resp.json()
            except Exception:
                logger.warning("Jooble: response is not valid JSON")
                continue

            total_count = data.get("totalCount")
            jobs_raw = data.get("jobs") or []
            if not isinstance(jobs_raw, list):
                continue

            for row in jobs_raw:
                if not isinstance(row, dict):
                    continue
                norm = _normalize_job(row)
                if not norm:
                    continue
                key = norm["external_id"]
                if key in seen:
                    continue
                seen.add(key)
                out.append(norm)

    logger.info(
        "Jooble: %d unique job(s) (totalCount=%s, %d location scope(s))",
        len(out),
        total_count,
        len(locs),
    )
    return out
