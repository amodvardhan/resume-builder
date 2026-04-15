"""
RSS parsing and feed metadata for the IO careers module only.

Used by future io-jobs ingestion (scheduler / DB). Does not touch ``JobListing`` or job sync.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Literal
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

IoJobFamily = Literal["un", "mdb", "eu", "other"]


def _local_tag(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _child_text(parent: ET.Element, *names: str) -> str:
    want = {n.lower() for n in names}
    for child in parent:
        if _local_tag(child.tag).lower() in want:
            return (child.text or "").strip()
    return ""


@dataclass(frozen=True, slots=True)
class IoRssItem:
    """One vacancy entry from an RSS 2.0 ``<item>`` (or compatible) element."""

    title: str
    link: str
    guid: str | None
    pub_date: str | None


# Host substring → UI / attribution label (first match wins; more specific hosts first).
# Many agencies have no single documented URL — add feeds via APP_IO_JOB_RSS_URLS after verifying
# on the official careers site (Taleo/PageUp/Talent Soft often expose per-search RSS links).
_HOST_TO_SOURCE_LABEL: tuple[tuple[str, str], ...] = (
    ("careers.un.org", "UN Careers"),
    ("careers.who.int", "WHO"),
    ("who.int", "WHO"),
    ("jobs.unicef.org", "UNICEF"),
    ("iaea.taleo.net", "IAEA"),
    ("iaea.org", "IAEA"),
    ("opcw-career.talent-soft.com", "OPCW"),
    ("jobs.opcw.org", "OPCW"),
    ("opcw.org", "OPCW"),
    ("jobs.ilo.org", "ILO"),
    ("ilo.org", "ILO"),
    ("unicc.org", "UNICC"),
    ("undp.org", "UNDP"),
    ("reliefweb.int", "ReliefWeb"),
)


def parse_rss_pub_date(raw: str | None) -> datetime | None:
    """Parse RSS ``pubDate`` / ``dc:date`` style strings to UTC-aware datetimes."""
    if not raw or not raw.strip():
        return None
    try:
        dt = parsedate_to_datetime(raw.strip())
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def infer_io_job_family(
    feed_url: str,
    title: str = "",
    item_link: str = "",
) -> IoJobFamily:
    """
    Coarse bucket for filters (heuristic — not eligibility or employer classification).

    EU institutions vs UN vs MDBs are inferred from host / text; many feeds map to ``other``.
    Third-party feed hosts (e.g. rss.app) are classified using the vacancy ``item_link`` host
    when present so UNjobs/un.org links are not stuck in ``other``.
    """
    host = (urlparse(feed_url).hostname or "").lower()
    link_host = (urlparse(item_link).hostname or "").lower()
    tl = title.lower()
    blob = f"{host} {link_host} {tl}"

    # Aggregators (rss.app, etc.): infer from employer posting URL + title, not feed host.
    if "unjobs.org" in link_host:
        if any(
            x in tl
            for x in (
                "world bank",
                "international finance corporation",
                "ifc",
                "miga",
                "multilateral investment",
            )
        ):
            return "mdb"
        return "un"
    if any(
        x in host
        for x in (
            "europa.eu",
            "epso.europa.eu",
            "eu-careers",
        )
    ) or "epso" in blob:
        return "eu"
    if any(
        x in host or x in link_host
        for x in (
            "worldbankgroup.org",
            "worldbank.org",
            "adb.org",
            "afdb.org",
            "iadb.org",
            "ebrd.com",
            "aiib.org",
            "ifad.org",
            "idb.org",
        )
    ):
        return "mdb"
    if "reliefweb.int" in host:
        return "other"
    if any(
        x in host or x in link_host
        for x in (
            "un.org",
            "undp.org",
            "unicef.org",
            "who.int",
            "wfp.org",
            "unfpa.org",
            "unhcr.org",
            "ohchr.org",
        )
    ):
        return "un"
    return "other"


def infer_io_feed_source_label(feed_url: str) -> str:
    """Human-readable source name for attribution (e.g. UN Careers)."""
    host = (urlparse(feed_url).hostname or "").lower()
    for needle, label in _HOST_TO_SOURCE_LABEL:
        if needle in host:
            return label
    return host or "RSS feed"


def parse_rss_items(xml: str | bytes) -> list[IoRssItem]:
    """
    Parse RSS 2.0 ``<item>`` elements. Returns an empty list on malformed XML.

    Does not fetch URLs — pass response body from httpx or tests.
    """
    try:
        if isinstance(xml, str):
            root = ET.fromstring(xml.encode("utf-8"))
        else:
            root = ET.fromstring(xml)
    except ET.ParseError:
        return []

    out: list[IoRssItem] = []
    for el in root.iter():
        if _local_tag(el.tag).lower() != "item":
            continue
        title = _child_text(el, "title")
        link = _child_text(el, "link")
        guid = _child_text(el, "guid") or None
        pub_date = _child_text(el, "pubDate", "published") or None
        if not title and not link:
            continue
        out.append(
            IoRssItem(
                title=title or "",
                link=link or "",
                guid=guid,
                pub_date=pub_date,
            ),
        )
    return out
