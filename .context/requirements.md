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