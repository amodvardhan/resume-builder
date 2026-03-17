/**
 * TypeScript contracts mapping 1:1 to the API defined in
 * .context/architecture-global.md §3.
 *
 * Every interface mirrors a FastAPI Pydantic schema from
 * src/backend/main.py — field names use the exact JSON keys
 * returned/accepted by the backend.
 */

// ---------------------------------------------------------------------------
// §3.1  User & Profile Management
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  core_skills: string[];
}

export interface UserCreatePayload {
  full_name: string;
  email: string;
  core_skills: string[];
}

export interface UserUpdatePayload {
  full_name?: string;
  email?: string;
  core_skills?: string[];
}

// ---------------------------------------------------------------------------
// §3.2  Template Management
// ---------------------------------------------------------------------------

export interface TemplateUploadPayload {
  file: File;
  name: string;
  is_master: boolean;
}

export interface TemplateUploadResponse {
  template_id: string;
  name: string;
  file_path: string;
}

// ---------------------------------------------------------------------------
// §3.3  Resume Upload & Parsing
// ---------------------------------------------------------------------------

export interface ResumeUploadResponse {
  resume_id: string;
  original_filename: string;
  file_type: "docx" | "pdf";
  extracted_text_preview: string;
  created_at: string;
}

export interface ResumeListItem {
  resume_id: string;
  original_filename: string;
  file_type: "docx" | "pdf";
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// §3.4  The Tailoring Engine
// ---------------------------------------------------------------------------

export interface TailorRequest {
  user_id: string;
  resume_id: string;
  template_id?: string | null;
  template_style?: string;
  job_title: string;
  organization: string;
  job_description_html: string;
  cover_letter_sentiment?: string;
}

export interface TailorResponse {
  application_id: string;
  tailored_resume_url: string;
  cover_letter_text: string;
  cover_letter_url: string;
}

// Human-in-the-loop: Preview → Review → Confirm

export interface TailorPreviewRequest {
  user_id: string;
  resume_id: string;
  template_id?: string | null;
  template_style?: string;
  job_title: string;
  organization: string;
  job_description_html: string;
  cover_letter_sentiment?: string;
}

export interface TailorPreviewResponse {
  summary: string;
  experiences: string[];
  skills: string;
  education: string;
  certifications: string;
  cover_letter: string;
  original_resume_text: string;
  [key: string]: string | string[];
}

export interface TailorConfirmRequest {
  user_id: string;
  resume_id: string;
  template_id?: string | null;
  template_style?: string;
  job_title: string;
  organization: string;
  job_description_html: string;
  cover_letter_sentiment?: string;
  summary: string;
  experiences: string[];
  skills: string;
  education: string;
  certifications: string;
  cover_letter: string;
}

export interface TailorConfirmResponse {
  application_id: string;
  tailored_resume_url: string;
  cover_letter_text: string;
  cover_letter_url: string;
}

// Per-section regeneration

export interface RegenerateSectionRequest {
  user_id: string;
  resume_id: string;
  section_id: string;
  current_content: string;
  job_title: string;
  organization: string;
  job_description_html: string;
  cover_letter_sentiment?: string;
  user_instruction?: string;
}

export interface RegenerateSectionResponse {
  section_id: string;
  content: string;
}

// ---------------------------------------------------------------------------
// §3.4  The Reference Engine (History Cloning)
// ---------------------------------------------------------------------------

export interface CloneRequest {
  new_job_title: string;
  new_organization: string;
  new_job_description_html: string;
}

export interface CloneResponse {
  new_application_id: string;
  tailored_resume_url: string;
  cover_letter_text: string;
}

// ---------------------------------------------------------------------------
// Application (history / sidebar)
// Mirrors the SQLAlchemy Application model; used by the history sidebar
// (REQ-004) and the Reference Engine detail view.
// ---------------------------------------------------------------------------

export interface Application {
  id: string;
  user_id: string;
  resume_id: string | null;
  template_id: string | null;
  job_title: string;
  organization: string;
  job_description_html: string;
  cover_letter_sentiment: string | null;
  tailored_resume_url: string | null;
  cover_letter_text: string | null;
  reference_application_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Generic API error envelope
// ---------------------------------------------------------------------------

export interface ApiError {
  detail: string;
}
