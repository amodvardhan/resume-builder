"""
Job match scoring — LangChain-powered comparison of resumes against crawled jobs.

Responsibilities:
  1. Score a candidate's resume against a single job description (skill, experience, role fit).
  2. Batch-score all unscored crawled jobs for a user after a crawl completes.
  3. Persist JobMatch rows with ON CONFLICT DO NOTHING for race-condition safety.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import settings
from src.backend.database import async_session_factory
from src.backend.models import CrawledJob, JobMatch, JobPreference, Resume, User

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic output model
# ---------------------------------------------------------------------------


class JobMatchScore(BaseModel):
    overall_score: float = Field(ge=0, le=100, description="Weighted average: 40% skill + 30% experience + 30% role fit")
    skill_match_score: float = Field(ge=0, le=100, description="How well the candidate's skills match the job requirements")
    experience_match_score: float = Field(ge=0, le=100, description="How well the candidate's experience level and domain match")
    role_fit_score: float = Field(ge=0, le=100, description="How well the candidate fits the overall role expectations and culture")
    strengths: list[str] = Field(description="Concrete matched qualifications, skills, or experiences that align with the job")
    gaps: list[str] = Field(description="Missing skills, experience, or qualifications the candidate lacks for this role")
    recommendation: str = Field(description="A 2-3 sentence recommendation summarising fit and suggested next steps")


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

_MATCH_SYSTEM = (
    "You are a career match analyst with deep expertise in talent assessment and "
    "job-candidate alignment. Your task is to objectively compare a candidate's "
    "resume and skills against a job description and produce a structured match "
    "score.\n\n"
    "═══════════════════════════════════════════════════\n"
    "CANDIDATE PROFILE\n"
    "═══════════════════════════════════════════════════\n"
    "Core skills: {core_skills}\n\n"
    "Resume:\n"
    "--- BEGIN CANDIDATE RESUME ---\n"
    "{resume_text}\n"
    "--- END CANDIDATE RESUME ---\n\n"
    "═══════════════════════════════════════════════════\n"
    "SCORING DIMENSIONS\n"
    "═══════════════════════════════════════════════════\n"
    "Score each dimension from 0 to 100:\n\n"
    "1. **Skill Match (40% weight)**: Compare the candidate's technical and soft "
    "skills against those required or preferred in the JD. Award higher scores when "
    "the candidate possesses critical must-have skills. Partially credit transferable "
    "skills.\n\n"
    "2. **Experience Match (30% weight)**: Evaluate whether the candidate's years of "
    "experience, seniority level, industry background, and domain expertise align "
    "with the role's requirements. Consider both depth and breadth.\n\n"
    "3. **Role Fit (30% weight)**: Assess overall alignment including responsibilities, "
    "work context, leadership scope, and any stated cultural or organisational fit "
    "indicators.\n\n"
    "4. **Overall Score**: Compute as: 0.4 × skill_match_score + 0.3 × "
    "experience_match_score + 0.3 × role_fit_score. Round to one decimal place.\n\n"
    "═══════════════════════════════════════════════════\n"
    "ADDITIONAL OUTPUTS\n"
    "═══════════════════════════════════════════════════\n"
    "- **strengths**: List 3-6 concrete, specific qualifications the candidate "
    "possesses that directly match the JD requirements. Be factual — reference "
    "actual skills, roles, or achievements from the resume.\n"
    "- **gaps**: List 1-5 specific skills, certifications, or experience areas "
    "the JD requires that the candidate lacks or is weak in. If the candidate is "
    "an excellent match, this list may be short.\n"
    "- **recommendation**: Write 2-3 sentences summarising the candidate's fit. "
    "State whether this is a strong, moderate, or weak match and briefly explain "
    "why. Mention the most important strength and the most critical gap.\n\n"
    "Be precise and analytical. Do not inflate scores. A score of 70+ means a "
    "genuinely strong match on that dimension.\n\n"
    "{format_instructions}"
)

_MATCH_HUMAN = "Job description:\n{job_description}"


# ---------------------------------------------------------------------------
# Single-job scoring
# ---------------------------------------------------------------------------


async def score_single_match(
    resume_text: str,
    core_skills: list[str],
    job_description: str,
) -> JobMatchScore:
    """Score a single resume against a single job description using LangChain."""
    parser = PydanticOutputParser(pydantic_object=JobMatchScore)

    prompt = ChatPromptTemplate.from_messages([
        ("system", _MATCH_SYSTEM),
        ("human", _MATCH_HUMAN),
    ])

    llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0.3,
        max_tokens=1024,
        api_key=settings.openai_api_key,
    )

    chain = prompt | llm | parser

    result: JobMatchScore = await chain.ainvoke({
        "core_skills": ", ".join(core_skills) if core_skills else "Not specified",
        "resume_text": resume_text,
        "format_instructions": parser.get_format_instructions(),
        "job_description": job_description,
    })

    return result


# ---------------------------------------------------------------------------
# Helper: score one job under semaphore
# ---------------------------------------------------------------------------


async def _score_one(
    sem: asyncio.Semaphore,
    resume_text: str,
    core_skills: list[str],
    job: CrawledJob,
    user_id: uuid.UUID,
    session: AsyncSession,
) -> JobMatch | None:
    """Acquire the semaphore, score one job, and return a JobMatch (or None on failure)."""
    async with sem:
        try:
            score = await score_single_match(
                resume_text=resume_text,
                core_skills=core_skills,
                job_description=job.description_text,
            )

            match = JobMatch(
                user_id=user_id,
                job_id=job.id,
                overall_score=score.overall_score,
                skill_match_score=score.skill_match_score,
                experience_match_score=score.experience_match_score,
                role_fit_score=score.role_fit_score,
                match_details={
                    "strengths": score.strengths,
                    "gaps": score.gaps,
                    "recommendation": score.recommendation,
                },
                status="new",
            )
            return match

        except Exception:
            logger.exception(
                "Failed to score job %s (%s) for user %s",
                job.id,
                job.title,
                user_id,
            )
            return None


# ---------------------------------------------------------------------------
# Batch scoring
# ---------------------------------------------------------------------------


async def score_new_matches(user_id: uuid.UUID) -> int:
    """Score all unscored crawled jobs for a user. Returns the count of new matches created."""
    async with async_session_factory() as session:
        # 1. Load the user's latest active resume
        resume_row = (
            await session.execute(
                select(Resume)
                .where(Resume.user_id == user_id, Resume.is_active.is_(True))
                .order_by(Resume.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if resume_row is None:
            logger.warning("User %s has no active resume — skipping match scoring", user_id)
            return 0

        resume_text: str = resume_row.extracted_text

        # 2. Load the user's core_skills
        user_row = (
            await session.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()

        if user_row is None:
            logger.warning("User %s not found — skipping match scoring", user_id)
            return 0

        core_skills: list[str] = user_row.core_skills if isinstance(user_row.core_skills, list) else []

        # 3. Load the user's job preferences (industry + role_categories)
        pref_row = (
            await session.execute(
                select(JobPreference).where(JobPreference.user_id == user_id)
            )
        ).scalar_one_or_none()

        # 4. Build the query for unscored CrawledJob rows
        already_scored_subq = (
            select(JobMatch.job_id)
            .where(JobMatch.user_id == user_id)
            .subquery()
        )

        jobs_query = (
            select(CrawledJob)
            .where(CrawledJob.id.notin_(select(already_scored_subq.c.job_id)))
        )

        if pref_row is not None:
            filters: list[Any] = []
            if pref_row.industry:
                filters.append(CrawledJob.industry == pref_row.industry)
            role_cats: list[str] = (
                pref_row.role_categories
                if isinstance(pref_row.role_categories, list)
                else []
            )
            if role_cats:
                filters.append(CrawledJob.role_category.in_(role_cats))
            if filters:
                jobs_query = jobs_query.where(*filters)

        unscored_jobs: list[CrawledJob] = list(
            (await session.execute(jobs_query)).scalars().all()
        )

        if not unscored_jobs:
            logger.info("No unscored jobs found for user %s", user_id)
            return 0

        logger.info(
            "Scoring %d unscored jobs for user %s",
            len(unscored_jobs),
            user_id,
        )

        # 5. Score concurrently with semaphore
        sem = asyncio.Semaphore(5)
        tasks = [
            _score_one(sem, resume_text, core_skills, job, user_id, session)
            for job in unscored_jobs
        ]
        results = await asyncio.gather(*tasks)

        # 6. Insert matches with ON CONFLICT DO NOTHING
        matches = [m for m in results if m is not None]
        inserted_count = 0

        for match in matches:
            stmt = (
                pg_insert(JobMatch.__table__)
                .values(
                    id=match.id,
                    user_id=match.user_id,
                    job_id=match.job_id,
                    overall_score=match.overall_score,
                    skill_match_score=match.skill_match_score,
                    experience_match_score=match.experience_match_score,
                    role_fit_score=match.role_fit_score,
                    match_details=match.match_details,
                    status=match.status,
                )
                .on_conflict_do_nothing(constraint="uq_job_matches_user_job")
            )
            result = await session.execute(stmt)
            if result.rowcount:
                inserted_count += 1

        await session.commit()

        logger.info(
            "Inserted %d new job matches for user %s (%d failed or duplicate)",
            inserted_count,
            user_id,
            len(unscored_jobs) - inserted_count,
        )

        return inserted_count
