"""XING E-Recruiting API — list vendor job postings.

OAuth 2.0 bearer token from an approved XING developer app (contract-based).
See https://dev.xing.com/partners/job_integration
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from src.backend.config import settings
from src.backend.services.job_integrations._text import plain_from_html

logger = logging.getLogger(__name__)


def _parse_date(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, str):
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%d",
        ):
            try:
                dt = datetime.strptime(val[:26], fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


def _normalize_posting(p: dict[str, Any]) -> dict[str, Any] | None:
    pid = p.get("id") or p.get("posting_id") or p.get("uuid")
    title = p.get("title") or p.get("job_title") or p.get("name")
    if not pid or not title:
        return None

    desc = p.get("description") or p.get("job_description") or ""
    if isinstance(desc, dict):
        desc = desc.get("html") or desc.get("text") or ""
    desc_text = plain_from_html(str(desc)) if desc else str(title)

    locs = p.get("locations") or p.get("job_locations") or []
    location = None
    if isinstance(locs, list) and locs:
        first = locs[0]
        if isinstance(first, dict):
            location = first.get("city") or first.get("name") or first.get("label")
        else:
            location = str(first)

    company = p.get("company_name") or p.get("organization_name") or p.get("employer")

    apply_url = p.get("application_url") or p.get("xing_apply_url") or p.get("url")

    return {
        "provider": "xing",
        "source_name": "XING",
        "external_id": str(pid),
        "title": str(title)[:512],
        "organization": str(company)[:512] if company else None,
        "location": str(location)[:512] if location else None,
        "description_html": str(desc) if desc else None,
        "description_text": desc_text[:50000],
        "url": str(apply_url)[:2048] if apply_url else None,
        "salary_range": None,
        "posted_at": _parse_date(p.get("created_at") or p.get("published_at")),
        "raw_data": p,
    }


async def fetch_xing_postings() -> list[dict[str, Any]]:
    token = (settings.xing_access_token or "").strip()
    if not token:
        logger.info("XING integration skipped: set APP_XING_ACCESS_TOKEN")
        return []

    base = settings.xing_api_base.rstrip("/")
    url = f"{base}/vendor/jobs/postings"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code in (401, 403):
            logger.warning(
                "XING API %s (%s) — check OAuth token and E-Recruiting contract",
                resp.status_code,
                resp.text[:300],
            )
            return []
        if resp.status_code >= 400:
            logger.warning(
                "XING API HTTP %s: %s",
                resp.status_code,
                resp.text[:500],
            )
            return []

        data = resp.json()
        items = data.get("items") or data.get("postings") or data.get("data") or []
        if isinstance(items, dict):
            items = [items]
        if not isinstance(items, list):
            items = []

        for p in items:
            if not isinstance(p, dict):
                continue
            row = _normalize_posting(p)
            if row:
                out.append(row)

    logger.info("XING: fetched %d posting(s)", len(out))
    return out
