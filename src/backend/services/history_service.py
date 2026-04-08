"""
History / clone service — "Use as Reference" flow.

Takes an existing Application row, extracts its tailored artefacts,
and feeds them as historical context into a fresh tailoring run for a new JD.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.models import Application, Resume, Template, User
from src.backend.services.profile_photo import resolved_photo_path
from src.backend.services.resume_parser import html_to_plain_text
from src.backend.services.tailor_engine import tailor_resume

logger = logging.getLogger(__name__)


def _build_history_context(source: Application) -> str:
    """
    Format the source application's artefacts into a context block that will
    be injected as a SystemMessage preamble in the LangChain prompt.
    """
    parts: list[str] = [
        "=== REFERENCE APPLICATION (use as baseline) ===",
        f"Previous role: {source.job_title} at {source.organization}",
    ]
    if source.cover_letter_text:
        parts.append(f"Previous cover letter:\n{source.cover_letter_text}")
    parts.append("=== END REFERENCE ===\n")
    return "\n".join(parts)


async def clone_application(
    *,
    session: AsyncSession,
    source_application_id: uuid.UUID,
    new_job_title: str,
    new_organization: str,
    new_job_description_html: str,
) -> Application:
    """
    Clone a prior application as the contextual baseline for a new JD.

    Steps:
      1. Load source Application + its Template + owning User + Resume.
      2. Build history-context string from the source's artefacts.
      3. Delegate to ``tailor_resume`` with the history context injected.
      4. Persist and return a new Application row linked back via
         ``reference_application_id``.
    """
    source = await session.get(Application, source_application_id)
    if source is None:
        raise LookupError(f"Application {source_application_id} not found")

    template_path: Path | None = None
    if source.template_id is not None:
        template = await session.get(Template, source.template_id)
        if template is not None:
            tp = Path(template.file_path)
            if tp.exists():
                template_path = tp

    user = await session.get(User, source.user_id)
    if user is None:
        raise LookupError(f"User {source.user_id} not found")

    resume_text = ""
    if source.resume_id:
        resume = await session.get(Resume, source.resume_id)
        if resume is not None:
            resume_text = resume.extracted_text

    core_skills: list[str] = user.core_skills if isinstance(user.core_skills, list) else []
    history_context = _build_history_context(source)
    jd_plain_text = html_to_plain_text(new_job_description_html)
    photo_path = resolved_photo_path(getattr(user, "profile_photo_path", None))

    result = await tailor_resume(
        core_skills=core_skills,
        resume_text=resume_text,
        job_title=new_job_title,
        organization=new_organization,
        job_description=jd_plain_text,
        cover_letter_sentiment=source.cover_letter_sentiment,
        template_path=template_path,
        history_context=history_context,
        profile_photo_path=photo_path,
    )

    new_app = Application(
        id=uuid.uuid4(),
        user_id=source.user_id,
        resume_id=source.resume_id,
        template_id=source.template_id,
        job_title=new_job_title,
        organization=new_organization,
        job_description_html=new_job_description_html,
        cover_letter_sentiment=source.cover_letter_sentiment,
        tailored_resume_url=result["tailored_resume_url"],
        cover_letter_text=result["cover_letter_text"],
        reference_application_id=source_application_id,
    )
    session.add(new_app)
    await session.commit()
    await session.refresh(new_app)
    return new_app
