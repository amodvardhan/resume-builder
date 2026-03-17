"""
Resume parsing service — extracts structured plain text from .docx and .pdf files.

Uses direct XML traversal (not just python-docx's API) so that content inside
Word content-controls (SDTs), legacy form fields, text boxes, and merged table
cells is captured.  This is critical for form-style resumes (e.g. UN P11)
where the candidate's actual data lives in ``<w:sdt>`` elements that
``paragraph.text`` silently skips.

Outputs semantically tagged text so the LLM can reliably identify each section.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from docx import Document

logger = logging.getLogger(__name__)

# ── Word-processing XML namespace ──────────────────────────────────────────
_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# ── Section-heading classifiers ────────────────────────────────────────────
_SECTION_PATTERNS: dict[str, re.Pattern[str]] = {
    "SUMMARY": re.compile(
        r"(summary|profile|objective|about\s*me|professional\s+summary|career\s+summary"
        r"|executive\s+summary|personal\s+statement)",
        re.IGNORECASE,
    ),
    "EXPERIENCE": re.compile(
        r"(experience|employment|work\s+history|professional\s+experience"
        r"|career\s+history|relevant\s+experience|positions?\s+held)",
        re.IGNORECASE,
    ),
    "EDUCATION": re.compile(
        r"(education|academic|qualifications?|degrees?|training\s+&?\s*education)",
        re.IGNORECASE,
    ),
    "SKILLS": re.compile(
        r"(skills|competenc|technical\s+skills|core\s+skills|key\s+skills"
        r"|areas?\s+of\s+expertise|proficiencies|tools?\s+&?\s*technologies)",
        re.IGNORECASE,
    ),
    "CERTIFICATIONS": re.compile(
        r"(certif|licen[sc]|accreditation|credentials|professional\s+development"
        r"|continuing\s+education)",
        re.IGNORECASE,
    ),
    "PROJECTS": re.compile(
        r"(projects?|portfolio|key\s+projects|selected\s+projects)",
        re.IGNORECASE,
    ),
    "AWARDS": re.compile(
        r"(awards?|honors?|honours?|recognition|achievements?|publications?)",
        re.IGNORECASE,
    ),
    "LANGUAGES": re.compile(
        r"(languages?|linguistic)",
        re.IGNORECASE,
    ),
    "VOLUNTEER": re.compile(
        r"(volunteer|community|civic|extracurricular)",
        re.IGNORECASE,
    ),
}

_FORM_NOISE = re.compile(
    r"^("
    r"if you require additional|please copy and paste|"
    r"what were your main achievements|"
    r"what were your duties and responsibilities|"
    r"by ticking this box,?\s*i certify|i hereby certify|"
    r"i hereby give my consent|"
    r"i understand that any misrepresentation|"
    r"if\s+.?yes.?,?\s*please explain|"
    r"click here to enter|click or tap|"
    r"please note that all fields|"
    r"please record all relevant|"
    r"starting with your current \(or last\)|"
    r"if you are currently studying"
    r")",
    re.IGNORECASE,
)

_FORM_PLACEHOLDER = re.compile(
    r"^(type here|dd/mm/yyyy|mm/yyyy|select\s+grade|select\s+\w+|n/?a)$",
    re.IGNORECASE,
)

_DATE_PATTERN = re.compile(
    r"(19|20)\d{2}|present|current|ongoing",
    re.IGNORECASE,
)


# ═══════════════════════════════════════════════════════════════════════════
# Low-level XML helpers
# ═══════════════════════════════════════════════════════════════════════════


def _xml_text(element: object) -> str:
    """Extract ALL text from any XML element, including SDTs and form fields.

    Uses ``element.iter()`` to find every ``<w:t>`` descendant regardless of
    nesting depth — this is the key fix for content-control / form documents.
    """
    return "".join(
        t.text for t in element.iter(f"{_NS}t") if t.text  # type: ignore[union-attr]
    ).strip()


def _xml_is_heading_style(p_elem: object) -> bool:
    pPr = p_elem.find(f"{_NS}pPr")  # type: ignore[union-attr]
    if pPr is not None:
        pStyle = pPr.find(f"{_NS}pStyle")
        if pStyle is not None:
            val = pStyle.get(f"{_NS}val", "")
            if "heading" in val.lower():
                return True
    return False


def _xml_is_bold(p_elem: object) -> bool:
    """True when >60 % of the paragraph's run text is bold."""
    bold_chars = 0
    total_chars = 0
    for r in p_elem.iter(f"{_NS}r"):  # type: ignore[union-attr]
        run_text = "".join(t.text for t in r.findall(f"{_NS}t") if t.text)
        if not run_text:
            continue
        is_bold = False
        rPr = r.find(f"{_NS}rPr")
        if rPr is not None:
            b = rPr.find(f"{_NS}b")
            if b is not None:
                val = b.get(f"{_NS}val")
                is_bold = val is None or val.lower() != "false"
        n = len(run_text)
        if is_bold:
            bold_chars += n
        total_chars += n
    return total_chars > 0 and bold_chars / total_chars > 0.6


