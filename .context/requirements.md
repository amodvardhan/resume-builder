# Product Requirements Document (PRD)
**Owner:** Business Analyst
**Project:** Resume Builder

---

## REQ-001: User Core Profile
* **Description:** The system must remember the user's foundational information and core areas of expertise.
* **Acceptance Criteria:**
  * [ ] API can accept and store a user's name, email, and an array of `core_skills`.
  * [ ] UI displays a dedicated "Master Profile" section for the user to update these skills.

## REQ-002: Master Template Vault
* **Description:** Users can upload Word (.docx) templates containing specific `{{TAGS}}` that act as the structural blueprint for the **output** document.
* **Acceptance Criteria:**
  * [ ] API accepts `.docx` file uploads and saves them securely.
  * [ ] System stores the file path and template metadata in the database.
  * [ ] The system NEVER modifies the original master template file.

## REQ-003: Resume Upload & Parsing (Content Source)
* **Description:** Users must upload their **latest resume** — the source document containing their actual experience, achievements, and qualifications. The system extracts text content from this resume so the LLM can use it as the factual basis for tailoring. This is distinct from the template (REQ-002), which defines only the output format.
* **Acceptance Criteria:**
  * [ ] UI provides a dedicated "Upload Your Resume" area, visually separate from the template upload.
  * [ ] API accepts `.docx` and `.pdf` resume uploads.
  * [ ] Backend extracts plain text from uploaded `.docx` files (via `python-docx`) and `.pdf` files (via `PyPDF2` or `pdfplumber`).
  * [ ] Extracted text is stored in the database alongside file metadata for reuse across multiple tailoring sessions.
  * [ ] Users can re-upload a new resume at any time; the system replaces the previous one for that user.
  * [ ] The uploaded resume file is stored securely and never modified.

## REQ-004: The Tailoring Engine (LangChain)
* **Description:** The core AI engine that reads the user's uploaded resume content, matches it against a Job Description, and produces tailored output injected into the chosen template format.
* **Acceptance Criteria:**
  * [ ] UI requires **both** a resume (REQ-003) and a template (REQ-002) before tailoring can begin.
  * [ ] UI provides a **rich HTML editor** for the Job Description input (supporting paste from web, bold, bullets, headings — see REQ-006).
  * [ ] UI allows users to set a "Cover Letter Sentiment" slider (e.g., Formal vs. Mission-Driven).
  * [ ] Backend LangChain pipeline receives: (a) extracted resume text, (b) JD content, (c) user's `core_skills`, and (d) optional historical data.
  * [ ] Backend uses LangChain to analyze the JD, cross-reference with the user's resume content and `core_skills`, and produce structured JSON keyed to template `{{TAGS}}`.
  * [ ] Backend uses `python-docx` to inject the LLM output into a copy of the selected template.
  * [ ] Output is a downloadable `.docx` file that is 100% ATS-readable and structurally identical to the input template.

## REQ-005: Rich Job Description Editor
* **Description:** The Job Description input must be a rich-text HTML editor rather than a plain textarea. Job postings are frequently copied from websites and contain formatted lists, headings, and bold keywords that carry semantic meaning for the LLM.
* **Acceptance Criteria:**
  * [ ] UI replaces the plain textarea with an HTML-capable rich-text editor (e.g., TipTap, React-Quill, or equivalent).
  * [ ] Editor supports: paste from web (preserving structure), bold, italic, bullet lists, numbered lists, and headings.
  * [ ] Editor strips dangerous HTML (scripts, iframes) on input — sanitized via a library like DOMPurify.
  * [ ] The HTML content is sent to the backend as-is; the backend converts it to plain text for LLM prompt injection (stripping tags but preserving structure via newlines and bullets).
  * [ ] Editor provides a clean, minimal appearance consistent with the app's design language (see `.context/ui-guidelines.md`).

## REQ-006: The Reference Engine (History Cloning)
* **Description:** Users can select a previously tailored application (e.g., an IAEA P3 submission) and use it as the foundational context for a new application.
* **Acceptance Criteria:**
  * [ ] Database stores all generated applications, including the exact cover letter and tailored text used.
  * [ ] UI features a "History" sidebar showing past applications.
  * [ ] UI includes a "Use as Reference" button on past applications.
  * [ ] Backend LangChain pipeline injects the referenced application's data as a `SystemMessage` to guide the new tailoring process.

