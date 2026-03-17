# Global Architecture & API Contract
**Owner:** Technical Architect
**Project:** Resume Builder (Meridian)
**Version:** 3.0.0
**Stack:** React-Query (Frontend) → FastAPI (Backend) → PostgreSQL (Database) → APScheduler (Scheduler)

## 1. System Context
Meridian is an AI-powered career platform that (a) tailors resumes/cover letters to specific job descriptions and (b) proactively discovers and matches relevant job opportunities to the user's profile. The platform combines document generation with intelligent job discovery, creating a closed loop: **discover jobs → assess fit → tailor application → track history**.

### Core Components:
1.  **Frontend (UI Layer):** React application using React-Query for server state, React-Router for navigation, and AuthContext for JWT session management.
2.  **Backend (Service Layer):** FastAPI application orchestrating PostgreSQL queries, document parsing (`python-docx`, `pdfplumber`), LLM interactions (`LangChain`), and job crawling (`httpx` + `BeautifulSoup`).
3.  **Database (Data Layer):** PostgreSQL storing user profiles, credentials, job preferences, crawled jobs, match scores, uploaded resumes, template metadata, and application history.
4.  **Scheduler (Background Layer):** APScheduler `AsyncIOScheduler` running configurable cron jobs for periodic job crawling and batch match scoring.
5.  **Auth Layer:** JWT-based authentication (HS256) with access/refresh token pair, enforced on all non-public endpoints.

## 2. Architectural Principles & Constraints
* **Authentication First:** Every endpoint (except `/api/v1/auth/*` and `/api/v1/preferences/catalog`) requires a valid JWT access token. User identity is extracted from the token — never from request bodies.
* **Two-Input Model:** Every tailoring operation requires both a **resume** (content source) and a **template** (format blueprint). These are distinct uploads serving distinct purposes.
* **Template Immutability:** The system will NOT generate documents from scratch. It will read `.docx` templates, locate predefined merge tags (e.g., `{{SUMMARY}}`, `{{EXPERIENCE_1}}`), and inject LLM-tailored text.
* **Resume Immutability:** The uploaded resume is a read-only content source. It is parsed for text extraction but never modified.
* **Stateless AI:** The LangChain orchestration must remain stateless. All historical context (Core Areas, resume text, previous applications) must be explicitly fetched from PostgreSQL and injected into the prompt chain by the Backend Lead.
* **Scheduler Isolation:** Background crawl jobs run inside the same FastAPI process using APScheduler. They share the SQLAlchemy engine but acquire their own sessions. Long-running crawls must not block the event loop — use `asyncio.gather` with concurrency limits.
* **Pluggable Sources:** Job sources are configured via a Python registry (`job_sources.py`), not database tables. Adding a new source requires only a new entry in the registry and (optionally) a new extractor function.
* **No Self-Invention:** Leads must strictly map their implementations to the endpoints defined in Section 3.

## 3. API Contract (The "Law")

### 3.0. Authentication
**`POST /api/v1/auth/register`**
* **Purpose:** Create a new user account with hashed password.
* **Payload:**
    ```json
    { "full_name": "string", "email": "string", "password": "string" }
    ```
* **Response (201 Created):**
    ```json
    { "id": "uuid", "full_name": "string", "email": "string", "core_skills": [] }
    ```

**`POST /api/v1/auth/login`**
* **Purpose:** Authenticate with email + password, receive token pair.
* **Payload:**
    ```json
    { "email": "string", "password": "string" }
    ```
* **Response (200 OK):**
    ```json
    {
      "access_token": "string (JWT)",
      "refresh_token": "string (JWT)",
      "token_type": "bearer",
      "user": { "id": "uuid", "full_name": "string", "email": "string", "core_skills": [] }
    }
    ```

**`POST /api/v1/auth/refresh`**
* **Purpose:** Exchange a valid refresh token for a new access token.
* **Payload:**
    ```json
    { "refresh_token": "string" }
    ```
