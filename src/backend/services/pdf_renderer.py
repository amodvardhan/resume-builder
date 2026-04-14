"""
PDF renderer — generates resume and cover-letter PDFs from HTML/CSS that
mirrors the frontend UI preview (same class names; A4 page size for exports).

Uses WeasyPrint (pure-Python, cross-platform, no MS Word / LibreOffice /
browser dependencies, no OS permission prompts).
"""

from __future__ import annotations

import base64
import re
import uuid
from html import escape as _esc
from pathlib import Path
from typing import Any

from ..config import settings

# ---------------------------------------------------------------------------
# HTML sanitisation helpers
# ---------------------------------------------------------------------------

_ALLOWED_TAG_RE = re.compile(r"<(/?)(b|strong|i|em|u)(?:\s[^>]*)?>", re.I)


def _safe(text: str) -> str:
    """Escape HTML but preserve <b>, <strong>, <i>, <em>, <u> tags."""
    if "<" not in text:
        return _esc(text)
    holds: list[str] = []

    def _hold(m: re.Match) -> str:
        holds.append(m.group(0))
        return f"\x00{len(holds) - 1}\x00"

    out = _ALLOWED_TAG_RE.sub(_hold, text)
    out = _esc(out)
    for i, tag in enumerate(holds):
        out = out.replace(f"\x00{i}\x00", tag)
    return out


def _nl2br(text: str) -> str:
    return _safe(text).replace("\n", "<br>")


def _split(text: str) -> list[str]:
    return [e.strip() for e in re.split(r"[;\n]", text) if e.strip()]


# ---------------------------------------------------------------------------
# SVG icons (embedded inline — no external files needed)
# ---------------------------------------------------------------------------

_SHIELD_SVG = (
    '<svg class="cert-icon" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round">'
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
    '<path d="M9 12l2 2 4-4"/>'
    "</svg>"
)

# ---------------------------------------------------------------------------
# CSS — mirrors the frontend index.css template classes exactly
# ---------------------------------------------------------------------------