def _xml_is_underline(p_elem: object) -> bool:
    ul_chars = 0
    total_chars = 0
    for r in p_elem.iter(f"{_NS}r"):  # type: ignore[union-attr]
        run_text = "".join(t.text for t in r.findall(f"{_NS}t") if t.text)
        if not run_text:
            continue
        is_ul = False
        rPr = r.find(f"{_NS}rPr")
        if rPr is not None:
            u = rPr.find(f"{_NS}u")
            if u is not None:
                val = u.get(f"{_NS}val", "")
                is_ul = val not in ("", "none")
        n = len(run_text)
        if is_ul:
            ul_chars += n
        total_chars += n
    return total_chars > 0 and ul_chars / total_chars > 0.6


# ═══════════════════════════════════════════════════════════════════════════
# Shared heading / section logic
# ═══════════════════════════════════════════════════════════════════════════


def _classify_heading(text: str) -> str:
    clean = text.strip().rstrip(":")
    for label, pattern in _SECTION_PATTERNS.items():
        if pattern.search(clean):
            return label
    return clean.upper()


def _is_all_caps_heading(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 3:
        return False
    return all(c.isupper() for c in letters) and len(text) < 60


def _is_form_label(text: str) -> bool:
    """Heuristic: bold lines that end with ':' and are short are form labels, not headings."""
    stripped = text.rstrip()
    return stripped.endswith(":") and len(stripped) < 45


def _process_line(
    text: str,
    is_heading: bool,
    is_bold: bool,
    is_underline: bool,
    current_section: str | None,
    parts: list[str],
) -> str | None:
    """Decide whether *text* is a section heading or content; append to *parts*."""
    matches_known_section = any(
        p.search(text) for p in _SECTION_PATTERNS.values()
    )

    is_section = (
        is_heading
        or _is_all_caps_heading(text)
        or (
            (is_bold or is_underline)
            and not _is_form_label(text)
            and matches_known_section
        )
    )

    if is_section:
        label = _classify_heading(text)
        if parts and parts[-1] != "":
            parts.append("")
        parts.append(f"[SECTION: {label}]")
        if label != text.strip().upper().rstrip(":"):
            parts.append(text)
        return label

    if current_section == "EXPERIENCE" and len(text) < 120:
        if _DATE_PATTERN.search(text):
            parts.append(f"[ROLE: {text}]")
            return current_section
        if (is_bold or is_underline) and not _is_form_label(text):
            parts.append(f"[ROLE: {text}]")
            return current_section

    parts.append(text)
    return current_section


# ═══════════════════════════════════════════════════════════════════════════
# DOCX extractor — walks the raw XML so nothing is missed
# ═══════════════════════════════════════════════════════════════════════════


def _local_tag(elem: object) -> str:
    tag = elem.tag  # type: ignore[union-attr]
    return tag.split("}")[-1] if "}" in tag else tag


def _process_p_element(
    p_elem: object,
    current_section: str | None,
    parts: list[str],
) -> str | None:
    text = _xml_text(p_elem)
    if not text:
        if parts and parts[-1] != "":
            parts.append("")
        return current_section

    if _FORM_NOISE.search(text):
        return current_section
    if _FORM_PLACEHOLDER.match(text):
        return current_section

    is_h = _xml_is_heading_style(p_elem)
    is_b = _xml_is_bold(p_elem)
    is_u = _xml_is_underline(p_elem)
    return _process_line(text, is_h, is_b, is_u, current_section, parts)


def _walk_element(
    elem: object,
    current_section: str | None,
    parts: list[str],
) -> str | None:
    """Recursively walk an XML element, dispatching paragraphs, tables, SDTs."""
    tag = _local_tag(elem)

    if tag == "p":
        return _process_p_element(elem, current_section, parts)

    if tag == "sdt":
        sdt_content = elem.find(f"{_NS}sdtContent")  # type: ignore[union-attr]
        if sdt_content is not None:
            for child in sdt_content:
                current_section = _walk_element(child, current_section, parts)
        return current_section

    for child in elem:  # type: ignore[union-attr]
        current_section = _walk_element(child, current_section, parts)
    return current_section


def extract_text_from_docx(file_path: Path) -> str:
    """Extract all text from a .docx, including form fields and content controls."""
    doc = Document(str(file_path))

    parts: list[str] = []
    current_section: str | None = None

    for child in doc.element.body:
        current_section = _walk_element(child, current_section, parts)

    result = "\n".join(parts)
    result = re.sub(r"\n{3,}", "\n\n", result)

    # Deduplicate consecutive identical lines (common in merged table cells)
    lines = result.split("\n")
    deduped: list[str] = []
    for line in lines:
        if not deduped or line != deduped[-1]:
            deduped.append(line)

    return "\n".join(deduped).strip()


# ═══════════════════════════════════════════════════════════════════════════
# PDF extractor
# ═══════════════════════════════════════════════════════════════════════════


def extract_text_from_pdf(file_path: Path) -> str:
    import pdfplumber

    parts: list[str] = []
    current_section: str | None = None

    with pdfplumber.open(str(file_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue

            for line in text.split("\n"):
                stripped = line.strip()
                if not stripped:
                    if parts and parts[-1] != "":
                        parts.append("")
                    continue

                if _FORM_NOISE.search(stripped):
                    continue

                is_likely_heading = (
                    _is_all_caps_heading(stripped)
                    or (len(stripped) < 50 and stripped.endswith(":"))
                    or (
                        len(stripped) < 40
                        and any(p.search(stripped) for p in _SECTION_PATTERNS.values())
                    )
                )

                if is_likely_heading:
                    label = _classify_heading(stripped.rstrip(":"))
                    if parts and parts[-1] != "":
                        parts.append("")
                    parts.append(f"[SECTION: {label}]")
                    if label != stripped.upper().rstrip(":"):
                        parts.append(stripped)
                    current_section = label
                else:
                    if (
                        current_section == "EXPERIENCE"
                        and _DATE_PATTERN.search(stripped)
                        and len(stripped) < 120
                    ):
                        parts.append(f"[ROLE: {stripped}]")
                        continue
                    parts.append(stripped)

            tables = page.extract_tables()
            for table in tables or []:
                for row in table:
                    cells = [c.strip() for c in row if c and c.strip()]
                    if cells:
                        combined = " | ".join(cells)
                        if not _FORM_NOISE.search(combined):
                            parts.append(combined)

    result = "\n".join(parts)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


# ═══════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════


def extract_resume_text(file_path: Path, file_type: str) -> str:
    if file_type == "docx":
        return extract_text_from_docx(file_path)
    elif file_type == "pdf":
        return extract_text_from_pdf(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def html_to_plain_text(html: str) -> str:
    """Convert HTML job description to structured plain text preserving semantic meaning."""
    from bs4 import BeautifulSoup

    if not html or not html.strip():
        return ""

    soup = BeautifulSoup(html, "html.parser")

    for script_or_style in soup(["script", "style", "iframe"]):
        script_or_style.decompose()

    lines: list[str] = []
    for element in soup.descendants:
        if element.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            text = element.get_text(strip=True)
            if text:
                lines.append(f"\n## {text}")
        elif element.name == "li":
            text = element.get_text(strip=True)
            if text:
                parent = element.parent
                if parent and parent.name == "ol":
                    lines.append(f"  1. {text}")
                else:
                    lines.append(f"  - {text}")
        elif element.name == "p":
            text = element.get_text(strip=True)
            if text:
                lines.append(text)
        elif element.name == "br":
            lines.append("")

    result = "\n".join(lines).strip()
    if not result:
        return soup.get_text(separator="\n", strip=True)
    return result