* **Response (200 OK):**
    ```json
    { "access_token": "string (JWT)", "token_type": "bearer" }
    ```

**`GET /api/v1/auth/me`**
* **Purpose:** Return the profile of the currently authenticated user.
* **Response (200 OK):** Same as GET `/api/v1/users/{user_id}` (includes `is_admin` per **REQ-017**).

### 3.1. User & Profile Management
**`GET /api/v1/users/{user_id}`** *(authenticated, own user only)*
* **Purpose:** Fetch the user and their master "Core Areas".
* **Response (200 OK):**
    ```json
    {
      "id": "uuid",
      "full_name": "string",
      "email": "string",
      "core_skills": ["string"],
      "is_admin": false
    }
    ```

### 3.2. Template Management
**`POST /api/v1/templates/upload`** *(authenticated)*
* **Purpose:** Upload a `.docx` template with `{{TAG}}` placeholders (the output format blueprint).
* **Payload:** `multipart/form-data` (file: .docx, name: string, is_master: boolean)
* **Response (201 Created):**
    ```json
    {
      "template_id": "uuid",
      "name": "string",
      "file_path": "string"
    }
    ```

### 3.3. Resume Upload & Parsing
**`POST /api/v1/resumes/upload`**
* **Purpose:** Upload the user's latest resume (the content source). Accepts `.docx` or `.pdf`. The backend extracts plain text and stores both the file and extracted text.
* **Payload:** `multipart/form-data` (file: .docx | .pdf, user_id: uuid)
* **Response (201 Created):**
    ```json
    {
      "resume_id": "uuid",
      "original_filename": "string",
      "file_type": "docx | pdf",
      "extracted_text_preview": "string (first 500 chars)",
      "created_at": "datetime"
    }
    ```

**`GET /api/v1/users/{user_id}/resumes`**
* **Purpose:** List all resumes uploaded by a user (most recent first).
* **Response (200 OK):**
    ```json
    [
      {
        "resume_id": "uuid",
        "original_filename": "string",
        "file_type": "docx | pdf",
        "is_active": true,
        "created_at": "datetime"
      }
    ]
    ```

**`DELETE /api/v1/resumes/{resume_id}`**
* **Purpose:** Delete an uploaded resume.
* **Response (204 No Content)**

### 3.4. The Tailoring Engine
**`POST /api/v1/applications/tailor`**
* **Purpose:** (Legacy) One-shot tailoring — generate and finalize in a single call. Still used by the clone flow.
* **Payload:**
    ```json
    {
      "user_id": "uuid",
      "resume_id": "uuid",
      "template_id": "uuid",
      "job_title": "string",
      "organization": "string",
      "job_description_html": "string",
      "cover_letter_sentiment": "string"
    }
    ```
* **Response (200 OK):**
    ```json
    {
      "application_id": "uuid",
      "tailored_resume_url": "string",
      "cover_letter_text": "string"
    }
    ```

### 3.4b. Human-in-the-Loop Tailoring (Preview → Review → Confirm)

**`POST /api/v1/applications/tailor/preview`**
* **Purpose:** Phase 1 — AI analyses the candidate's uploaded resume against the JD and generates an editable draft. No document is generated; nothing is persisted.
* **Payload:** Same as `POST /api/v1/applications/tailor`.
* **Response (200 OK):**
    ```json
    {
      "summary": "string",
      "experience_1": "string",
      "experience_2": "string",
      "experience_3": "string",
      "skills": "string",
      "education": "string",
      "cover_letter": "string"
    }
    ```

**`POST /api/v1/applications/tailor/confirm`**
* **Purpose:** Phase 2 — Accept the (possibly user-edited) draft content, inject into the docx template, and persist the application.
* **Payload:**
    ```json
    {
      "user_id": "uuid",
      "resume_id": "uuid",
      "template_id": "uuid",
      "job_title": "string",
      "organization": "string",
      "job_description_html": "string",
      "cover_letter_sentiment": "string",
      "summary": "string",
      "experience_1": "string",
      "experience_2": "string",
      "experience_3": "string",
      "skills": "string",
      "education": "string",
      "cover_letter": "string"
    }
    ```
