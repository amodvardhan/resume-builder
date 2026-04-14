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
  /** True when a headshot is stored — used in resume preview and exports */
  has_profile_photo?: boolean;
  phone?: string | null;
  country?: string | null;
  linkedin_url?: string | null;
}

/** Identity lines for resume sidebar / header (matches backend export order). */
export interface ResumeContactInfo {
  full_name?: string;
  email?: string;
  phone?: string;
  country?: string;
  linkedin_url?: string;
}

export function pickResumeContact(
  p: UserProfile | null | undefined,
): ResumeContactInfo | null {
  if (!p) return null;
  const full_name = (p.full_name || "").trim();
  const email = (p.email || "").trim();
  const phone = (p.phone || "").trim();
  const country = (p.country || "").trim();
  const linkedin_url = (p.linkedin_url || "").trim();
  if (!full_name && !email && !phone && !country && !linkedin_url) return null;
  return {
    ...(full_name ? { full_name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(country ? { country } : {}),
    ...(linkedin_url ? { linkedin_url } : {}),
  };
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
  phone?: string | null;
  country?: string | null;
  linkedin_url?: string | null;
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

export interface ResumeActivateResponse {
  resume_id: string;
  original_filename: string;
  is_active: boolean;
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
  /** Links the saved application to a dashboard match (from Compose prefill). */
  job_match_id?: string | null;
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
  cover_letter_url?: string;
  resume_pdf_url?: string;
  cover_letter_pdf_url?: string;
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
  /** Word cover letter filename in output store */
  cover_letter_url?: string | null;
  resume_pdf_url?: string | null;
  cover_letter_pdf_url?: string | null;
  cover_letter_text: string | null;
  reference_application_id: string | null;
  /** Dashboard job match when Compose was started from a match card. */
  job_match_id?: string | null;
  created_at: string;
  /** True when a draft snapshot exists so the API can rebuild PDFs (same as post-confirm). */
  export_snapshot_present?: boolean;
}

export interface ApplicationRegenerateResumePdfResponse {
  resume_pdf_url: string;
}

export interface ApplicationRegenerateCoverLetterPdfResponse {
  cover_letter_pdf_url: string;
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
  integrations_configured: Record<string, boolean>;
}

export interface JobSummary {
  id: string;
  title: string;
  organization: string;
  location: string | null;
  url: string | null;
  source_name: string;
  provider?: string;
  posted_at: string | null;
  description_text?: string;
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
  /** Private CRM notes for this opportunity */
  notes?: string | null;
  /** ISO 8601 — reminder / next follow-up */
  next_follow_up_at?: string | null;
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

export interface JobPostingEnrichment {
  status: "none" | "fetched" | "skipped_substantial" | "failed";
  message?: string | null;
}

export interface JobListingWithScore {
  id: string;
  provider: string;
  source_name: string;
  title: string;
  organization: string | null;
  location: string | null;
  url: string | null;
  salary_range: string | null;
  posted_at: string | null;
  /** Application deadline when known (e.g. schema.org validThrough after fetch). */
  application_closes_at: string | null;
  industry: string | null;
  role_category: string | null;
  created_at: string;
  match_id: string | null;
  overall_score: number | null;
  description_html: string | null;
  description_text: string;
  /** Present after POST /jobs/listings/:id/fetch-posting (full JD from posting URL). */
  posting_enrichment?: JobPostingEnrichment | null;
}

/** Pre-fills Create Application job fields (e.g. from Latest search jobs). */
export interface ComposeJobPrefill {
  job_title: string;
  organization: string;
  job_description_html: string;
  /** When set (from a match card), tailor confirm persists `job_match_id` on the Application. */
  match_id?: string;
}

export interface JobListingWithScoreList {
  items: JobListingWithScore[];
  total: number;
  page: number;
  page_size: number;
}

export interface JobSyncStatus {
  id: string;
  status: string;
  jobs_found: number;
  jobs_new: number;
  /** Provider id (e.g. adzuna, jooble) → count after keyword filter on last completed run. */
  sources_breakdown: Record<string, number> | null;
  /** JobMatch rows created when AI ran after this sync. */
  matches_created: number;
  /** Whether server has API credentials for each integration (empty = source is skipped). */
  integrations_configured: Record<string, boolean>;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface JobSyncTriggerResponse {
  message: string;
  status: string;
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
  /** ISO 3166-1 alpha-2; scopes Adzuna + Jooble job search when set */
  target_country_codes: string[];
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