_PDF_CSS = r"""
/* ── Reset & page (A4 — matches standard hiring / print expectations) ─ */
@page {
  size: A4;
  margin: 12mm 14mm 14mm 14mm;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
/* Fill the page box; do not fix Letter width (8.5in) on A4 — causes overflow pages */
html, body {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Calibri', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10pt;
  color: #1e293b;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.doc-page {
  width: 100%;
  max-width: 100%;
  background: #fff;
  position: relative;
}
img { max-width: 100%; height: auto; }

.body-text {
  font-size: 10pt;
  line-height: 1.6;
  color: #1e293b;
}
.section + .section { margin-top: 0.85rem; }
.sections { }

/* ── Whitespace-pre-wrap for experiences ─────────────────────────── */
.exp-wrap { white-space: pre-wrap; font-size: 9.5pt; line-height: 1.55; }

/* ═══════════ CLASSIC ═══════════════════════════════════════════════ */
.tpl-classic .content { padding: 0.7in 0.9in; }
.tpl-classic .tpl-header {
  text-align: center;
  border-bottom: 2px solid #0f172a;
  padding-bottom: 0.6rem;
  margin-bottom: 1.1rem;
}
.tpl-classic .header-label {
  font-size: 7.5pt; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.15em; color: #64748b;
}
.tpl-classic .tpl-section-heading {
  font-size: 7.5pt; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: #0f172a;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.2rem; margin-bottom: 0.45rem;
}

/* ═══════════ MODERN (grid + padding — matches index.css preview) ═════ */
.tpl-modern.doc-page { padding: 0; overflow: visible; }
.tpl-modern .tpl-grid {
  display: grid;
  grid-template-columns: 30% 70%;
  gap: 0;
  align-items: start;
}
.tpl-modern .tpl-sidebar {
  background: linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%);
  padding: 2rem 1.1rem 2rem 1.35rem;
  border-right: 1px solid rgba(51, 107, 135, 0.35);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.6);
}
.contact-sidebar-block {
  text-align: center;
  padding: 0 0.2rem 0.75rem 0.2rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid rgba(51, 107, 135, 0.18);
}
.contact-sidebar-name {
  font-size: 11pt;
  font-weight: 700;
  color: #336b87;
  margin-bottom: 0.45rem;
  line-height: 1.25;
}
.contact-sidebar-line {
  font-size: 8pt;
  line-height: 1.45;
  color: #334155;
  margin-bottom: 0.2rem;
  word-break: break-word;
}
.contact-sidebar-line .csl {
  display: block;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 0.06rem;
}
.contact-sidebar-line a { color: #2563eb; text-decoration: none; }
.resume-top-row {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.85rem;
}
.resume-top-contact { flex: 1; min-width: 0; text-align: left; }
.resume-top-photo { flex-shrink: 0; }
.resume-top-contact .contact-sidebar-name { text-align: left; font-size: 13pt; }
.resume-top-contact .contact-sidebar-line .csl { text-align: left; }
.resume-top-contact .contact-sidebar-line { text-align: left; }
.tpl-modern .tpl-main {
  padding: 2rem 2rem 2rem 1.5rem;
}
.tpl-modern .tpl-section-heading {
  font-size: 7pt; font-weight: 800; letter-spacing: 0.12em;
  text-transform: uppercase; color: #336b87; margin-bottom: 0.35rem;
}
.tpl-modern .body-text { font-size: 9.5pt; }
.tpl-modern .exp-wrap  { font-size: 9pt; }

/* ═══════════ MINIMAL ══════════════════════════════════════════════ */
.tpl-minimal .content { padding: 0.75in 1in; }
.tpl-minimal .tpl-section-heading {
  font-size: 7.5pt; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: #64748b; margin-bottom: 0.35rem;
}
.tpl-minimal .body-text,
.tpl-minimal .exp-wrap {
  font-family: Arial, Helvetica, sans-serif;
  color: #000;
}

/* ═══════════ EXECUTIVE ════════════════════════════════════════════ */
.tpl-executive .content {
  padding: 0in 0.8in 0.6in 0.8in;
  font-family: Georgia, 'Times New Roman', serif;
}
.tpl-executive .tpl-header {
  background-color: #1e293b;
  color: #fff;
  padding: 0.65rem 1rem;
  margin-bottom: 1.1rem;
}
.tpl-executive .header-label {
  font-size: 13pt; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: #fff; font-family: Georgia, 'Times New Roman', serif;
}
.tpl-executive .tpl-section-heading {
  font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #0f172a;
  border-left: 3px solid #336b87; padding-left: 0.5rem; margin-bottom: 0.45rem;
}
.tpl-executive .body-text,
.tpl-executive .exp-wrap {
  font-family: Georgia, 'Times New Roman', serif;
}

/* ═══════════ CREATIVE ═════════════════════════════════════════════ */
.tpl-creative .content { padding: 0in 0.8in 0.6in 0.8in; }
.tpl-creative .tpl-header {
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
  color: #fff;
  padding: 0.85rem 1rem;
  margin-bottom: 1.1rem;
}
.tpl-creative .header-label {
  font-size: 7.5pt; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.15em; color: #fff;
}
.tpl-creative .tpl-section-heading {
  font-size: 7pt; font-weight: 800; letter-spacing: 0.1em;
  text-transform: uppercase; color: #7c3aed;
  background: linear-gradient(90deg, #ede9fe, transparent);
  padding: 0.18rem 0.45rem; border-radius: 0.18rem; margin-bottom: 0.4rem;
}

/* ═══════════ FOLIO (editorial teal) ═══════════════════════════════ */
.tpl-folio .content { padding: 0in 0.85in 0.55in 0.85in; }
.tpl-folio .tpl-header {
  border-left: 5px solid #0f766e;
  padding: 0.55rem 0.75rem 0.55rem 1rem;
  margin-bottom: 1rem;
  background: linear-gradient(90deg, rgba(15,118,110,0.07), transparent);
}
.tpl-folio .header-label {
  font-size: 8pt; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: #0f766e; font-family: Georgia, 'Times New Roman', serif;
}
.tpl-folio .tpl-section-heading {
  font-size: 7pt; font-weight: 800; letter-spacing: 0.1em;
  text-transform: uppercase; color: #0f766e;
  border-bottom: 1px solid rgba(15,118,110,0.28); padding-bottom: 0.2rem; margin-bottom: 0.4rem;
}

/* ═══════════ NOVA (night aurora) ═════════════════════════════════ */
.tpl-nova .content { padding: 0in 0.8in 0.6in 0.8in; }
.tpl-nova .tpl-header {
  background: linear-gradient(90deg, #0b1120 0%, #1e293b 100%);
  color: #fff;
  padding: 0.65rem 1rem;
  margin-bottom: 1rem;
  border-bottom: 3px solid #22d3ee;
}
.tpl-nova .header-label {
  font-size: 9pt; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: #22d3ee; font-family: Georgia, serif;
}
.tpl-nova .tpl-section-heading {
  font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #0891b2;
  border-left: 3px solid #22d3ee; padding-left: 0.45rem; margin-bottom: 0.45rem;
}
.tpl-nova .body-text, .tpl-nova .exp-wrap {
  font-family: Georgia, 'Times New Roman', serif;
}

/* ═══════════ SIGNAL (tech mono) ══════════════════════════════════ */
.tpl-signal .content { padding: 0in 1in 0.65in 1in; }
.tpl-signal .tpl-header {
  border-bottom: 2px solid #0f172a;
  padding-bottom: 0.4rem;
  margin-bottom: 1rem;
}
.tpl-signal .header-label {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 7.5pt; font-weight: 700; letter-spacing: 0.22em;
  text-transform: uppercase; color: #0f172a;
}
.tpl-signal .tpl-section-heading {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 7pt; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: #0f172a;
  margin-bottom: 0.4rem;
}

/* ═══════════ ATLAS (international serif) ═════════════════════════ */
.tpl-atlas .content { padding: 0.85in 1.05in 0.85in 1.05in; }
.tpl-atlas .tpl-header {
  text-align: center;
  border-bottom: 1px solid #1e3a5f;
  padding-bottom: 0.45rem;
  margin-bottom: 1.15rem;
}
.tpl-atlas .header-label {
  font-size: 7pt; font-weight: 600; letter-spacing: 0.22em;
  text-transform: uppercase; color: #1e3a5f; font-family: Cambria, Georgia, serif;
}
.tpl-atlas .tpl-section-heading {
  font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #1e3a5f;
  border-bottom: 1px solid rgba(30,58,95,0.22); padding-bottom: 0.2rem; margin-bottom: 0.45rem;
}
.tpl-atlas .body-text, .tpl-atlas .exp-wrap {
  font-family: Cambria, Georgia, serif;
  font-size: 10.5pt;
}

.profile-photo-wrap { text-align: right; margin-bottom: 0.5rem; }
.profile-photo-img {
  width: 1.1in; height: 1.1in; object-fit: cover;
  border-radius: 50%;
  border: 2px solid rgba(51, 107, 135, 0.25);
}
.tpl-modern .profile-photo-wrap { text-align: center; margin-bottom: 0.65rem; }
.tpl-minimal .profile-photo-img { border-color: rgba(0,0,0,0.15); }

/* ═══════════ SKILL PILLS ══════════════════════════════════════════ */
.skill-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.skill-pill {
  display: inline-flex; align-items: center;
  padding: 0.12rem 0.5rem; font-size: 7.5pt; font-weight: 500;
  line-height: 1.4; border-radius: 9999px;
  background-color: rgba(37, 99, 235, 0.08); color: #2563eb;
  white-space: nowrap;
}
.tpl-modern .skill-pill {
  font-size: 7pt; padding: 0.09rem 0.4rem;
  background-color: rgba(51, 107, 135, 0.1); color: #336b87;
}
.tpl-executive .skill-pill {
  border-radius: 0.2rem;
  background-color: rgba(30, 41, 59, 0.06); color: #0f172a;
}
.tpl-creative .skill-pill {
  background: linear-gradient(135deg, rgba(124,58,237,0.08), rgba(37,99,235,0.08));
  color: #6d28d9;
}
.tpl-folio .skill-pill {
  border-radius: 0.2rem;
  background-color: rgba(15,118,110,0.1); color: #0f766e;
}
.tpl-nova .skill-pill {
  border-radius: 0.15rem;
  background-color: rgba(8,145,178,0.09); color: #0e7490;
}
.tpl-signal .skill-pill {
  border-radius: 0.12rem;
  font-family: Consolas, monospace;
  font-size: 7pt;
  background-color: rgba(15,23,42,0.06); color: #0f172a;
}
.tpl-atlas .skill-pill {
  border-radius: 9999px;
  background-color: rgba(30,58,95,0.08); color: #1e3a5f;
}

/* ═══════════ EDUCATION ════════════════════════════════════════════ */
.edu-entries { display: flex; flex-direction: column; }
.edu-entry { padding: 0.25rem 0; font-size: 9.5pt; line-height: 1.5; }
.edu-entry + .edu-entry { border-top: 1px solid rgba(0,0,0,0.08); }
.tpl-modern .edu-entry + .edu-entry { border-top-color: rgba(51,107,135,0.15); }
.tpl-modern .edu-entry { font-size: 8.5pt; }

/* ═══════════ CERTIFICATIONS ═══════════════════════════════════════ */
.cert-entries { display: flex; flex-direction: column; gap: 0.2rem; }
.cert-entry { display: flex; align-items: flex-start; gap: 0.3rem; font-size: 9.5pt; line-height: 1.5; }
.cert-icon {
  flex-shrink: 0; width: 0.7rem; height: 0.7rem; margin-top: 0.12rem;
  color: #2563eb; opacity: 0.7;
}
.tpl-modern .cert-icon { color: #336b87; }
.tpl-modern .cert-entry { font-size: 8.5pt; }
.tpl-creative .cert-icon { color: #6d28d9; }
.tpl-folio .cert-icon { color: #0f766e; }
.tpl-nova .cert-icon { color: #0891b2; }
.tpl-signal .cert-icon { color: #0f172a; }
.tpl-atlas .cert-icon { color: #1e3a5f; }

/* ═══════════ COVER LETTER ═════════════════════════════════════════ */
.cl-paragraph { margin-bottom: 0.7rem; line-height: 1.65; font-size: 10.5pt; }
"""