* **Response (200 OK):**
    ```json
    {
      "application_id": "uuid",
      "tailored_resume_url": "string",
      "cover_letter_text": "string"
    }
    ```

### 3.5. The Reference Engine (History Cloning)
**`POST /api/v1/applications/{application_id}/clone`**
* **Purpose:** Use a previously tailored application as the contextual baseline for a new JD.
* **Payload:**
    ```json
    {
      "new_job_title": "string",
      "new_organization": "string",
      "new_job_description_html": "string"
    }
    ```
* **Response (200 OK):**
    ```json
    {
      "new_application_id": "uuid",
      "tailored_resume_url": "string",
      "cover_letter_text": "string"
    }
    ```

### 3.6. Application History
**`GET /api/v1/users/{user_id}/applications`**
* **Purpose:** List all generated applications for a user (most recent first).

**`GET /api/v1/applications/{application_id}`**
* **Purpose:** Get full detail of a single application.

**`DELETE /api/v1/applications/{application_id}`**
* **Purpose:** Permanently delete an application and its generated `.docx` file.
* **Response (204 No Content)**

### 3.7. File Download
**`GET /api/v1/files/{file_name}`**
* **Purpose:** Download a generated `.docx` file.

### 3.8. Job Preferences
**`GET /api/v1/preferences`** *(authenticated)*
* **Purpose:** Retrieve the authenticated user's job preferences.
* **Response (200 OK):**
    ```json
    {
      "industry": "string | null",
      "role_categories": ["string"],
      "preferred_locations": ["string"],
      "experience_level": "string | null",
      "keywords": ["string"]
    }
    ```

**`PUT /api/v1/preferences`** *(authenticated)*
* **Purpose:** Create or fully replace the user's job preferences.
* **Payload:** Same shape as the GET response.
* **Response (200 OK):** Echoes the saved preferences.

**`GET /api/v1/preferences/catalog`** *(public)*
* **Purpose:** Return the pre-configured industry → role taxonomy.
* **Response (200 OK):**
    ```json
    {
      "IT Software": ["Engineering Manager", "Project Manager", "Technical Architect", "Full Stack Developer", "DevOps Engineer", "Data Engineer"],
      "Finance": ["Financial Analyst", "Risk Manager", "Portfolio Manager"],
      ...
    }
    ```

### 3.9. Job Crawling
**`POST /api/v1/jobs/crawl`** *(authenticated)*
* **Purpose:** Trigger an immediate crawl for the authenticated user's preferences.
* **Response (202 Accepted):**
    ```json
    { "crawl_run_id": "uuid", "status": "running" }
    ```

**`GET /api/v1/jobs/crawl/status`** *(authenticated)*
* **Purpose:** Get the most recent crawl run for the user.
* **Response (200 OK):**
    ```json
    {
      "id": "uuid",
      "status": "running | completed | failed",
      "jobs_found": 0,
      "jobs_new": 0,
      "started_at": "datetime",
      "finished_at": "datetime | null",
      "error_message": "string | null"
    }
    ```

**`GET /api/v1/jobs`** *(authenticated)*
* **Purpose:** List crawled jobs filtered by user's preferences, with pagination.
* **Query params:** `page` (default 1), `per_page` (default 20), `search` (optional text search).
* **Response (200 OK):**
    ```json
    {
      "items": [
        {
          "id": "uuid",
          "title": "string",
          "organization": "string",
          "location": "string",
          "url": "string",
          "source_name": "string",
          "posted_at": "datetime | null",
          "scraped_at": "datetime"
        }
      ],
      "total": 100,
      "page": 1,
      "per_page": 20
    }
    ```

