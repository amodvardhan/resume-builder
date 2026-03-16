"""
Tailoring engine — LangChain orchestration + python-docx injection.

Responsibilities:
  1. Accept a JD, user profile, and template reference.
  2. Build a LangChain chain (ChatPromptTemplate → ChatOpenAI → PydanticOutputParser).
  3. Inject the parsed JSON fields into a *copy* of the .docx template.
  4. Return the output file path and generated cover-letter text.
"""

from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from docx import Document
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field, field_validator

from src.backend.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _coerce_experience_to_str(value: Any) -> str:
    """Accept a plain string or a dict the LLM may produce and flatten it."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        parts: list[str] = []
        if value.get("title"):
            line = str(value["title"])
            if value.get("organization"):
                line += f" | {value['organization']}"
            if value.get("dates"):
                line += f" | {value['dates']}"
            parts.append(line)
        for bullet in value.get("achievements", value.get("bullets", [])):
            parts.append(f"• {bullet}")
        if value.get("description"):
            parts.append(str(value["description"]))
        return "\n".join(parts) if parts else str(value)
    return str(value)


# ---------------------------------------------------------------------------
# Pydantic model whose fields map 1:1 to {{TAGS}} inside .docx templates
# ---------------------------------------------------------------------------


class TailoredContent(BaseModel):
    """Structured output the LLM *must* produce — keys become tag replacements.

    Every field value MUST be a single plain-text string that will be injected
    directly into a Word document paragraph.  All content MUST originate from
    the candidate's uploaded resume.
    """

    summary: str = Field(
        description=(
            "A 3-4 sentence professional summary that bridges the candidate's "
            "REAL background (extracted from their resume) with the target JD. "
            "Must reference actual roles and skills from the resume. "
            "Single plain-text string, no nested objects."
        )
    )
    experience_1: str = Field(
        description=(
            "The candidate's most JD-relevant REAL job from their resume. "
            "MUST use the actual title, organization, and dates from the resume. "
            "Format: 'Title | Org | Dates\\n• bullet\\n• bullet'. "
            "Bullets must be real achievements from the resume, rephrased for JD alignment. "
            "Must be a flat string, NOT a JSON object."
        )
    )
    experience_2: str = Field(
        description=(
            "The candidate's second most JD-relevant REAL job from their resume. "
            "Same extraction and format rules as experience_1."
        )
    )
    experience_3: str = Field(
        description=(
            "The candidate's third most JD-relevant REAL job from their resume. "
            "Same extraction and format rules as experience_1."
        )
    )
    skills: str = Field(
        description=(
            "Comma-separated skills EXTRACTED from the candidate's resume, "
            "reordered by relevance to the JD. Only include skills evidenced "
            "in the resume."
        )
    )
    education: str = Field(
        description=(
            "Education details EXTRACTED from the candidate's resume. "
            "Must include the real degree(s), institution(s), and date(s). "
            "If no education section exists in the resume, output "
            "'Not specified in resume'."
        )
    )

    @field_validator("experience_1", "experience_2", "experience_3", mode="before")
    @classmethod
    def _flatten_experience(cls, v: Any) -> str:
        return _coerce_experience_to_str(v)


class CoverLetterContent(BaseModel):
    """Structured cover-letter output."""

    cover_letter: str = Field(description="Full cover-letter body text")


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SENTIMENT_PREAMBLES: dict[str, str] = {
    "formal": (
        "You write in a polished, formal register suitable for government and "
        "intergovernmental organizations. Avoid colloquialisms."
    ),
    "mission-driven": (
        "You write with genuine passion about the organization's mission. "
        "Show alignment between the candidate's values and the org's purpose."
    ),
    "conversational": (
        "You write in a warm yet professional tone that feels personable "
        "while remaining appropriate for a corporate setting."
    ),
}

_RESUME_SYSTEM = (
    "You are a senior resume-tailoring specialist. Your job has TWO phases:\n"
    "  Phase A — EXTRACT verbatim facts from the candidate's attached resume.\n"
    "  Phase B — TAILOR the extracted content to align with the target job description.\n\n"
    "The candidate's core skills are: {core_skills}.\n"
    "{history_context}"
    "The candidate's ACTUAL resume (uploaded by them) is below. "
    "This is the ONLY source of truth for their background:\n"
    "--- BEGIN CANDIDATE RESUME ---\n"
    "{resume_text}\n"
    "--- END CANDIDATE RESUME ---\n\n"
    "═══════════════════════════════════════════════════\n"
    "PHASE A — EXTRACTION RULES (MANDATORY):\n"
    "═══════════════════════════════════════════════════\n"
    "1. **EXPERIENCE**: Find EVERY job/role entry in the resume above. "
    "Extract the REAL job title, REAL organization name, REAL dates, and "
    "REAL achievement bullets EXACTLY as they appear. Do NOT invent, "
    "fabricate, or hallucinate any role, company, date, or achievement "
    "that is not in the resume.\n"
    "2. **SKILLS**: Find the skills/competencies section in the resume. "
    "Extract the ACTUAL skills listed by the candidate. If the resume has "
    "no explicit skills section, infer skills ONLY from the experience "
    "descriptions in the resume.\n"
    "3. **EDUCATION**: Find the education section in the resume. Extract "
    "the REAL degree(s), institution(s), and graduation date(s). If the "
    "resume contains no education section, output 'Not specified in resume'.\n\n"
    "═══════════════════════════════════════════════════\n"
    "PHASE B — TAILORING RULES:\n"
    "═══════════════════════════════════════════════════\n"
    "4. **SUMMARY**: Write a 3-4 sentence professional summary that "
    "bridges the candidate's ACTUAL background (from the resume) with the "
    "target JD. Highlight the candidate's real strengths that match the "
    "JD's priorities. Do NOT claim expertise the resume does not support.\n"
    "5. **EXPERIENCE_1, _2, _3**: Pick the 3 most JD-relevant roles from "
    "the resume. For each, keep the REAL title, org, and dates. "
    "Re-order and rephrase the REAL achievement bullets to emphasize "
    "alignment with the JD's keywords. You may slightly reword bullets "
    "for clarity but NEVER add achievements that don't exist in the resume.\n"
    "6. **SKILLS**: Take the extracted skills and reorder them by "
    "relevance to the JD. You may add skills that are clearly demonstrated "
    "in the resume's experience section, but NEVER add skills the candidate "
    "has no evidence of.\n"
    "7. **EDUCATION**: Return the education exactly as extracted. "
    "Do not alter degrees, institutions, or dates.\n\n"
    "═══════════════════════════════════════════════════\n"
    "OUTPUT FORMAT RULES:\n"
    "═══════════════════════════════════════════════════\n"
    "8. **Every JSON value MUST be a single flat string.** "
    "Do NOT return nested objects or arrays for any field.\n"
    "9. For each `experience_N`: format as "
    "\"Title | Organization | Dates\\n• achievement 1\\n• achievement 2\\n• achievement 3\". "
    "Use \\n for line breaks. Include 3-5 achievement bullets per role.\n"
    "10. For `skills`: a single comma-separated string.\n"
    "11. For `education`: a single string with all degrees.\n\n"
    "{format_instructions}"
)

_RESUME_HUMAN = (
    "Job title: {job_title}\n"
    "Organization: {organization}\n\n"
    "Job description:\n{job_description}"
)

_COVER_LETTER_SYSTEM = (
    "{sentiment_preamble}\n\n"
    "You are a career coach writing a cover letter for a candidate.\n"
    "Candidate core skills: {core_skills}.\n"
    "They are applying for {job_title} at {organization}.\n\n"
    "The candidate's ACTUAL resume (uploaded by them) is below:\n"
    "--- BEGIN CANDIDATE RESUME ---\n"
    "{resume_text}\n"
    "--- END CANDIDATE RESUME ---\n\n"
    "RULES:\n"
    "1. Reference SPECIFIC, REAL achievements and roles from the resume above. "
    "Use the candidate's actual job titles, organizations, and accomplishments.\n"
    "2. Connect the candidate's REAL background to the requirements in the JD.\n"
    "3. NEVER claim the candidate has experience or achievements not in their resume.\n"
    "4. Produce a complete, ready-to-send cover letter body (no placeholders).\n"
    "5. Keep it to 3-4 paragraphs.\n\n"
    "{format_instructions}"
)

_COVER_LETTER_HUMAN = "Job description:\n{job_description}"


# ---------------------------------------------------------------------------
# Document injection
# ---------------------------------------------------------------------------


def _replace_tags_in_paragraph(paragraph: Any, replacements: dict[str, str]) -> None:
    """Replace {{TAG}} placeholders that may span multiple XML runs.

    Word frequently splits contiguous text like ``{{SUMMARY}}`` into
    separate runs (e.g. ``{{``, ``SUMMARY``, ``}}``).  This function
    concatenates the full paragraph text, performs replacements, then
    redistributes the result back into the original runs so that XML
    styling on the *first* run of each match is preserved.
    """
    full_text = "".join(run.text for run in paragraph.runs)
    if not any(("{{" + tag.upper() + "}}") in full_text for tag in replacements):
        return

    for tag, value in replacements.items():
        placeholder = "{{" + tag.upper() + "}}"
        full_text = full_text.replace(placeholder, value)

    if not paragraph.runs:
        return

    paragraph.runs[0].text = full_text
    for run in paragraph.runs[1:]:
        run.text = ""


def inject_into_template(template_path: Path, replacements: dict[str, str]) -> str:
    """
    Copy the master template and replace every ``{{TAG}}`` with the matching
    value from *replacements*.  Returns the output **filename** (not full path)
    for use with the ``/api/v1/files/{file_name}`` download endpoint.
    """
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    output_filename = f"{uuid.uuid4()}.docx"
    output_path = settings.output_dir / output_filename

    shutil.copy2(template_path, output_path)
    doc = Document(str(output_path))

    for paragraph in doc.paragraphs:
        _replace_tags_in_paragraph(paragraph, replacements)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    _replace_tags_in_paragraph(paragraph, replacements)

    doc.save(str(output_path))
    return output_filename


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def generate_draft(
    *,
    core_skills: list[str],
    resume_text: str = "",
    job_title: str,
    organization: str,
    job_description: str,
    cover_letter_sentiment: str | None,
    history_context: str = "",
) -> dict[str, str]:
    """
    Phase 1 of human-in-the-loop: run LLM chains and return the raw draft
    content for user review.  No docx is generated and nothing is persisted.

    Returns a dict with keys: summary, experience_1..3, skills, education,
    cover_letter.
    """
    # ---- Resume chain ----
    resume_parser = PydanticOutputParser(pydantic_object=TailoredContent)
    resume_prompt = ChatPromptTemplate.from_messages(
        [("system", _RESUME_SYSTEM), ("human", _RESUME_HUMAN)]
    )

    resume_llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0.4,
        api_key=settings.openai_api_key,
    )

    resume_chain = resume_prompt | resume_llm | resume_parser

    tailored: TailoredContent = await resume_chain.ainvoke(
        {
            "core_skills": ", ".join(core_skills),
            "resume_text": resume_text,
            "history_context": history_context,
            "format_instructions": resume_parser.get_format_instructions(),
            "job_title": job_title,
            "organization": organization,
            "job_description": job_description,
        }
    )

    # ---- Cover-letter chain ----
    cl_parser = PydanticOutputParser(pydantic_object=CoverLetterContent)
    sentiment_key = (cover_letter_sentiment or "formal").lower().strip()
    sentiment_preamble = _SENTIMENT_PREAMBLES.get(
        sentiment_key, _SENTIMENT_PREAMBLES["formal"]
    )

    cl_prompt = ChatPromptTemplate.from_messages(
        [("system", _COVER_LETTER_SYSTEM), ("human", _COVER_LETTER_HUMAN)]
    )

    cl_llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0.7,
        api_key=settings.openai_api_key,
    )

    cl_chain = cl_prompt | cl_llm | cl_parser

    cover_letter: CoverLetterContent = await cl_chain.ainvoke(
        {
            "sentiment_preamble": sentiment_preamble,
            "core_skills": ", ".join(core_skills),
            "resume_text": resume_text,
            "job_title": job_title,
            "organization": organization,
            "format_instructions": cl_parser.get_format_instructions(),
            "job_description": job_description,
        }
    )

    return {
        **tailored.model_dump(),
        "cover_letter": cover_letter.cover_letter,
    }


def finalize_document(
    *,
    template_path: Path,
    content: dict[str, str],
) -> str:
    """
    Phase 2 of human-in-the-loop: take the (possibly user-edited) content
    and inject it into the docx template.

    *content* must contain keys matching ``TailoredContent`` fields
    (summary, experience_1..3, skills, education).  The ``cover_letter``
    key, if present, is ignored during injection.

    Returns the output filename for download.
    """
    resume_fields = {
        k: v for k, v in content.items() if k != "cover_letter"
    }
    return inject_into_template(template_path, resume_fields)


async def tailor_resume(
    *,
    core_skills: list[str],
    resume_text: str = "",
    job_title: str,
    organization: str,
    job_description: str,
    cover_letter_sentiment: str | None,
    template_path: Path,
    history_context: str = "",
) -> dict[str, str]:
    """
    Full pipeline (kept for backward-compat with clone flow):
      generate_draft → finalize_document in one shot.

    Returns ``{"tailored_resume_url": str, "cover_letter_text": str}``.
    """
    draft = await generate_draft(
        core_skills=core_skills,
        resume_text=resume_text,
        job_title=job_title,
        organization=organization,
        job_description=job_description,
        cover_letter_sentiment=cover_letter_sentiment,
        history_context=history_context,
    )

    output_filename = finalize_document(
        template_path=template_path,
        content=draft,
    )

    return {
        "tailored_resume_url": output_filename,
        "cover_letter_text": draft["cover_letter"],
    }
