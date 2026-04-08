"""Tailoring engine + reference engine (history & cloning) routes."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import settings
from src.backend.database import get_session
from src.backend.models import Application, Resume, Template, User
from src.backend.schemas import (
    ApplicationResponse,
    CloneRequest,
    CloneResponse,
    RegenerateSectionRequest,
    RegenerateSectionResponse,
    TailorConfirmRequest,
    TailorConfirmResponse,
    TailorPreviewRequest,
    TailorPreviewResponse,
    TailorRequest,
    TailorResponse,
)
from src.backend.services.auth_service import get_current_user
from src.backend.services.history_service import clone_application
from src.backend.services.resume_parser import html_to_plain_text
from src.backend.services.tailor_engine import (
    finalize_document,
    generate_draft,
    regenerate_section,
    tailor_resume,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["applications"])


# ---------------------------------------------------------------------------
# Tailoring
# ---------------------------------------------------------------------------


@router.post("/applications/tailor", response_model=TailorResponse)
async def tailor(
    payload: TailorRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TailorResponse:
    effective_user_id = current_user.id

    user = await session.get(User, effective_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    resume = await session.get(Resume, payload.resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")

    template_path: Path | None = None
    if payload.template_id is not None:
        template = await session.get(Template, payload.template_id)
        if template is not None:
            tp = Path(template.file_path)
            if tp.exists():
                template_path = tp

    core_skills: list[str] = user.core_skills if isinstance(user.core_skills, list) else []
    jd_plain_text = html_to_plain_text(payload.job_description_html)

    try:
        result = await tailor_resume(
            core_skills=core_skills,
            resume_text=resume.extracted_text,
            job_title=payload.job_title,
            organization=payload.organization,
            job_description=jd_plain_text,
            cover_letter_sentiment=payload.cover_letter_sentiment,
            template_path=template_path,
            template_style=payload.template_style,
        )
    except Exception:
        logger.exception("Tailoring engine failed")
        raise HTTPException(status_code=500, detail="Tailoring engine encountered an error")

    application = Application(
        id=uuid.uuid4(),
        user_id=effective_user_id,
        resume_id=payload.resume_id,
        template_id=payload.template_id,
        job_title=payload.job_title,
        organization=payload.organization,
        job_description_html=payload.job_description_html,
        cover_letter_sentiment=payload.cover_letter_sentiment,
        tailored_resume_url=result["tailored_resume_url"],
        cover_letter_text=result["cover_letter_text"],
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)

    return TailorResponse(
        application_id=application.id,
        tailored_resume_url=application.tailored_resume_url or "",
        cover_letter_text=application.cover_letter_text or "",
        cover_letter_url=result.get("cover_letter_url", ""),
        resume_pdf_url=result.get("resume_pdf_url", ""),
        cover_letter_pdf_url=result.get("cover_letter_pdf_url", ""),
    )


# ---------------------------------------------------------------------------
# Human-in-the-Loop: Preview -> Review -> Confirm
# ---------------------------------------------------------------------------


@router.post("/applications/tailor/preview", response_model=TailorPreviewResponse)
async def tailor_preview(
    payload: TailorPreviewRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TailorPreviewResponse:
    effective_user_id = current_user.id

    user = await session.get(User, effective_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    resume = await session.get(Resume, payload.resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")

    if payload.template_id is not None:
        template = await session.get(Template, payload.template_id)
        if template is None:
            raise HTTPException(status_code=404, detail="Template not found")

    core_skills: list[str] = user.core_skills if isinstance(user.core_skills, list) else []
    jd_plain_text = html_to_plain_text(payload.job_description_html)

    try:
        draft = await generate_draft(
            core_skills=core_skills,
            resume_text=resume.extracted_text,
            job_title=payload.job_title,
            organization=payload.organization,
            job_description=jd_plain_text,
            cover_letter_sentiment=payload.cover_letter_sentiment,
        )
    except Exception:
        logger.exception("Preview generation failed")
        raise HTTPException(status_code=500, detail="AI draft generation encountered an error")

    return TailorPreviewResponse(**draft)


@router.post("/applications/tailor/confirm", response_model=TailorConfirmResponse)
async def tailor_confirm(
    payload: TailorConfirmRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TailorConfirmResponse:
    effective_user_id = current_user.id

    template_path: Path | None = None
    if payload.template_id is not None:
        template = await session.get(Template, payload.template_id)
        if template is not None:
            tp = Path(template.file_path)
            if tp.exists():
                template_path = tp

    content = {
        "summary": payload.summary,
        "experiences": payload.experiences,
        "skills": payload.skills,
        "education": payload.education,
        "certifications": payload.certifications,
        "cover_letter": payload.cover_letter,
    }

    try:
        result = finalize_document(
            template_path=template_path,
            content=content,
            template_style=payload.template_style,
        )
    except Exception:
        logger.exception("Document finalization failed")
        raise HTTPException(status_code=500, detail="Document generation encountered an error")

    application = Application(
        id=uuid.uuid4(),
        user_id=effective_user_id,
        resume_id=payload.resume_id,
        template_id=payload.template_id,
        job_title=payload.job_title,
        organization=payload.organization,
        job_description_html=payload.job_description_html,
        cover_letter_sentiment=payload.cover_letter_sentiment,
        tailored_resume_url=result["resume_url"],
        cover_letter_text=payload.cover_letter,
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)

    return TailorConfirmResponse(
        application_id=application.id,
        tailored_resume_url=result["resume_url"],
        cover_letter_text=payload.cover_letter,
        cover_letter_url=result["cover_letter_url"],
        resume_pdf_url=result.get("resume_pdf_url", ""),
        cover_letter_pdf_url=result.get("cover_letter_pdf_url", ""),
    )


@router.post(
    "/applications/tailor/regenerate-section",
    response_model=RegenerateSectionResponse,
)
async def tailor_regenerate_section(
    payload: RegenerateSectionRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RegenerateSectionResponse:
    effective_user_id = current_user.id

    user = await session.get(User, effective_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    resume = await session.get(Resume, payload.resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")

    core_skills: list[str] = user.core_skills if isinstance(user.core_skills, list) else []
    jd_plain_text = html_to_plain_text(payload.job_description_html)

    try:
        new_content = await regenerate_section(
            core_skills=core_skills,
            resume_text=resume.extracted_text,
            job_title=payload.job_title,
            organization=payload.organization,
            job_description=jd_plain_text,
            section_id=payload.section_id,
            current_content=payload.current_content,
            cover_letter_sentiment=payload.cover_letter_sentiment,
            user_instruction=payload.user_instruction or "",
        )
    except Exception:
        logger.exception("Section regeneration failed")
        raise HTTPException(status_code=500, detail="Section regeneration encountered an error")

    return RegenerateSectionResponse(
        section_id=payload.section_id,
        content=new_content,
    )


# ---------------------------------------------------------------------------
# Reference Engine (History & Cloning)
# ---------------------------------------------------------------------------


@router.get(
    "/users/{user_id}/applications",
    response_model=list[ApplicationResponse],
)
async def list_user_applications(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ApplicationResponse]:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    result = await session.execute(
        select(Application)
        .where(Application.user_id == user_id)
        .order_by(Application.created_at.desc())
    )
    applications = result.scalars().all()
    return [
        ApplicationResponse(
            id=a.id,
            user_id=a.user_id,
            resume_id=a.resume_id,
            template_id=a.template_id,
            job_title=a.job_title,
            organization=a.organization,
            job_description_html=a.job_description_html,
            cover_letter_sentiment=a.cover_letter_sentiment,
            tailored_resume_url=a.tailored_resume_url,
            cover_letter_text=a.cover_letter_text,
            reference_application_id=a.reference_application_id,
            created_at=a.created_at.isoformat(),
        )
        for a in applications
    ]


@router.get("/applications/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ApplicationResponse:
    a = await session.get(Application, application_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return ApplicationResponse(
        id=a.id,
        user_id=a.user_id,
        resume_id=a.resume_id,
        template_id=a.template_id,
        job_title=a.job_title,
        organization=a.organization,
        job_description_html=a.job_description_html,
        cover_letter_sentiment=a.cover_letter_sentiment,
        tailored_resume_url=a.tailored_resume_url,
        cover_letter_text=a.cover_letter_text,
        reference_application_id=a.reference_application_id,
        created_at=a.created_at.isoformat(),
    )


@router.post("/applications/{application_id}/clone", response_model=CloneResponse)
async def clone(
    application_id: uuid.UUID,
    payload: CloneRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CloneResponse:
    try:
        new_app = await clone_application(
            session=session,
            source_application_id=application_id,
            new_job_title=payload.new_job_title,
            new_organization=payload.new_organization,
            new_job_description_html=payload.new_job_description_html,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Clone operation failed")
        raise HTTPException(status_code=500, detail="Clone operation encountered an error")

    return CloneResponse(
        new_application_id=new_app.id,
        tailored_resume_url=new_app.tailored_resume_url,  # type: ignore[arg-type]
        cover_letter_text=new_app.cover_letter_text,  # type: ignore[arg-type]
    )


@router.delete(
    "/applications/{application_id}",
    status_code=204,
    response_model=None,
)
async def delete_application(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    application = await session.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    if application.tailored_resume_url:
        output_file = settings.output_dir / application.tailored_resume_url
        output_file.unlink(missing_ok=True)

    await session.delete(application)
    await session.commit()