# ---------------------------------------------------------------------------
# HTML fragment builders
# ---------------------------------------------------------------------------


def _skills_html(skills: str) -> str:
    items = [s.strip() for s in skills.split(",") if s.strip()]
    pills = "".join(f'<span class="skill-pill">{_safe(s)}</span>' for s in items)
    return f'<div class="skill-pills">{pills}</div>'


def _education_html(education: str) -> str:
    entries = _split(education)
    items = "".join(
        f'<div class="edu-entry">{_safe(e)}</div>' for e in entries
    )
    return f'<div class="edu-entries">{items}</div>'


def _certifications_html(certifications: str) -> str:
    entries = _split(certifications)
    items = "".join(
        f'<div class="cert-entry">{_SHIELD_SVG}<span>{_safe(e)}</span></div>'
        for e in entries
    )
    return f'<div class="cert-entries">{items}</div>'


def _experiences_html(experiences: list[str]) -> str:
    parts: list[str] = []
    for i, exp in enumerate(experiences):
        parts.append(
            f'<div class="section">'
            f'<h3 class="tpl-section-heading">'
            f'Experience{f" {i+1}" if len(experiences) > 1 else ""}'
            f"</h3>"
            f'<div class="exp-wrap body-text">{_nl2br(exp)}</div>'
            f"</div>"
        )
    return "".join(parts)


