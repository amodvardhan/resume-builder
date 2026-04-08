"""LinkedIn Talent Solutions — list organization job postings via REST.

Uses ``GET /rest/simpleJobPostings`` with ``q=organization`` (Microsoft Learn).
Requires a partner OAuth 2.0 access token with job-posting access for the org.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

from src.backend.config import settings
from src.backend.services.job_integrations._text import plain_from_html

logger = logging.getLogger(__name__)

_LINKEDIN_REST = "https://api.linkedin.com/rest"


def _parse_ts(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        try:
            return datetime.fromtimestamp(float(val) / 1000.0, tz=timezone.utc)
        except (OSError, ValueError, OverflowError):
            return None
    if isinstance(val, str):
        s = val.strip()
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%d",
        ):
            try:
                dt = datetime.strptime(s[:26], fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


def _extract_id_from_urn(urn: str | None) -> str:
    if not urn:
        return ""
    m = re.search(r":(?:jobPosting|fsd_jobPosting):(\d+)", urn)
    if m:
        return m.group(1)
    m = re.search(r"(\d+)$", urn)
    return m.group(1) if m else urn


def _normalize_element(el: dict[str, Any]) -> dict[str, Any] | None:
    """Map a LinkedIn simpleJobPosting REST element to our job dict."""
    title = el.get("title") or el.get("jobPostingName")
    if isinstance(title, dict):
        title = title.get("text") or title.get("localized", {}).get("en_US")
    if not title:
        return None

    urn = el.get("id") or el.get("entityUrn") or ""
    ext = _extract_id_from_urn(str(urn)) if urn else ""
    if not ext:
        ext = str(hash(str(el)))[:16]

    company = el.get("companyName") or el.get("hiringOrganization", {}).get("name")
    if isinstance(company, dict):
        company = company.get("name") or company.get("text")

    loc = el.get("location") or el.get("jobLocation")
    if isinstance(loc, dict):
        loc = loc.get("displayName") or loc.get("name") or loc.get("locationName")

    desc_html = el.get("description") or el.get("jobDescription")
    if isinstance(desc_html, dict):
        desc_html = desc_html.get("text") or desc_html.get("rawText")
    desc_text = plain_from_html(str(desc_html)) if desc_html else str(title)

    listed = el.get("listedAt") or el.get("created") or el.get("postedAt")

    job_url = el.get("jobPostingUrl") or el.get("applyUrl")
    if not job_url and ext:
        job_url = f"https://www.linkedin.com/jobs/view/{ext}"

    return {
        "provider": "linkedin",
        "source_name": "LinkedIn",
        "external_id": ext,
        "title": str(title)[:512],
        "organization": str(company)[:512] if company else None,
        "location": str(loc)[:512] if loc else None,
        "description_html": str(desc_html) if desc_html else None,
        "description_text": desc_text[:50000] if desc_text else str(title),
        "url": str(job_url)[:2048] if job_url else None,
        "salary_range": None,
        "posted_at": _parse_ts(listed),
        "raw_data": el,
    }


async def fetch_linkedin_job_postings() -> list[dict[str, Any]]:
    """Fetch job postings for the configured LinkedIn organization."""
    token = (settings.linkedin_access_token or "").strip()
    org = (settings.linkedin_organization_urn or "").strip()
    if not token or not org:
        logger.info(
            "LinkedIn integration skipped: set APP_LINKEDIN_ACCESS_TOKEN and "
            "APP_LINKEDIN_ORGANIZATION_URN",
        )
        return []

    headers = {
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": settings.linkedin_api_version,
        "X-Restli-Protocol-Version": "2.0.0",
        "Accept": "application/json",
    }

    org_quoted = quote(org, safe="")
    url = (
        f"{_LINKEDIN_REST}/simpleJobPostings"
        f"?q=organization&organization={org_quoted}&count=50"
    )

    jobs: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code in (401, 403):
            logger.warning(
                "LinkedIn API %s (%s) — check token and Talent API access",
                resp.status_code,
                resp.text[:300],
            )
            return []
        if resp.status_code >= 400:
            logger.warning(
                "LinkedIn API HTTP %s: %s",
                resp.status_code,
                resp.text[:500],
            )
            return []

        data = resp.json()
        elements = data.get("elements") or data.get("values") or []
        if isinstance(elements, dict):
            elements = [elements]

        for el in elements:
            if not isinstance(el, dict):
                continue
            row = _normalize_element(el)
            if row:
                jobs.append(row)

    logger.info("LinkedIn: fetched %d job posting(s)", len(jobs))
    return jobs
