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
  is_admin?: boolean;
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
  resume_pdf_url: string;
  cover_letter_pdf_url: string;
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
  resume_pdf_url: string;
  cover_letter_pdf_url: string;
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
// §3.5  Job Dashboard & Match Scoring
// ---------------------------------------------------------------------------

export interface DashboardStats {
  total_matches: number;
  average_score: number;
  new_today: number;
  saved_count: number;
  tier_90_plus: number;
  tier_70_89: number;
  tier_50_69: number;
  tier_below_50: number;
}

export interface JobSummary {
  id: string;
  title: string;
  organization: string;
  location: string | null;
  url: string | null;
  source_name: string;
  posted_at: string | null;
}

export interface MatchListItem {
  id: string;
  job: JobSummary;
  overall_score: number;
  skill_match_score: number;
  experience_match_score: number;
  role_fit_score: number;
  strengths: string[];
  status: string;
  created_at: string;
}

export interface PaginatedMatches {
  items: MatchListItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface MatchDetail extends MatchListItem {
  job: JobSummary & { description_text: string };
  match_details: {
    strengths: string[];
    gaps: string[];
    recommendation: string;
  };
}

export interface CrawlStatus {
  id: string;
  status: string;
  jobs_found: number;
  jobs_new: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// §3.6  Job Preferences
// ---------------------------------------------------------------------------

export interface JobPreferences {
  industry: string | null;
  role_categories: string[];
  preferred_locations: string[];
  experience_level: string | null;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// §4  Authentication
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  core_skills: string[];
  is_admin?: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

export interface RegisterResponse {
  id: string;
  full_name: string;
  email: string;
  core_skills: string[];
  is_admin?: boolean;
}

// ---------------------------------------------------------------------------
// REQ-017 Admin crawl sources
// ---------------------------------------------------------------------------

export interface CrawlSource {
  id: string;
  source_key: string;
  display_name: string;
  source_type: "api" | "html_scraper" | "rss";
  url_template: string;
  headers: Record<string, string>;
  rate_limit_seconds: number;
  selectors: Record<string, string>;
  industries: string[];
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CrawlSourceCreatePayload {
  source_key: string;
  display_name: string;
  source_type: "api" | "html_scraper" | "rss";
  url_template: string;
  headers?: Record<string, string>;
  rate_limit_seconds?: number;
  selectors?: Record<string, string>;
  industries?: string[];
  enabled?: boolean;
  sort_order?: number;
}

export interface CrawlSourceUpdatePayload {
  display_name?: string;
  source_type?: "api" | "html_scraper" | "rss";
  url_template?: string;
  headers?: Record<string, string>;
  rate_limit_seconds?: number;
  selectors?: Record<string, string>;
  industries?: string[];
  enabled?: boolean;
  sort_order?: number;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
}

// ---------------------------------------------------------------------------
// Generic API error envelope
// ---------------------------------------------------------------------------

export interface ApiError {
  detail: string;
}
