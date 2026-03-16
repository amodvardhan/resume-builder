"""
Resume parsing service — extracts plain text from .docx and .pdf files.
"""

from __future__ import annotations

import logging
from pathlib import Path

from docx import Document

logger = logging.getLogger(__name__)


def extract_text_from_docx(file_path: Path) -> str:
    doc = Document(str(file_path))
    parts: list[str] = []

    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if not text:
            if parts and parts[-1] != "":
                parts.append("")
            continue

        style_name = (paragraph.style.name or "").lower() if paragraph.style else ""
        is_heading = "heading" in style_name

        is_bold_line = False
        if not is_heading and paragraph.runs:
            bold_chars = sum(len(r.text) for r in paragraph.runs if r.bold)
            total_chars = sum(len(r.text) for r in paragraph.runs)
            if total_chars > 0 and bold_chars / total_chars > 0.6:
                is_bold_line = True

        if is_heading or is_bold_line:
            if parts and parts[-1] != "":
                parts.append("")
            parts.append(f"[SECTION: {text}]")
        else:
            parts.append(text)

    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                parts.append(" | ".join(cells))

    return "\n".join(parts)


def extract_text_from_pdf(file_path: Path) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(str(file_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
    return "\n".join(parts)


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
