"""
FastAPI application — routers map 1:1 to the API contract in
.context/architecture-global.md §3.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import settings
from src.backend.database import Base, engine, get_session
from src.backend.models import Application, Resume, Template, User
from src.backend.services.history_service import clone_application
from src.backend.services.resume_parser import (
    extract_resume_text,
    html_to_plain_text,
)
from src.backend.services.tailor_engine import (
    finalize_document,
    generate_draft,
    regenerate_section,
    tailor_resume,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Resume Builder", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with engine.begin() as conn:
        # Migration: rename job_description → job_description_html
        old_col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'applications' AND column_name = 'job_description'"
        ))
        if old_col.scalar() is not None:
            await conn.execute(text(
                "ALTER TABLE applications "
                "RENAME COLUMN job_description TO job_description_html"
            ))
            logger.info("Migrated: renamed job_description → job_description_html")

        # Migration: add resume_id column
        col_exists = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'applications' AND column_name = 'resume_id'"
        ))
        if col_exists.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE applications "
                "ADD COLUMN resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL"
            ))
            logger.info("Migrated: added resume_id column to applications table")

        # Migration: add reference_application_id column
        ref_col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'applications' AND column_name = 'reference_application_id'"
        ))
        if ref_col.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE applications "
                "ADD COLUMN reference_application_id UUID "
                "REFERENCES applications(id) ON DELETE SET NULL"
            ))
            logger.info("Migrated: added reference_application_id column to applications table")

        # Migration: make template_id nullable (template is optional when using gallery styles)
        try:
            await conn.execute(text(
                "ALTER TABLE applications ALTER COLUMN template_id DROP NOT NULL"
            ))
            logger.info("Migrated: made template_id nullable on applications table")
        except Exception:
            pass

    # One-time re-parse: refresh extracted_text for all resumes whose stored
    # text was produced by an older parser that missed SDT/form-field content.
    async with AsyncSession(engine) as session:
        result = await session.execute(select(Resume))
        resumes = result.scalars().all()
        refreshed = 0
        for resume in resumes:
            fp = Path(resume.file_path)
            if not fp.exists():
                continue
            try:
                fresh_text = extract_resume_text(fp, resume.file_type)
            except Exception:
                logger.warning("Re-parse failed for %s, skipping", resume.id)
                continue
            if fresh_text and len(fresh_text) > len(resume.extracted_text or ""):
                resume.extracted_text = fresh_text
                refreshed += 1
        if refreshed:
            await session.commit()
            logger.info("Re-parsed %d resume(s) with improved parser", refreshed)


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------


class UserCreateRequest(BaseModel):
    full_name: str
    email: EmailStr
    core_skills: list[str] = []


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    core_skills: list[str] | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    core_skills: list[str]


class ResumeUploadResponse(BaseModel):
    resume_id: uuid.UUID
    original_filename: str
    file_type: str
    extracted_text_preview: str
    created_at: str


class ResumeListItem(BaseModel):
    resume_id: uuid.UUID
    original_filename: str
    file_type: str
    is_active: bool
    created_at: str


class ApplicationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    resume_id: uuid.UUID | None
    template_id: uuid.UUID | None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None
    tailored_resume_url: str | None
    cover_letter_text: str | None
    reference_application_id: uuid.UUID | None
    created_at: str


class TemplateResponse(BaseModel):
    template_id: uuid.UUID
    name: str
    file_path: str


class TailorRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    template_id: uuid.UUID | None = None
    template_style: str | None = None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None


class TailorResponse(BaseModel):
    application_id: uuid.UUID
    tailored_resume_url: str
    cover_letter_text: str
    cover_letter_url: str = ""
    resume_pdf_url: str = ""
    cover_letter_pdf_url: str = ""


class TailorPreviewRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    template_id: uuid.UUID | None = None
    template_style: str | None = None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None


class TailorPreviewResponse(BaseModel):
    summary: str
    experiences: list[str]
    skills: str
    education: str
    certifications: str = ""
    cover_letter: str
    original_resume_text: str = ""


class TailorConfirmRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    template_id: uuid.UUID | None = None
    template_style: str | None = None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None
    summary: str
    experiences: list[str]
    skills: str
    education: str
    certifications: str = ""
    cover_letter: str


class TailorConfirmResponse(BaseModel):
    application_id: uuid.UUID
    tailored_resume_url: str
    cover_letter_text: str
    cover_letter_url: str = ""
    resume_pdf_url: str = ""
    cover_letter_pdf_url: str = ""


class RegenerateSectionRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    section_id: str
    current_content: str
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None
    user_instruction: str | None = None


class RegenerateSectionResponse(BaseModel):
    section_id: str
    content: str


class CloneRequest(BaseModel):
    new_job_title: str
    new_organization: str
    new_job_description_html: str


class CloneResponse(BaseModel):
    new_application_id: uuid.UUID
    tailored_resume_url: str
    cover_letter_text: str


# ---------------------------------------------------------------------------
# 3.1  User & Profile Management
# ---------------------------------------------------------------------------


@app.post("/api/v1/users", response_model=UserResponse, status_code=201)
async def create_user(
    payload: UserCreateRequest,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    user = User(
        id=uuid.uuid4(),
        full_name=payload.full_name,
        email=payload.email,
        core_skills=payload.core_skills,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        core_skills=user.core_skills if isinstance(user.core_skills, list) else [],
    )


@app.get("/api/v1/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    core_skills = user.core_skills if isinstance(user.core_skills, list) else []
    return UserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        core_skills=core_skills,
    )


@app.patch("/api/v1/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email
    if payload.core_skills is not None:
        user.core_skills = payload.core_skills
    await session.commit()
    await session.refresh(user)
    core_skills = user.core_skills if isinstance(user.core_skills, list) else []
    return UserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        core_skills=core_skills,
    )


# ---------------------------------------------------------------------------
# 3.2  Template Management
# ---------------------------------------------------------------------------


@app.post(
    "/api/v1/templates/upload",
    response_model=TemplateResponse,
    status_code=201,
)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    is_master: bool = Form(False),
    session: AsyncSession = Depends(get_session),
) -> TemplateResponse:
    if file.content_type not in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    ):
        raise HTTPException(
            status_code=422,
            detail="Only .docx files are accepted",
        )

    settings.templates_dir.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    dest = settings.templates_dir / f"{file_id}.docx"

    contents = await file.read()
    dest.write_bytes(contents)

    template = Template(
        id=file_id,
        name=name,
        file_path=str(dest),
        is_master=is_master,
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)

    return TemplateResponse(
        template_id=template.id,
        name=template.name,
        file_path=template.file_path,
    )


# ---------------------------------------------------------------------------
# 3.3  Resume Upload & Parsing
# ---------------------------------------------------------------------------

_ALLOWED_RESUME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/pdf": "pdf",
    "application/octet-stream": None,
}


@app.post(
    "/api/v1/resumes/upload",
    response_model=ResumeUploadResponse,
    status_code=201,
)
async def upload_resume(
    file: UploadFile = File(...),
    user_id: uuid.UUID = Form(...),
    session: AsyncSession = Depends(get_session),
) -> ResumeUploadResponse:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    filename = file.filename or "resume"
    if filename.lower().endswith(".docx"):
        file_type = "docx"
    elif filename.lower().endswith(".pdf"):
        file_type = "pdf"
    else:
        mapped = _ALLOWED_RESUME_TYPES.get(file.content_type or "")
        if mapped is None:
            raise HTTPException(
                status_code=422,
                detail="Only .docx and .pdf files are accepted",
            )
        file_type = mapped

    settings.resumes_dir.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    ext = "docx" if file_type == "docx" else "pdf"
    dest = settings.resumes_dir / f"{file_id}.{ext}"

    contents = await file.read()
    dest.write_bytes(contents)

    try:
        extracted_text = extract_resume_text(dest, file_type)
    except Exception:
        dest.unlink(missing_ok=True)
        logger.exception("Failed to extract text from resume")
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from the uploaded file",
        )

    if not extracted_text.strip():
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail="The uploaded file appears to be empty or unreadable",
        )

    # Deactivate previous active resumes for this user
    await session.execute(
        update(Resume)
        .where(Resume.user_id == user_id, Resume.is_active == True)  # noqa: E712
        .values(is_active=False)
    )

    resume = Resume(
        id=file_id,
        user_id=user_id,
        original_filename=filename,
        file_path=str(dest),
        file_type=file_type,
        extracted_text=extracted_text,
        is_active=True,
    )
    session.add(resume)
    await session.commit()
    await session.refresh(resume)

    return ResumeUploadResponse(
        resume_id=resume.id,
        original_filename=resume.original_filename,
        file_type=resume.file_type,
        extracted_text_preview=extracted_text[:500],
        created_at=resume.created_at.isoformat(),
    )


@app.get(
    "/api/v1/users/{user_id}/resumes",
    response_model=list[ResumeListItem],
)
async def list_user_resumes(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[ResumeListItem]:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    result = await session.execute(
        select(Resume)
        .where(Resume.user_id == user_id)
        .order_by(Resume.created_at.desc())
    )
    resumes = result.scalars().all()
    return [
        ResumeListItem(
            resume_id=r.id,
            original_filename=r.original_filename,
            file_type=r.file_type,
            is_active=r.is_active,
            created_at=r.created_at.isoformat(),
        )
        for r in resumes
    ]


@app.delete("/api/v1/resumes/{resume_id}", status_code=204)
async def delete_resume(
    resume_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    resume = await session.get(Resume, resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    file_path = Path(resume.file_path)
    await session.delete(resume)
    await session.commit()
    file_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# 3.4  The Tailoring Engine
# ---------------------------------------------------------------------------


@app.post("/api/v1/applications/tailor", response_model=TailorResponse)
async def tailor(
    payload: TailorRequest,
    session: AsyncSession = Depends(get_session),
) -> TailorResponse:
    user = await session.get(User, payload.user_id)
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
        raise HTTPException(
            status_code=500,
            detail="Tailoring engine encountered an error",
        )

    application = Application(
        id=uuid.uuid4(),
        user_id=payload.user_id,
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
# 3.4b  Human-in-the-Loop: Preview → Review → Confirm
# ---------------------------------------------------------------------------


@app.post(
    "/api/v1/applications/tailor/preview",
    response_model=TailorPreviewResponse,
)
async def tailor_preview(
    payload: TailorPreviewRequest,
    session: AsyncSession = Depends(get_session),
) -> TailorPreviewResponse:
    """Phase 1: run LLM chains and return editable draft content."""
    user = await session.get(User, payload.user_id)
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
        raise HTTPException(
            status_code=500,
            detail="AI draft generation encountered an error",
        )

    return TailorPreviewResponse(**draft)


@app.post(
    "/api/v1/applications/tailor/confirm",
    response_model=TailorConfirmResponse,
)
async def tailor_confirm(
    payload: TailorConfirmRequest,
    session: AsyncSession = Depends(get_session),
) -> TailorConfirmResponse:
    """Phase 2: accept user-edited content, generate docx, persist application."""
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
        raise HTTPException(
            status_code=500,
            detail="Document generation encountered an error",
        )

    application = Application(
        id=uuid.uuid4(),
        user_id=payload.user_id,
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


@app.post(
    "/api/v1/applications/tailor/regenerate-section",
    response_model=RegenerateSectionResponse,
)
async def tailor_regenerate_section(
    payload: RegenerateSectionRequest,
    session: AsyncSession = Depends(get_session),
) -> RegenerateSectionResponse:
    """Regenerate a single section of the resume or cover letter."""
    user = await session.get(User, payload.user_id)
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
        raise HTTPException(
            status_code=500,
            detail="Section regeneration encountered an error",
        )

    return RegenerateSectionResponse(
        section_id=payload.section_id,
        content=new_content,
    )


# ---------------------------------------------------------------------------
# 3.5  The Reference Engine (History & Cloning)
# ---------------------------------------------------------------------------


@app.get(
    "/api/v1/users/{user_id}/applications",
    response_model=list[ApplicationResponse],
)
async def list_user_applications(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
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
            id=app.id,
            user_id=app.user_id,
            resume_id=app.resume_id,
            template_id=app.template_id,
            job_title=app.job_title,
            organization=app.organization,
            job_description_html=app.job_description_html,
            cover_letter_sentiment=app.cover_letter_sentiment,
            tailored_resume_url=app.tailored_resume_url,
            cover_letter_text=app.cover_letter_text,
            reference_application_id=app.reference_application_id,
            created_at=app.created_at.isoformat(),
        )
        for app in applications
    ]


@app.get(
    "/api/v1/applications/{application_id}",
    response_model=ApplicationResponse,
)
async def get_application(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ApplicationResponse:
    app = await session.get(Application, application_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return ApplicationResponse(
        id=app.id,
        user_id=app.user_id,
        resume_id=app.resume_id,
        template_id=app.template_id,
        job_title=app.job_title,
        organization=app.organization,
        job_description_html=app.job_description_html,
        cover_letter_sentiment=app.cover_letter_sentiment,
        tailored_resume_url=app.tailored_resume_url,
        cover_letter_text=app.cover_letter_text,
        reference_application_id=app.reference_application_id,
        created_at=app.created_at.isoformat(),
    )


@app.post(
    "/api/v1/applications/{application_id}/clone",
    response_model=CloneResponse,
)
async def clone(
    application_id: uuid.UUID,
    payload: CloneRequest,
    session: AsyncSession = Depends(get_session),
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
        raise HTTPException(
            status_code=500,
            detail="Clone operation encountered an error",
        )

    return CloneResponse(
        new_application_id=new_app.id,
        tailored_resume_url=new_app.tailored_resume_url,  # type: ignore[arg-type]
        cover_letter_text=new_app.cover_letter_text,  # type: ignore[arg-type]
    )


@app.delete("/api/v1/applications/{application_id}", status_code=204)
async def delete_application(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    application = await session.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    if application.tailored_resume_url:
        output_file = settings.output_dir / application.tailored_resume_url
        output_file.unlink(missing_ok=True)

    await session.delete(application)
    await session.commit()


# ---------------------------------------------------------------------------
# Utility: download generated files (docx or PDF)
# ---------------------------------------------------------------------------


@app.get("/api/v1/files/{file_name}")
async def download_file(file_name: str) -> FileResponse:
    """Serve a pre-generated file (.pdf or .docx) from the output directory."""
    file_path = settings.output_dir / file_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=file_name,
        )

    return FileResponse(
        path=str(file_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=file_name,
    )
