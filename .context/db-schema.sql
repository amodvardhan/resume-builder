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

-- Migration helper: add resume_id and rename job_description → job_description_html
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL;
-- ALTER TABLE applications RENAME COLUMN job_description TO job_description_html;