### 3.9.1. Admin crawl source management (REQ-017)
* **Authorization:** `Authorization: Bearer` + user `is_admin === true`. Otherwise **403**.
* **`GET /api/v1/admin/crawl-sources`** — list all crawl source definitions.
* **`POST /api/v1/admin/crawl-sources`** — create (body: `source_key`, `display_name`, `source_type`, `url_template`, optional `headers`, `rate_limit_seconds`, `selectors`, `industries`, `enabled`, `sort_order`).
* **`GET /api/v1/admin/crawl-sources/{id}`** — single source.
* **`PATCH /api/v1/admin/crawl-sources/{id}`** — partial update.
* **`DELETE /api/v1/admin/crawl-sources/{id}`** — remove or soft-disable per implementation note in requirements.

**Data:** Table `job_crawl_sources` (see REQ-017). Crawler resolves user crawls from enabled rows filtered by user industry; seed data mirrors legacy `job_sources.py` registry.

### 3.10. Dashboard & Job Matching
**`GET /api/v1/dashboard/stats`** *(authenticated)*
* **Purpose:** Aggregate match statistics for the dashboard header.
* **Response (200 OK):**
    ```json
    {
      "total_matches": 42,
      "average_score": 72.5,
      "new_today": 8,
      "saved_count": 5,
      "tier_90_plus": 3,
      "tier_70_89": 15,
      "tier_50_69": 18,
      "tier_below_50": 6
    }
    ```

**`GET /api/v1/dashboard/matches`** *(authenticated)*
* **Purpose:** Paginated list of job matches sorted by score.
* **Query params:** `page`, `per_page`, `status` (all/new/saved/applied/dismissed), `min_score`, `max_score`.
* **Response (200 OK):**
    ```json
    {
      "items": [
        {
          "id": "uuid",
          "job": { "id": "uuid", "title": "string", "organization": "string", "location": "string", "url": "string", "source_name": "string", "posted_at": "datetime | null" },
          "overall_score": 85.2,
          "skill_match_score": 90.0,
          "experience_match_score": 80.0,
          "role_fit_score": 85.5,
          "strengths": ["string"],
          "status": "new",
          "created_at": "datetime"
        }
      ],
      "total": 42,
      "page": 1,
      "per_page": 20
    }
    ```

**`GET /api/v1/dashboard/matches/{match_id}`** *(authenticated)*
* **Purpose:** Full match detail with breakdown.
* **Response (200 OK):**
    ```json
    {
      "id": "uuid",
      "job": { "id": "uuid", "title": "string", "organization": "string", "location": "string", "url": "string", "description_text": "string", "source_name": "string", "posted_at": "datetime | null" },
      "overall_score": 85.2,
      "skill_match_score": 90.0,
      "experience_match_score": 80.0,
      "role_fit_score": 85.5,
      "match_details": {
        "strengths": ["string"],
        "gaps": ["string"],
        "recommendation": "string"
      },
      "status": "new",
      "created_at": "datetime"
    }
    ```

**`PATCH /api/v1/dashboard/matches/{match_id}`** *(authenticated)*
* **Purpose:** Update match status (viewed, saved, applied, dismissed).
* **Payload:**
    ```json
    { "status": "saved" }
    ```
* **Response (200 OK):** Echoes the updated match.

**`POST /api/v1/dashboard/matches/{match_id}/apply`** *(authenticated)*
* **Purpose:** Bridges a matched job into the tailoring flow — returns a pre-filled tailor preview payload.
* **Response (200 OK):** Same shape as `POST /api/v1/applications/tailor/preview` response.