def _section(heading: str, body: str) -> str:
    return (
        f'<div class="section">'
        f'<h3 class="tpl-section-heading">{_esc(heading)}</h3>'
        f"{body}"
        f"</div>"
    )


def _profile_photo_html_fragment(photo_path: Path | None) -> str:
    if not photo_path or not photo_path.is_file():
        return ""
    b64 = base64.standard_b64encode(photo_path.read_bytes()).decode("ascii")
    src = f"data:image/jpeg;base64,{b64}"
    return (
        '<div class="profile-photo-wrap">'
        f'<img src="{src}" alt="" class="profile-photo-img" />'
        "</div>"
    )


def _contact_identity_html(
    resume_contact: dict[str, str] | None,
    *,
    align: str = "center",
) -> str:
    """Name, LinkedIn, country, phone, email — same order as DOCX."""
    if not resume_contact:
        return ""
    rc = resume_contact
    if not any(
        rc.get(k)
        for k in ("full_name", "email", "phone", "country", "linkedin_url")
    ):
        return ""
    parts: list[str] = []
    al = "text-align: center;" if align == "center" else "text-align: left;"
    if rc.get("full_name"):
        parts.append(
            f'<div class="contact-sidebar-name" style="{al}">{_esc(rc["full_name"])}</div>'
        )
    for key, label in (
        ("linkedin_url", "LinkedIn"),
        ("country", "Country"),
        ("phone", "Phone"),
        ("email", "Email"),
    ):
        val = (rc.get(key) or "").strip()
        if not val:
            continue
        if key == "linkedin_url" and val.lower().startswith("http"):
            link = _esc(val)
            parts.append(
                '<div class="contact-sidebar-line" style="%s">'
                '<span class="csl">%s</span>'
                '<a href="%s">%s</a></div>'
                % (al, _esc(label), link, link)
            )
        else:
            parts.append(
                '<div class="contact-sidebar-line" style="%s">'
                '<span class="csl">%s</span>%s</div>'
                % (al, _esc(label), _esc(val))
            )
    wrap_cls = "contact-sidebar-block"
    return f'<div class="{wrap_cls}">{"".join(parts)}</div>'