## REQ-008: Template Gallery Styling Consistency
* **Description:** When the user selects a template style from the gallery (classic, modern, minimal, executive, creative), the visual presentation must be consistent across every surface: Draft Review page, Application Ready page, and the downloadable `.docx` file.
* **Acceptance Criteria:**
  * [ ] The "Application Ready" (done) page renders the resume preview using the same template-aware layout as the Draft Review page (e.g., two-column grid for "modern", branded header for "executive"/"creative").
  * [ ] The modern template uses a 30/70 sidebar-to-main ratio on all surfaces (CSS preview and `.docx`).
  * [ ] The modern template sidebar is flush-left with zero margin, no border-radius, and spans the full document height in both the CSS preview and the generated `.docx`.
  * [ ] The downloadable `.docx` for the modern template has zero left page margin, sidebar cell with no left padding (background fills to edge), and explicit 30/70 column widths.

## REQ-009: WYSIWYG Section Formatting Consistency
* **Description:** Skills, education, and certifications must render with identical visual treatment across the Draft Review screen, Application Ready screen, and the downloadable `.docx` — WYSIWYG principle.
* **Acceptance Criteria:**
  * [ ] Skills render as pill badges on both the Draft Review and Application Ready screens.
  * [ ] Education entries separated by `;` or `\n` display as distinct blocks with visual dividers.
  * [ ] Certifications separated by `;` or `\n` display as individual entries with shield icons.
  * [ ] The Draft Review screen uses a click-to-edit toggle: formatted preview by default, TipTap editor on click.
  * [ ] The downloadable `.docx` splits education and certifications on `;` and `\n` into separate paragraphs.

## REQ-010: Document Quality & PDF Download
* **Description:** Generated documents must have professional spacing and layout. PDF output must visually match the UI preview. Users can download as PDF (default) or `.docx`.
* **Acceptance Criteria:**
  * [ ] The modern template sidebar covers the full page height in the `.docx`, extending to all pages if content overflows.
  * [ ] All template builders use consistent paragraph spacing: 14pt line spacing, 6pt space-after for body, 16pt space-before / 8pt space-after for headings.
  * [ ] Experience blocks have proper indentation for bullet points and spacing between role titles and content.
  * [ ] PDF is generated from HTML/CSS (same design as UI) via WeasyPrint — cross-platform, no MS Word/LibreOffice/browser dependency, no OS permission prompts.
  * [ ] All 5 template styles (classic, modern, minimal, executive, creative) have HTML/CSS equivalents in `pdf_renderer.py` that match the frontend `index.css` template classes.
  * [ ] PDF and DOCX are pre-generated during `finalize_document()` and served as static files (no on-demand conversion).
  * [ ] Frontend download buttons: primary PDF button + secondary `.docx` button for both resume and cover letter.

## REQ-011: HTML-to-Rich-Text in Generated Documents
* **Description:** When content contains HTML markup (e.g., `<b>`, `<strong>`, `<i>`, `<em>`) from LLM output or user edits, the generated `.docx` must convert these to proper Word formatting (bold/italic runs) instead of displaying raw HTML tags as literal text.
* **Acceptance Criteria:**
  * [ ] A `_add_rich_runs()` utility parses `<b>`, `<strong>`, `<i>`, `<em>` tags into proper bold/italic docx runs.
  * [ ] Unknown/unsupported HTML tags are silently stripped from the output.
  * [ ] All five resume template builders and all five cover letter builders use `_add_rich_runs()` for content paragraphs.
  * [ ] Experience blocks, separated entries, sidebar text, and main text all process HTML correctly.

---