## 4. Integration Specifications
* **LLM Integration:** Backend will use `ChatOpenAI` (or specified LangChain LLM) with a temperature set to 0.4 for resume facts (precision), 0.7 for the cover letter (emotion/human sentence generation), and 0.3 for match scoring (analytical precision).
* **Document Processing:** Backend will strictly use `python-docx` to iterate through paragraphs and tables, replacing `{{TAGS}}` with generated content to preserve XML styling for ATS parsers.
* **Resume Parsing:**
  * `.docx` — `python-docx` to extract paragraph and table text.
  * `.pdf` — `pdfplumber` to extract text with layout awareness.
  * Extracted text is stored in `resumes.extracted_text` for instant retrieval during tailoring.
* **HTML→Text Conversion:** The backend must convert rich HTML job descriptions to structured plain text before injecting into LLM prompts. Use `beautifulsoup4` with a custom converter that preserves semantic structure (headings, lists, emphasis).
* **Job Crawling:**
  * `httpx.AsyncClient` with 30s timeout, 3 retries with exponential backoff, 2s rate limit between requests to the same source.
  * HTML parsing via `beautifulsoup4` with source-specific CSS selectors.
  * API sources use direct JSON responses.
  * Deduplication via `(source_name, external_id)` unique constraint.
* **Background Scheduling:**
  * `APScheduler` `AsyncIOScheduler` running inside the FastAPI process.
  * Default cron: `0 6 * * *` (daily at 06:00 UTC), configurable via `APP_CRAWL_CRON`.
  * Crawl job acquires its own `AsyncSession`, runs the full pipeline (fetch → parse → deduplicate → store → score), and records a `crawl_run`.
* **Authentication:**
  * `python-jose[cryptography]` for JWT encode/decode (HS256).
  * `passlib[bcrypt]` for password hashing.
  * Access token TTL: 30 minutes. Refresh token TTL: 7 days.
  * Secret key: `APP_JWT_SECRET` env var (required, no default).

## 5. AI Orchestration Layer (LangChain)

**Strict Constraint:** The Backend Lead is forbidden from using raw openai or anthropic SDK clients directly. All LLM interactions MUST be routed through LangChain to ensure modularity, prompt versioning, and deterministic output parsing.

### 5.1 Agentic Tailoring Flow:

1. **Resume Content Loader:** Backend fetches `extracted_text` from the `resumes` table for the given `resume_id`. This text is the factual basis — the LLM must not invent experience.

2. **JD Processing:** Backend converts `job_description_html` to structured plain text, preserving bullets and headings for semantic clarity in the prompt.

3. **Prompt Templates:** The system must use strictly defined `ChatPromptTemplate` structures. The prompt includes: (a) resume text, (b) processed JD text, (c) user's `core_skills`, (d) sentiment directive, and (e) format instructions from `PydanticOutputParser`.

4. **Structured Output (Guardrails):** LangChain's `PydanticOutputParser` must be used. The LLM must return a strict JSON object where keys map exactly to the `{{TAGS}}` in the Word document.

5. **Memory / Context Injection:** When a user requests to "Clone previous application," the Backend Lead will fetch the history from Postgres and inject it as `SystemMessage` context into the LangChain pipeline, ensuring the LLM uses the historical tailored points as its baseline.

### 5.2 Job Match Scoring Flow:

1. **Input Assembly:** Backend fetches the user's latest active resume `extracted_text`, `core_skills`, and the crawled job's `description_text`.

2. **Prompt Template:** A dedicated `MATCH_SCORING_PROMPT` instructs the LLM to act as a career advisor. The prompt includes: (a) candidate resume text, (b) candidate core skills, (c) job description text. Temperature: 0.3.

3. **Structured Output:** `PydanticOutputParser(JobMatchScore)` forces:
   * `overall_score` (0–100 float)
   * `skill_match_score` (0–100 float)
   * `experience_match_score` (0–100 float)
   * `role_fit_score` (0–100 float)
   * `strengths` (list[str])
   * `gaps` (list[str])
   * `recommendation` (str)

4. **Batch Processing:** After crawl completes, `score_new_matches(user_id)` fetches all unscored jobs for the user's preference criteria and scores them with concurrency limit of 5.