def _resume_top_row_html(
    profile_photo_path: Path | None,
    resume_contact: dict[str, str] | None,
) -> str:
    """Single-column templates: contact left, round photo right."""
    photo = _profile_photo_html_fragment(profile_photo_path)
    ident = _contact_identity_html(resume_contact, align="left")
    if not photo and not ident:
        return ""
    if ident and not photo:
        return f'<div class="resume-top-row"><div class="resume-top-contact">{ident}</div></div>'
    if photo and not ident:
        return f'<div class="resume-top-row"><div class="resume-top-photo">{photo}</div></div>'
    return (
        '<div class="resume-top-row">'
        f'<div class="resume-top-contact">{ident}</div>'
        f'<div class="resume-top-photo">{photo}</div>'
        "</div>"
    )


# ---------------------------------------------------------------------------
# Full-page HTML builders
# ---------------------------------------------------------------------------


def _resume_html(
    content: dict[str, Any],
    style: str,
    profile_photo_path: Path | None = None,
    resume_contact: dict[str, str] | None = None,
) -> str:
    """Build full-page HTML for the resume, matching the UI preview exactly."""
    tpl = style or "classic"

    if tpl == "modern":
        body = _modern_resume_html(content, profile_photo_path, resume_contact)
    else:
        body = _single_col_resume_html(
            content, tpl, profile_photo_path, resume_contact
        )

    return (
        "<!DOCTYPE html>"
        "<html><head><meta charset='utf-8'>"
        f"<style>{_PDF_CSS}</style>"
        "</head><body>"
        f"{body}"
        "</body></html>"
    )


def _modern_resume_html(
    content: dict[str, Any],
    profile_photo_path: Path | None = None,
    resume_contact: dict[str, str] | None = None,
) -> str:
    sidebar_parts: list[str] = []
    photo_frag = _profile_photo_html_fragment(profile_photo_path)
    ident_frag = _contact_identity_html(resume_contact, align="center")
    if content.get("skills"):
        sidebar_parts.append(_section("Skills", _skills_html(content["skills"])))
    if content.get("education"):
        sidebar_parts.append(_section("Education", _education_html(content["education"])))
    if content.get("certifications"):
        sidebar_parts.append(
            _section("Certifications", _certifications_html(content["certifications"]))
        )

    main_parts: list[str] = []
    if content.get("summary"):
        main_parts.append(
            _section(
                "Professional Summary",
                f'<div class="body-text">{_nl2br(content["summary"])}</div>',
            )
        )
    exps = content.get("experiences", [])
    if exps:
        main_parts.append(_experiences_html(exps))

    sidebar_inner = (
        '<div class="sections">'
        + photo_frag
        + ident_frag
        + "".join(sidebar_parts)
        + "</div>"
    )
    main_inner = '<div class="sections">' + "".join(main_parts) + "</div>"

    return (
        '<div class="doc-page tpl-modern">'
        '<div class="tpl-grid">'
        f'<div class="tpl-sidebar">{sidebar_inner}</div>'
        f'<div class="tpl-main">{main_inner}</div>'
        "</div></div>"
    )


