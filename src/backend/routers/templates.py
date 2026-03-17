"""Template management routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import settings
from src.backend.database import get_session
from src.backend.models import Template, User
from src.backend.schemas import TemplateResponse
from src.backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])


@router.post("/upload", response_model=TemplateResponse, status_code=201)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    is_master: bool = Form(False),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TemplateResponse:
    if file.content_type not in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    ):
        raise HTTPException(status_code=422, detail="Only .docx files are accepted")

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
