# Implementation Progress

**Audited by:** Business Analyst
**Audit date:** 2026-03-16
**Verdict:** OPERATIONAL — All core requirements implemented and verified

---

## REQ-001: User Core Profile

* [x] API can accept and store a user's name, email, and an array of `core_skills`.
  > `POST /api/v1/users` creates a new user. `PATCH /api/v1/users/{user_id}` updates name, email, and/or `core_skills`. `GET /api/v1/users/{user_id}` reads back the profile.
* [x] UI displays a dedicated "Master Profile" section for the user to update these skills.
  > `MasterProfile` component renders below the header. Provides editable fields for full name, email, and comma-separated core skills with a save button wired to the PATCH endpoint.

## REQ-002: Master Template Vault

* [x] API accepts `.docx` file uploads and saves them securely.
* [x] System stores the file path and template metadata in the database.
* [x] The system NEVER modifies the original master template file.
  > `inject_into_template()` uses `shutil.copy2` to duplicate the template before any writes.

## REQ-003: Resume Upload & Parsing (Content Source)

* [x] UI provides a dedicated "Upload Your Resume" area, visually separate from the template upload.
  > `ResumeDrop` component renders above the template drop zone with distinct copy and accepts `.docx`/`.pdf`.
* [x] API accepts `.docx` and `.pdf` resume uploads.
  > `POST /api/v1/resumes/upload` detects type from extension, stores file, extracts text.
* [x] Backend extracts plain text from uploaded `.docx` files (via `python-docx`) and `.pdf` files (via `pdfplumber`).
  > `resume_parser.extract_resume_text()` dispatches to `extract_text_from_docx` / `extract_text_from_pdf`.
* [x] Extracted text is stored in the database alongside file metadata for reuse across multiple tailoring sessions.
  > `Resume.extracted_text` column populated on upload and read back during tailoring.
* [x] Users can re-upload a new resume at any time; the system replaces the previous one for that user.
  > Upload endpoint deactivates previous active resumes (`is_active=False`) before inserting the new one.
* [x] The uploaded resume file is stored securely and never modified.
  > Files saved to `storage/resumes/{uuid}.{ext}` and never opened for writing after initial save.

## REQ-004: The Tailoring Engine (LangChain)

* [x] UI requires **both** a resume (REQ-003) and a template (REQ-002) before tailoring can begin.
  > `canSubmitTailor` gate requires `resumeId && templateId` plus all job fields.
* [x] UI provides a **rich HTML editor** for the Job Description input (see REQ-005).
  > `RichEditor` (TipTap) used for `jobDescriptionHtml` state.
* [x] UI allows users to set a "Cover Letter Sentiment" slider (Formal vs. Mission-Driven).
  > `SentimentSlider` values emit `formal`, `conversational`, and `mission-driven`.
* [x] Backend LangChain pipeline receives: (a) extracted resume text, (b) JD content, (c) user's `core_skills`, and (d) optional historical data.
  > `tailor_resume()` accepts `resume_text`, `job_description`, `core_skills`, and `history_context`. Resume text is fetched from `Resume.extracted_text` in the tailor endpoint.
* [x] Backend uses LangChain to produce structured JSON keyed to template `{{TAGS}}`.
  > `PydanticOutputParser(TailoredContent)` forces `summary`, `experience_1..3`, `skills`, `education` keys.
* [x] Backend uses `python-docx` to inject LLM output into a copy of the selected template.
  > `inject_into_template()` handles paragraph-level tag replacement including tags split across XML runs.
* [x] Output is a downloadable `.docx` file that is 100% ATS-readable and structurally identical to the input template.
  > `tailored_resume_url` stores the output filename; `GET /api/v1/files/{file_name}` serves the download.

## REQ-005: Rich Job Description Editor

* [x] UI replaces the plain textarea with an HTML-capable rich-text editor (TipTap).
  > `RichEditor` component uses `@tiptap/react` with `StarterKit` and `Placeholder`.
* [x] Editor supports: paste from web, bold, italic, bullet lists, numbered lists, headings.
  > Menu bar provides Bold, Italic, H2, H3, Bullet List, Ordered List controls.
* [x] Editor strips dangerous HTML (scripts, iframes) via DOMPurify.
  > Paste handler runs `DOMPurify.sanitize(html)` before inserting content.
* [x] Backend converts HTML to structured plain text for LLM prompt injection.
  > `html_to_plain_text()` uses BeautifulSoup to convert headings → `## `, lists → `- ` / `1.`, paragraphs → lines.
* [x] Editor provides a clean, minimal appearance consistent with the app's design language.
  > Minimal menu shown on focus, border transitions, placeholder text, consistent Tailwind tokens.

## REQ-006: The Reference Engine (History Cloning)

* [x] Database stores all generated applications, including the exact cover letter and tailored text used.
* [x] UI features a "History" sidebar showing past applications.
  > `GET /api/v1/users/{user_id}/applications` endpoint added. The `HistorySidebar` component fetches via `useApplicationHistory`.
* [x] UI includes a "Use as Reference" button on past applications.
  > Detail view loads correctly and the "Use as Baseline for New Application" button triggers the clone flow.
* [x] Backend LangChain pipeline injects the referenced application's data as a `SystemMessage` to guide the new tailoring process.
* [x] UI allows deleting history entries permanently.
  > `DELETE /api/v1/applications/{application_id}` endpoint added. `HistoryPage` detail view shows a delete button with confirmation dialog. Generated `.docx` files are cleaned up on delete.

## REQ-007: Human-in-the-Loop (Preview → Review → Confirm)

* [x] AI analyses the candidate's uploaded resume and generates a structured draft tailored to the JD.
  > `POST /api/v1/applications/tailor/preview` runs the LangChain chains and returns editable JSON (summary, experience_1-3, skills, education, cover_letter). No docx generated; nothing persisted.
* [x] UI presents the AI draft in an editable review panel before document generation.
  > `DraftReview` component shows each section in a labelled textarea. Users can edit any field; "Edited" badges and per-field Reset buttons indicate changes. Progress breadcrumb shows Input → Review Draft → Final Document.
* [x] User can modify any section of the AI-generated content before confirming.
  > Each field (summary, experiences, skills, education, cover letter) is editable. The "Back to Editor" button returns to the input phase without losing JD/upload state.
* [x] Confirmation generates the final `.docx` and persists the application with the user-approved content.
  > `POST /api/v1/applications/tailor/confirm` accepts the edited content, injects into the docx template via `finalize_document()`, and persists the `Application` row. The tailoring engine's `tailor_resume()` is refactored into `generate_draft()` + `finalize_document()` to support both the HITL flow and the legacy clone flow.