## REQ-012: User Authentication
* **Description:** The system must support user registration and login with secure JWT-based authentication. All API endpoints (except auth endpoints) must require a valid access token. The frontend must persist tokens, handle expiry transparently, and gate all routes behind login.
* **Acceptance Criteria:**
  * [ ] Users can register with full name, email, and password via `POST /api/v1/auth/register`.
  * [ ] Passwords are hashed using bcrypt before storage; plaintext passwords are never persisted or logged.
  * [ ] Users can log in with email + password via `POST /api/v1/auth/login`, receiving an access token (30-min TTL) and a refresh token (7-day TTL).
  * [ ] Access tokens are JWT signed with HS256; payload includes `sub` (user UUID) and `exp`.
  * [ ] A refresh endpoint `POST /api/v1/auth/refresh` issues a new access token given a valid refresh token.
  * [ ] `GET /api/v1/auth/me` returns the authenticated user's profile.
  * [ ] All existing endpoints (users, templates, resumes, applications, files) require `Authorization: Bearer <token>` and extract `user_id` from the token — no more accepting `user_id` in request bodies for identity.
  * [ ] Frontend provides Login and Register pages with form validation and error display.
  * [ ] Frontend stores tokens in `localStorage`, attaches `Authorization` header to all API calls via an Axios interceptor, and redirects to login on 401.
  * [ ] Frontend wraps the app in an `AuthProvider` context exposing `user`, `login()`, `register()`, `logout()`, and `isAuthenticated`.

## REQ-013: Job Preferences & Career Profile
* **Description:** Each user can configure structured job preferences that define which industries, roles, locations, and experience levels they target. These preferences drive the job crawler's search filters and the match engine's scoring. The system provides a pre-built catalog of industries and role categories.
* **Acceptance Criteria:**
  * [ ] A `job_preferences` table stores per-user preferences: `industry`, `role_categories` (JSONB array), `preferred_locations` (JSONB array), `experience_level`, and `keywords` (JSONB array).
  * [ ] `PUT /api/v1/preferences` creates or fully replaces the user's preferences (upsert semantics).
  * [ ] `GET /api/v1/preferences` returns the user's current preferences (or empty defaults).
  * [ ] `GET /api/v1/preferences/catalog` returns the pre-configured taxonomy: a map of industries to arrays of role categories (e.g., `{ "IT Software": ["Engineering Manager", "Technical Architect", ...], "Finance": [...] }`).
  * [ ] The catalog is defined in `src/backend/job_sources.py` as a Python constant — not stored in the DB.
  * [ ] Frontend provides a "Preferences" page accessible from the header navigation, with dropdowns/multi-selects for industry, roles, locations, and experience level.
  * [ ] Changing preferences triggers an on-demand crawl for the new criteria (debounced, not on every keystroke).

## REQ-014: Job Crawling & Source Management
* **Description:** The system maintains a registry of pre-configured job source URLs mapped to industries and roles. A background scheduler crawls these sources at a configurable interval (default: daily at 06:00 UTC). Users can also trigger a manual crawl. Crawled jobs are deduplicated and stored with full metadata.
* **Acceptance Criteria:**
  * [ ] `src/backend/job_sources.py` contains a `JOB_SOURCE_REGISTRY` mapping: `{ industry → { role → [source_config] } }` where each `source_config` defines `name`, `source_type` (api | html_scraper | rss), `url_template`, and extraction rules.
  * [ ] The `crawled_jobs` table stores: `id`, `source_name`, `external_id`, `title`, `organization`, `location`, `description_html`, `description_text`, `url`, `salary_range`, `posted_at`, `scraped_at`, `industry`, `role_category`, `raw_data` (JSONB).
  * [ ] The `crawl_runs` table stores audit history: `id`, `user_id`, `status` (running/completed/failed), `jobs_found`, `jobs_new`, `started_at`, `finished_at`, `error_message`.
  * [ ] `src/backend/services/job_crawler.py` implements the crawl pipeline: build URLs from preferences → fetch → parse → deduplicate via `(source_name, external_id)` unique constraint → store.
  * [ ] The crawler uses `httpx.AsyncClient` with configurable timeout, retry (3 attempts with exponential backoff), rate limiting (2s between requests to same source), and proper User-Agent headers.
  * [ ] `src/backend/services/scheduler.py` uses APScheduler's `AsyncIOScheduler` to run the crawl job. Schedule is configurable via `APP_CRAWL_CRON` env var (default: `0 6 * * *`).
  * [ ] `POST /api/v1/jobs/crawl` triggers an immediate crawl for the authenticated user's preferences.
  * [ ] `GET /api/v1/jobs/crawl/status` returns the most recent `crawl_run` for the user.
  * [ ] `GET /api/v1/jobs` lists crawled jobs filtered by the user's preferences (industry + role_categories), with pagination (`?page=1&per_page=20`).
  * [ ] The scheduler starts on application startup and shuts down gracefully.

