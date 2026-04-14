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
from src.backend.models import Application, JobMatch, Resume, Template, User
from src.backend.schemas import (
    ApplicationRegenerateCoverPdfResponse,
    ApplicationRegenerateResumePdfResponse,
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
from src.backend.services.profile_photo import resolved_photo_path
from src.backend.services.resume_parser import html_to_plain_text
from src.backend.services.pdf_renderer import build_cover_letter_pdf, build_resume_pdf
from src.backend.services.tailor_engine import (
    finalize_document,
    generate_draft,
    regenerate_section,
    resume_contact_from_user,
    tailor_resume,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["applications"])


def _profile_photo_path_for_user(user: User | None) -> Path | None:
    if user is None:
        return None
    return resolved_photo_path(getattr(user, "profile_photo_path", None))


def _application_to_response(a: Application) -> ApplicationResponse:
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
        cover_letter_url=a.cover_letter_url,
        resume_pdf_url=a.resume_pdf_url,
        cover_letter_pdf_url=a.cover_letter_pdf_url,
        cover_letter_text=a.cover_letter_text,
        reference_application_id=a.reference_application_id,
        job_match_id=getattr(a, "job_match_id", None),
        created_at=a.created_at.isoformat(),
        export_snapshot_present=_export_snapshot_present(a),
    )


def _export_snapshot_present(app: Application) -> bool:
    raw = getattr(app, "export_snapshot", None)
    return bool(raw and isinstance(raw, dict))


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
    photo_path = _profile_photo_path_for_user(user)

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
            profile_photo_path=photo_path,
            resume_contact=resume_contact_from_user(user),
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
        cover_letter_url=result.get("cover_letter_url") or None,
        resume_pdf_url=result.get("resume_pdf_url") or None,
        cover_letter_pdf_url=result.get("cover_letter_pdf_url") or None,
        cover_letter_text=result["cover_letter_text"],
        export_snapshot=result.get("export_snapshot"),
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

    user = await session.get(User, effective_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

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
            profile_photo_path=_profile_photo_path_for_user(user),
            resume_contact=resume_contact_from_user(user),
        )
    except Exception:
        logger.exception("Document finalization failed")
        raise HTTPException(status_code=500, detail="Document generation encountered an error")

    confirm_snapshot = {
        **content,
        "template_style": (payload.template_style or "classic"),
    }

    resolved_match_id: uuid.UUID | None = None
    if payload.job_match_id is not None:
        jm = await session.get(JobMatch, payload.job_match_id)
        if jm is None or jm.user_id != effective_user_id:
            raise HTTPException(
                status_code=400,
                detail="Invalid job_match_id — must be your own dashboard match.",
            )
        resolved_match_id = jm.id

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
        cover_letter_url=result.get("cover_letter_url") or None,
        resume_pdf_url=result.get("resume_pdf_url") or None,
        cover_letter_pdf_url=result.get("cover_letter_pdf_url") or None,
        cover_letter_text=payload.cover_letter,
        export_snapshot=confirm_snapshot,
        job_match_id=resolved_match_id,
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
    return [_application_to_response(a) for a in applications]


@router.get("/applications/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ApplicationResponse:
    a = await session.get(Application, application_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return _application_to_response(a)


@router.post(
    "/applications/{application_id}/exports/resume-pdf",
    response_model=ApplicationRegenerateResumePdfResponse,
)
async def regenerate_application_resume_pdf(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ApplicationRegenerateResumePdfResponse:
    """Rebuild resume PDF using the same pipeline as tailor confirm (snapshot + current profile photo/contact)."""
    a = await session.get(Application, application_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if a.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    raw = getattr(a, "export_snapshot", None)
    if not raw or not isinstance(raw, dict):
        raise HTTPException(
            status_code=422,
            detail="No export snapshot for this application — cannot rebuild PDF.",
        )
    style = str(raw.get("template_style") or "classic").strip() or "classic"
    content = {k: v for k, v in raw.items() if k != "template_style"}
    user = await session.get(User, a.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        fn = build_resume_pdf(
            content,
            template_style=style,
            profile_photo_path=_profile_photo_path_for_user(user),
            resume_contact=resume_contact_from_user(user),
        )
    except Exception:
        logger.exception("Regenerate resume PDF failed")
        raise HTTPException(status_code=500, detail="Could not generate resume PDF")
    a.resume_pdf_url = fn
    await session.commit()
    await session.refresh(a)
    return ApplicationRegenerateResumePdfResponse(resume_pdf_url=fn)


@router.post(
    "/applications/{application_id}/exports/cover-letter-pdf",
    response_model=ApplicationRegenerateCoverPdfResponse,
)
async def regenerate_application_cover_letter_pdf(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ApplicationRegenerateCoverPdfResponse:
    """Rebuild cover letter PDF the same way as finalize_document."""
    a = await session.get(Application, application_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if a.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    raw = getattr(a, "export_snapshot", None)
    if not raw or not isinstance(raw, dict):
        raise HTTPException(
            status_code=422,
            detail="No export snapshot for this application — cannot rebuild PDF.",
        )
    style = str(raw.get("template_style") or "classic").strip() or "classic"
    text = (raw.get("cover_letter") or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="No cover letter text in snapshot")
    try:
        fn = build_cover_letter_pdf(text, template_style=style)
    except Exception:
        logger.exception("Regenerate cover letter PDF failed")
        raise HTTPException(status_code=500, detail="Could not generate cover letter PDF")
    a.cover_letter_pdf_url = fn
    await session.commit()
    await session.refresh(a)
    return ApplicationRegenerateCoverPdfResponse(cover_letter_pdf_url=fn)


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
        tailored_resume_url=new_app.tailored_resume_url or "",
        cover_letter_text=new_app.cover_letter_text or "",
        cover_letter_url=new_app.cover_letter_url or "",
        resume_pdf_url=new_app.resume_pdf_url or "",
        cover_letter_pdf_url=new_app.cover_letter_pdf_url or "",
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

    out = settings.output_dir
    for name in (
        application.tailored_resume_url,
        application.cover_letter_url,
        application.resume_pdf_url,
        application.cover_letter_pdf_url,
    ):
        if name:
            (out / name).unlink(missing_ok=True)

    await session.delete(application)
    await session.commit()
