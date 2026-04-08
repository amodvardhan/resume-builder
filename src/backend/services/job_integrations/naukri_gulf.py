"""Naukri Gulf — ingest jobs from a partner XML/RSS feed URL.

InfoEdge/Naukri often provides XML job feeds to enterprise clients (FTP/HTTP).
This module fetches a configured HTTPS URL and parses RSS 2.0 or generic ``<item>`` jobs.
"""

from __future__ import annotations

import logging
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

import httpx

from src.backend.config import settings
from src.backend.services.job_integrations._text import plain_from_html

logger = logging.getLogger(__name__)


def _parse_pub_date(text: str | None) -> datetime | None:
    if not text:
        return None
    text = text.strip()
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(text[:31], fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _local_tag(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _parse_items(xml_bytes: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_bytes)
    items: list[ET.Element] = []

    # RSS 2.0
    for path in (".//item", ".//{http://www.w3.org/2005/Atom}entry"):
        items.extend(root.findall(path))

    if not items:
        # HR-XML or custom: any element named job or vacancy
        for el in root.iter():
            if _local_tag(el.tag).lower() in ("job", "vacancy", "position"):
                items.append(el)

    out: list[dict[str, Any]] = []
    for item in items:
        title = None
        link = None
        desc = None
        pub = None
        company = None
        location = None

        for child in list(item) + [item]:
            tag = _local_tag(child.tag).lower()
            text = (child.text or "").strip()
            if tag in ("title", "jobtitle", "job_title") and text:
                title = text
            elif tag in ("link", "url", "applyurl", "apply_url") and text:
                link = text
            elif tag in ("description", "jobdescription", "summary", "content") and text:
                desc = text
            elif tag in ("pubdate", "published", "dateposted", "posted_at") and text:
                pub = text
            elif tag in ("company", "employer", "hiring_organization") and text:
                company = text
            elif tag in ("location", "city", "joblocation") and text:
                location = text

        if title is None and item.text:
            title = item.text.strip()[:512]

        if not title:
            continue

        desc_text = plain_from_html(desc or "") or title
        ext = link or str(uuid.uuid5(uuid.NAMESPACE_URL, title + (desc or "")))

        out.append(
            {
                "provider": "naukri_gulf",
                "source_name": "Naukri Gulf",
                "external_id": ext[:1024],
                "title": title[:512],
                "organization": company[:512] if company else None,
                "location": location[:512] if location else None,
                "description_html": desc,
                "description_text": desc_text[:50000],
                "url": link[:2048] if link else None,
                "salary_range": None,
                "posted_at": _parse_pub_date(pub),
                "raw_data": None,
            },
        )

    return out


async def fetch_naukri_gulf_feed_jobs() -> list[dict[str, Any]]:
    url = (settings.naukri_gulf_xml_feed_url or "").strip()
    if not url:
        logger.info(
            "Naukri Gulf integration skipped: set APP_NAUKRI_GULF_XML_FEED_URL "
            "(HTTPS XML/RSS feed from your Naukri Gulf / InfoEdge partnership)",
        )
        return []

    if not re.match(r"^https?://", url, re.I):
        logger.warning("Naukri Gulf feed URL must be http(s): %s", url[:80])
        return []

    async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
        resp = await client.get(url)
        if resp.status_code >= 400:
            logger.warning(
                "Naukri Gulf feed HTTP %s: %s",
                resp.status_code,
                resp.text[:300],
            )
            return []
        body = resp.content

    try:
        jobs = _parse_items(body)
    except ET.ParseError as exc:
        logger.warning("Naukri Gulf XML parse error: %s", exc)
        return []

    logger.info("Naukri Gulf: parsed %d job(s) from feed", len(jobs))
    return jobs