## REQ-015: AI-Powered Job Matching
* **Description:** When new jobs are crawled (or on demand), the system uses LangChain to compare each job against the user's latest resume and core skills, producing a structured match score. This follows the same LangChain orchestration pattern as the tailoring engine: `ChatPromptTemplate` → `ChatOpenAI` → `PydanticOutputParser`.
* **Acceptance Criteria:**
  * [ ] The `job_matches` table stores: `id`, `user_id`, `job_id` (FK → crawled_jobs), `overall_score` (0–100 float), `skill_match_score`, `experience_match_score`, `role_fit_score`, `match_details` (JSONB: strengths, gaps, recommendation), `status` (new/viewed/saved/applied/dismissed), `created_at`.
  * [ ] `src/backend/services/job_matcher.py` implements `score_job_match()` using LangChain: prompt includes resume text + core_skills + job description; output is a Pydantic model with numeric scores and text analysis.
  * [ ] Batch scoring: after each crawl, all new (unscored) jobs for the user are scored. Uses `asyncio.gather` with concurrency limit (5 parallel LLM calls) to avoid rate-limit issues.
  * [ ] `GET /api/v1/dashboard/matches` returns matches sorted by `overall_score` desc, with filtering by `status`, `min_score`, and pagination.
  * [ ] `GET /api/v1/dashboard/matches/{match_id}` returns the full match detail including `match_details` breakdown.
  * [ ] `PATCH /api/v1/dashboard/matches/{match_id}` updates the match status (viewed, saved, applied, dismissed).
  * [ ] `POST /api/v1/dashboard/matches/{match_id}/apply` — convenience endpoint that pre-fills a tailor preview using the matched job's description, title, and organization (bridges to the existing tailoring flow from REQ-007).
  * [ ] `GET /api/v1/dashboard/stats` returns aggregate dashboard statistics: total matches, average score, matches by score tier (90+, 70–89, 50–69, below 50), new today, saved count.

## REQ-016: Job Dashboard
* **Description:** A dedicated dashboard page shows the user their matched jobs ranked by AI-computed relevance. Each card displays the job title, company, match score (with color coding), and key strengths/gaps. The user can drill into full match analysis, save/dismiss jobs, or start a tailored application directly from a match.
* **Acceptance Criteria:**
  * [ ] Frontend adds a "Dashboard" page as the default landing page for authenticated users.
  * [ ] Header navigation includes: Dashboard, Compose, History, Profile — with Dashboard highlighted by default.
  * [ ] Dashboard displays summary stat cards at the top: total matches, average score, new today, saved.
  * [ ] Below stats, a grid of `JobMatchCard` components sorted by score, each showing: job title, organization, location, match score (color-coded: green >=80, amber 60-79, red <60), top 3 strengths as chips, posted date.
  * [ ] Clicking a card expands a `MatchBreakdown` panel showing: radial/bar indicators for skill match, experience match, role fit; full strengths list; gaps/missing skills; AI recommendation text.
  * [ ] Each card has quick-action buttons: Save, Dismiss, Apply (starts tailor flow with pre-filled JD).
  * [ ] Dashboard supports filtering: score range slider, status filter (all/new/saved), date range.
  * [ ] Dashboard supports pagination (20 per page).
  * [ ] Empty state: when no matches exist, show a prompt to set up preferences and trigger a crawl.
  * [ ] The dashboard design follows the existing Meridian design language: off-white background, rounded cards with subtle borders, brand accent colors, clean typography.

---

