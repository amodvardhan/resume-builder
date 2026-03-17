-- Resume Builder Database Schema
-- Derived from architecture-global.md and requirements.md
-- Version 2.0.0

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name     VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    core_skills   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE templates (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255) NOT NULL,
    file_path     VARCHAR(1024) NOT NULL,
    is_master     BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE resumes (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_filename VARCHAR(512) NOT NULL,
    file_path         VARCHAR(1024) NOT NULL,
    file_type         VARCHAR(10) NOT NULL CHECK (file_type IN ('docx', 'pdf')),
    extracted_text    TEXT NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE applications (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id                UUID REFERENCES resumes(id) ON DELETE SET NULL,
    template_id              UUID NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
    job_title                VARCHAR(255) NOT NULL,
    organization             VARCHAR(255) NOT NULL,
    job_description_html     TEXT NOT NULL,
    cover_letter_sentiment   VARCHAR(100),
    tailored_resume_url      VARCHAR(1024),
    cover_letter_text        TEXT,
    reference_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_resumes_active ON resumes(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_applications_user_id ON applications(user_id);
CREATE INDEX idx_applications_template_id ON applications(template_id);
CREATE INDEX idx_applications_resume_id ON applications(resume_id);
CREATE INDEX idx_applications_reference_id ON applications(reference_application_id);

-- v3.0: Add password_hash to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- v3.0: Job preferences (one row per user)
CREATE TABLE IF NOT EXISTS job_preferences (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    industry          VARCHAR(255),
    role_categories   JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
    experience_level  VARCHAR(100),
    keywords          JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_preferences_user_id ON job_preferences(user_id);

-- v3.0: Crawled jobs (deduplicated by source_name + external_id)
CREATE TABLE IF NOT EXISTS crawled_jobs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_name       VARCHAR(255) NOT NULL,
    external_id       VARCHAR(1024) NOT NULL,
    title             VARCHAR(512) NOT NULL,
    organization      VARCHAR(512),
    location          VARCHAR(512),
    description_html  TEXT,
    description_text  TEXT NOT NULL,
    url               VARCHAR(2048),
    salary_range      VARCHAR(255),
    posted_at         TIMESTAMP WITH TIME ZONE,
    scraped_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    industry          VARCHAR(255),
    role_category     VARCHAR(255),
    raw_data          JSONB,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT uq_crawled_jobs_source_external UNIQUE (source_name, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crawled_jobs_industry_role ON crawled_jobs(industry, role_category);
CREATE INDEX IF NOT EXISTS idx_crawled_jobs_scraped_at ON crawled_jobs(scraped_at DESC);

-- v3.0: Crawl run audit trail
CREATE TABLE IF NOT EXISTS crawl_runs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status            VARCHAR(50) NOT NULL DEFAULT 'running',
    jobs_found        INTEGER NOT NULL DEFAULT 0,
    jobs_new          INTEGER NOT NULL DEFAULT 0,
    started_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    finished_at       TIMESTAMP WITH TIME ZONE,
    error_message     TEXT,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_user_id ON crawl_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_started_at ON crawl_runs(user_id, started_at DESC);

-- v3.0: Job match scores
CREATE TABLE IF NOT EXISTS job_matches (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id                 UUID NOT NULL REFERENCES crawled_jobs(id) ON DELETE CASCADE,
    overall_score          DOUBLE PRECISION NOT NULL DEFAULT 0,
    skill_match_score      DOUBLE PRECISION NOT NULL DEFAULT 0,
    experience_match_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    role_fit_score         DOUBLE PRECISION NOT NULL DEFAULT 0,
    match_details          JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                 VARCHAR(50) NOT NULL DEFAULT 'new',
    created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT uq_job_matches_user_job UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_matches_user_id ON job_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_score ON job_matches(user_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_job_matches_status ON job_matches(user_id, status);

-- Migration helper: add resume_id and rename job_description → job_description_html
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL;
-- ALTER TABLE applications RENAME COLUMN job_description TO job_description_html;

-- REQ-017: Admin crawl sources
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS job_crawl_sources (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_key           VARCHAR(128) NOT NULL UNIQUE,
    display_name         VARCHAR(255) NOT NULL,
    source_type          VARCHAR(32) NOT NULL,
    url_template         TEXT NOT NULL,
    headers              JSONB NOT NULL DEFAULT '{}'::jsonb,
    rate_limit_seconds   DOUBLE PRECISION NOT NULL DEFAULT 2,
    selectors            JSONB NOT NULL DEFAULT '{}'::jsonb,
    industries           JSONB NOT NULL DEFAULT '[]'::jsonb,
    enabled              BOOLEAN NOT NULL DEFAULT true,
    sort_order           INTEGER NOT NULL DEFAULT 0,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_crawl_sources_enabled ON job_crawl_sources(enabled);
