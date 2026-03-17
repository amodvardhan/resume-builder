"""File download route for generated documents."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from src.backend.config import settings
from src.backend.models import User
from src.backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/files", tags=["files"])


@router.get("/{file_name}")
async def download_file(
    file_name: str,
    current_user: User = Depends(get_current_user),
) -> FileResponse:
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