## REQ-017: Admin-Managed Job Crawl Sources
* **Description:** Platform operators (Admins) must be able to configure which job boards and feeds the application crawls — including URL templates, source type (API / HTML scraper / RSS), rate limits, and HTML extraction selectors — without code deploys. Regular users continue to use Preferences (REQ-013) only to supply search parameters (`{role}`, `{location}`, `{keywords}`); Admins define **where** those parameters are sent. The crawler must use DB-backed definitions as the source of truth once this requirement is implemented; a one-time data migration seeds rows equivalent to today’s `job_sources.py` defaults so behavior is preserved until Admins change them.
* **Acceptance Criteria:**
  * [ ] **`users.is_admin`:** Add a boolean column `is_admin` (default `false`) on `users`. Admin-only APIs authorize via `Depends(get_current_user)` plus `is_admin == True`. Document how to promote users (e.g. one-time SQL update or optional env `APP_ADMIN_EMAILS` comma-separated list checked at login to set `is_admin` on matching accounts — product chooses one documented bootstrap path).
  * [ ] **`job_crawl_sources` table** stores: `id` (UUID PK), `source_key` (unique slug, e.g. `indeed`, used as `source_name` on ingested jobs), `display_name`, `source_type` (`api` | `html_scraper` | `rss`), `url_template` (must support placeholders `{role}`, `{location}`, `{keywords}`), `headers` (JSONB, default `{}`), `rate_limit_seconds` (float), `selectors` (JSONB, for `html_scraper`; empty for api/rss), `industries` (JSONB array of industry names from the preferences catalog; **empty array means the source applies to all industries**), `enabled` (boolean), `sort_order` (int), `created_at`, `updated_at`.
  * [ ] **Seed migration:** Insert seed rows that reproduce the effective crawl coverage of the current `JOB_SOURCE_REGISTRY` / `SourceConfig` set (same boards and industry applicability as shipped in `job_sources.py` at time of implementation).
  * [ ] **Crawler integration:** `job_crawler` (and `get_sources_for_preferences` or successor) loads **enabled** `job_crawl_sources` rows applicable to the user’s `industry`, builds resolved URLs from user preferences (roles × locations × sources), and runs the existing fetch/parse/dedup pipeline. Parsing dispatches by `source_type` and `source_key` (or shared extractor registry). Disabled sources are skipped.
  * [ ] **Admin REST API** (all require admin JWT):
    * `GET /api/v1/admin/crawl-sources` — list all sources (include disabled), ordered by `sort_order` then `display_name`.
    * `POST /api/v1/admin/crawl-sources` — create a source (validate `source_type`, URL template placeholders, unique `source_key`).
    * `GET /api/v1/admin/crawl-sources/{id}` — detail.
    * `PATCH /api/v1/admin/crawl-sources/{id}` — partial update (toggle `enabled`, edit template, selectors, industries, rate limit, etc.).
    * `DELETE /api/v1/admin/crawl-sources/{id}` — hard delete **or** soft-delete via `enabled=false` only; document choice in architecture (prefer soft-disable for audit safety).
  * [ ] **Non-admin users:** Must receive `403 Forbidden` on all `/api/v1/admin/*` routes. No leakage of crawl configuration to non-admin clients except what is already implied by public job results.
  * [ ] **Frontend — Admin Crawl Sources page:** Route e.g. `/admin/crawl-sources`, visible in header/nav **only** when `user.is_admin` is true. Table or card list of sources with columns: name, type, enabled, industries summary, rate limit. Actions: Add source, Edit (modal or dedicated form), Enable/Disable. Form fields map 1:1 to API (url template, selectors as JSON textarea or structured fields per type, industry multi-select from existing catalog API).
  * [ ] **Auth/me:** `GET /api/v1/auth/me` (or equivalent profile payload used by the app) includes `is_admin` so the frontend can show/hide Admin navigation.
  * [ ] **Architecture & DBA:** Update `.context/architecture-global.md` and `.context/db-schema.sql` (or migrations) with the new model and endpoint contracts. **REQ-014** static registry in `job_sources.py` may remain for **industry/role catalog only** (`INDUSTRY_ROLE_CATALOG`); crawl **execution** for users is driven by `job_crawl_sources` after REQ-017 is done (remove or deprecate duplicate crawl registry in code once DB is authoritative).