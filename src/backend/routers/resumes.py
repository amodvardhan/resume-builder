"""Resume upload, listing, and deletion routes."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import settings
from src.backend.database import get_session
from src.backend.models import Resume, User
from src.backend.schemas import ResumeActivateResponse, ResumeListItem, ResumeUploadResponse
from src.backend.services.auth_service import get_current_user
from src.backend.services.resume_parser import extract_resume_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["resumes"])

# Stored resumes per user (only one may be active at a time; see is_active).
MAX_RESUMES_PER_USER = 5

_ALLOWED_RESUME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/pdf": "pdf",
    "application/octet-stream": None,
}


@router.post("/resumes/upload", response_model=ResumeUploadResponse, status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    user_id: uuid.UUID = Form(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ResumeUploadResponse:
    effective_user_id = current_user.id

    user = await session.get(User, effective_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    count_row = await session.execute(
        select(func.count())
        .select_from(Resume)
        .where(Resume.user_id == effective_user_id),
    )
    existing = int(count_row.scalar_one() or 0)
    if existing >= MAX_RESUMES_PER_USER:
        raise HTTPException(
            status_code=422,
            detail=(
                f"You can store at most {MAX_RESUMES_PER_USER} resumes. "
                "Delete one before uploading another."
            ),
        )

    filename = file.filename or "resume"
    if filename.lower().endswith(".docx"):
        file_type = "docx"
    elif filename.lower().endswith(".pdf"):
        file_type = "pdf"
    else:
        mapped = _ALLOWED_RESUME_TYPES.get(file.content_type or "")
        if mapped is None:
            raise HTTPException(
                status_code=422, detail="Only .docx and .pdf files are accepted"
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
            status_code=422, detail="Could not extract text from the uploaded file"
        )

    if not extracted_text.strip():
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422, detail="The uploaded file appears to be empty or unreadable"
        )

    await session.execute(
        update(Resume)
        .where(Resume.user_id == effective_user_id, Resume.is_active == True)  # noqa: E712
        .values(is_active=False)
    )

    resume = Resume(
        id=file_id,
        user_id=effective_user_id,
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


@router.get(
    "/users/{user_id}/resumes",
    response_model=list[ResumeListItem],
)
async def list_user_resumes(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
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


@router.patch(
    "/resumes/{resume_id}/activate",
    response_model=ResumeActivateResponse,
)
async def activate_resume(
    resume_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ResumeActivateResponse:
    resume = await session.get(Resume, resume_id)
    if resume is None or resume.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Resume not found")

    await session.execute(
        update(Resume)
        .where(Resume.user_id == current_user.id, Resume.is_active == True)  # noqa: E712
        .values(is_active=False)
    )
    resume.is_active = True
    await session.commit()
    await session.refresh(resume)

    return ResumeActivateResponse(
        resume_id=resume.id,
        original_filename=resume.original_filename,
        is_active=resume.is_active,
    )


@router.delete(
    "/resumes/{resume_id}",
    status_code=204,
    response_model=None,
)
async def delete_resume(
    resume_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    resume = await session.get(Resume, resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    if resume.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Resume not found")

    was_active = resume.is_active
    owner_id = resume.user_id
    file_path = Path(resume.file_path)
    await session.delete(resume)
    await session.flush()

    if was_active:
        nxt = (
            await session.execute(
                select(Resume)
                .where(Resume.user_id == owner_id)
                .order_by(Resume.created_at.desc())
                .limit(1),
            )
        ).scalar_one_or_none()
        if nxt is not None:
            nxt.is_active = True

    await session.commit()
    file_path.unlink(missing_ok=True)
