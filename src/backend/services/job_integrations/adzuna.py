"""Adzuna Jobs API — primary aggregator (official REST).

Docs: https://developer.adzuna.com/docs/search
Requires APP_ADZUNA_APP_ID and APP_ADZUNA_APP_KEY from https://developer.adzuna.com/signup
"""

from __future__ import annotations

import asyncio
import itertools
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from src.backend.config import settings
from src.backend.services.job_integrations._text import (
    normalize_external_id,
    plain_from_html,
)

logger = logging.getLogger(__name__)

_ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs"


def _parse_created(val: Any) -> datetime | None:
    if not val or not isinstance(val, str):
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.strptime(val[:19], fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _salary_str(job: dict[str, Any]) -> str | None:
    smin = job.get("salary_min")
    smax = job.get("salary_max")
    if smin is None and smax is None:
        return None
    parts = []
    if smin is not None:
        parts.append(str(smin))
    if smax is not None:
        parts.append(str(smax))
    return " – ".join(parts) if parts else None


def _normalize_ad(row: dict[str, Any]) -> dict[str, Any] | None:
    jid = row.get("id")
    title = row.get("title")
    if jid is None or not title:
        return None
    ext = normalize_external_id(jid)
    if not ext:
        return None
    loc = row.get("location") or {}
    if isinstance(loc, dict):
        display = loc.get("display_name") or ""
    else:
        display = str(loc)

    company = row.get("company") or {}
    if isinstance(company, dict):
        org = company.get("display_name")
    else:
        org = None

    desc = row.get("description") or ""
    desc_text = plain_from_html(str(desc)) if desc else str(title)
    url = row.get("redirect_url")

    return {
        "provider": "adzuna",
        "source_name": "Adzuna",
        "external_id": ext,
        "title": str(title)[:512],
        "organization": str(org)[:512] if org else None,
        "location": str(display)[:512] if display else None,
        "description_html": str(desc) if desc else None,
        "description_text": desc_text[:50000],
        "url": str(url)[:2048] if url else None,
        "salary_range": _salary_str(row),
        "posted_at": _parse_created(row.get("created")),
        "raw_data": row,
    }


def _search_pairs(
    role_categories: list[str],
    preferred_locations: list[str],
    keywords: list[str],
    max_pairs: int,
) -> list[tuple[str, str]]:
    """Build (what, where) pairs; cap API volume."""
    roles = [r.strip() for r in role_categories if r and str(r).strip()]
    locs = [l.strip() for l in preferred_locations if l and str(l).strip()]
    kw = [k.strip() for k in keywords if k and str(k).strip()]

    if not roles and kw:
        roles = [" ".join(kw[:5])]
    if not roles:
        roles = [" ".join(kw) if kw else "jobs"]

    if not locs:
        locs = [""]

    pairs: list[tuple[str, str]] = []
    for what, where in itertools.product(roles[:5], locs[:3]):
        pairs.append((what, where))
        if len(pairs) >= max_pairs:
            break
    if not pairs:
        pairs = [(roles[0], locs[0])]
    return pairs[:max_pairs]


async def fetch_adzuna_jobs(
    *,
    role_categories: list[str],
    preferred_locations: list[str],
    keywords: list[str],
) -> list[dict[str, Any]]:
    app_id = (settings.adzuna_app_id or "").strip()
    app_key = (settings.adzuna_app_key or "").strip()
    if not app_id or not app_key:
        logger.info(
            "Adzuna skipped: set APP_ADZUNA_APP_ID and APP_ADZUNA_APP_KEY "
            "(https://developer.adzuna.com/signup)",
        )
        return []

    country = (settings.adzuna_country or "gb").strip().lower()
    per_page = max(1, min(50, settings.adzuna_results_per_page))
    max_pairs = max(1, settings.adzuna_max_search_pairs)

    pairs = _search_pairs(role_categories, preferred_locations, keywords, max_pairs)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=45.0) as client:
        for what, where in pairs:
            params = {
                "app_id": app_id,
                "app_key": app_key,
                "results_per_page": per_page,
                "what": what,
                "content-type": "application/json",
            }
            if where:
                params["where"] = where

            url = f"{_ADZUNA_BASE}/{country}/search/1"
            try:
                resp = await client.get(url, params=params)
            except httpx.RequestError as exc:
                logger.warning("Adzuna request error for what=%r where=%r: %s", what, where, exc)
                continue

            if resp.status_code in (401, 403):
                logger.warning(
                    "Adzuna HTTP %s — check APP_ADZUNA_APP_ID / APP_ADZUNA_APP_KEY",
                    resp.status_code,
                )
                return out

            if resp.status_code >= 400:
                logger.warning(
                    "Adzuna HTTP %s for what=%r: %s",
                    resp.status_code,
                    what,
                    resp.text[:400],
                )
                continue

            try:
                data = resp.json()
            except Exception:
                logger.warning("Adzuna: invalid JSON for what=%r", what)
                continue

            results = data.get("results") or []
            if not isinstance(results, list):
                continue

            for row in results:
                if not isinstance(row, dict):
                    continue
                norm = _normalize_ad(row)
                if not norm:
                    continue
                key = norm["external_id"]
                if key in seen:
                    continue
                seen.add(key)
                out.append(norm)

            await asyncio.sleep(0.25)

    logger.info("Adzuna: collected %d unique job(s) from %d search pair(s)", len(out), len(pairs))
    return out