def _single_col_resume_html(
    content: dict[str, Any],
    tpl: str,
    profile_photo_path: Path | None = None,
    resume_contact: dict[str, str] | None = None,
) -> str:
    header = ""
    top_row = _resume_top_row_html(profile_photo_path, resume_contact)
    if tpl == "executive":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Executive Resume</div>'
            "</div>"
        )
    elif tpl == "creative":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Tailored Resume</div>'
            "</div>"
        )
    elif tpl == "classic":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Tailored Resume</div>'
            "</div>"
        )
    elif tpl == "folio":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Editorial Résumé</div>'
            "</div>"
        )
    elif tpl == "nova":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Professional Profile</div>'
            "</div>"
        )
    elif tpl == "signal":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Resume // SIGNAL</div>'
            "</div>"
        )
    elif tpl == "atlas":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Curriculum Vitae</div>'
            "</div>"
        )

    def _summary_label() -> str:
        if tpl == "executive":
            return "Executive Summary"
        if tpl == "creative":
            return "About Me"
        if tpl == "folio":
            return "Professional Narrative"
        if tpl == "nova":
            return "Positioning Summary"
        if tpl == "signal":
            return "Profile"
        if tpl == "atlas":
            return "Summary"
        return "Professional Summary"

    def _skills_label() -> str:
        if tpl == "executive":
            return "Core Competencies"
        if tpl == "creative":
            return "Skills & Tools"
        if tpl == "folio":
            return "Expertise"
        if tpl == "nova":
            return "Core Strengths"
        if tpl == "signal":
            return "Stack"
        return "Skills"

    def _certs_label() -> str:
        if tpl == "executive":
            return "Certifications & Credentials"
        if tpl in ("folio", "nova"):
            return "Credentials"
        return "Certifications"

    parts: list[str] = []
    if content.get("summary"):
        parts.append(
            _section(
                _summary_label(),
                f'<div class="body-text">{_nl2br(content["summary"])}</div>',
            )
        )
    exps = content.get("experiences", [])
    if exps:
        parts.append(_experiences_html(exps))
    if content.get("skills"):
        parts.append(_section(_skills_label(), _skills_html(content["skills"])))
    if content.get("education"):
        parts.append(_section("Education", _education_html(content["education"])))
    if content.get("certifications"):
        parts.append(
            _section(_certs_label(), _certifications_html(content["certifications"]))
        )

    sections = '<div class="sections">' + "".join(parts) + "</div>"

    return (
        f'<div class="doc-page tpl-{_esc(tpl)}">'
        f'<div class="content">{top_row}{header}{sections}</div>'
        "</div>"
    )


def _cover_letter_html(text: str, style: str) -> str:
    tpl = style or "classic"

    header = ""
    if tpl == "executive":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Cover Letter</div>'
            "</div>"
        )
    elif tpl == "creative":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Cover Letter</div>'
            "</div>"
        )
    elif tpl == "folio":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Cover Letter</div>'
            "</div>"
        )
    elif tpl == "nova":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Cover Letter</div>'
            "</div>"
        )
    elif tpl == "signal":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">// COVER LETTER</div>'
            "</div>"
        )
    elif tpl == "atlas":
        header = (
            '<div class="tpl-header">'
            '<div class="header-label">Cover Letter</div>'
            "</div>"
        )

    paragraphs = "".join(
        f'<p class="cl-paragraph body-text">{_nl2br(p.strip())}</p>'
        for p in text.split("\n\n")
        if p.strip()
    )

    padding_cls = "content" if tpl not in ("executive", "creative") else "content"

    return (
        "<!DOCTYPE html>"
        "<html><head><meta charset='utf-8'>"
        f"<style>{_PDF_CSS}</style>"
        "</head><body>"
        f'<div class="doc-page tpl-{_esc(tpl)}">'
        f'<div class="{padding_cls}">{header}{paragraphs}</div>'
        "</div></body></html>"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_resume_pdf(
    content: dict[str, Any],
    template_style: str | None = None,
    profile_photo_path: Path | None = None,
    resume_contact: dict[str, str] | None = None,
) -> str:
    """Render the resume to PDF via WeasyPrint. Returns the output filename."""
    from weasyprint import HTML

    settings.output_dir.mkdir(parents=True, exist_ok=True)

    html_str = _resume_html(
        content,
        template_style or "classic",
        profile_photo_path=profile_photo_path,
        resume_contact=resume_contact,
    )
    filename = f"{uuid.uuid4()}.pdf"
    path = settings.output_dir / filename
    HTML(string=html_str).write_pdf(str(path))
    return filename


def build_cover_letter_pdf(
    cover_letter_text: str, template_style: str | None = None
) -> str:
    """Render the cover letter to PDF via WeasyPrint. Returns the output filename."""
    from weasyprint import HTML

    settings.output_dir.mkdir(parents=True, exist_ok=True)

    html_str = _cover_letter_html(cover_letter_text, template_style or "classic")
    filename = f"cover-letter-{uuid.uuid4()}.pdf"
    path = settings.output_dir / filename
    HTML(string=html_str).write_pdf(str(path))
    return filename
