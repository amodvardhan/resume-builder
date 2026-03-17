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

## REQ-008: Template Gallery Styling Consistency

* [x] The "Application Ready" (done) page renders the resume preview using the same template-aware layout as the Draft Review page.
  > `App.tsx` "done" phase now branches on `templateStyle === "modern"` to render a `tpl-grid` + `tpl-sidebar` / `tpl-main` two-column layout for the modern template, and uses proper `tpl-header` for executive/creative/classic — matching `DraftReview.tsx` exactly.
* [x] The modern template uses a 30/70 sidebar-to-main ratio on all surfaces (CSS preview and `.docx`).
  > CSS: `.tpl-modern .tpl-grid` updated from `210px 1fr` to `30% 70%`. Backend: `_build_modern_resume` computes sidebar/main widths as 30%/70% of available page width.
* [x] The modern template sidebar is flush-left with zero margin, no border-radius, and spans the full document height.
  > CSS: `.tpl-modern .tpl-sidebar` updated to `border-radius: 0; margin: 0; min-height: 100%`. `.tpl-modern.doc-page` sets `padding: 0; overflow: hidden`.
* [x] The downloadable `.docx` for the modern template has zero left page margin, sidebar cell with no left padding, and explicit 30/70 column widths.
  > Backend: `_build_modern_resume` sets `left_margin = Inches(0)`, sidebar cell has `tcMar.left = 0 dxa`, paragraph content indented via `left_indent = Pt(12)` for readability. Table borders set to `none`.
* [x] Cover letter page on the "Application Ready" screen has proper padding (not affected by modern template's zero-padding rules).
  > Removed overly broad `.tpl-modern.doc-page > div { padding: 0 }` CSS rule that was zeroing out all direct children, including the cover letter wrapper. Cover letter's Tailwind `px-12 py-10` now applies correctly.
* [x] Skills displayed as pill badges on the "Application Ready" screen for all template styles.
  > Skills text split by comma, each rendered as a `.skill-pill` inside a `.skill-pills` flex-wrap container. Template-specific pill variants for modern (teal), executive (squared), and creative (gradient).
* [x] Education entries have visual separators when multiple academic entries are present.
  > Education text split by newline, each entry rendered inside `.edu-entries` container with `.edu-entry + .edu-entry` border-top separator rule.
* [x] Certifications rendered with clean multi-entry formatting and shield-check icons.
  > Certifications split by newline, each rendered in `.cert-entries` container with a shield-check SVG icon (`.cert-icon`) and template-aware color theming.

## REQ-009: WYSIWYG Section Formatting Consistency

* [x] Skills render as pill badges on both the Draft Review and Application Ready screens.
  > `FormattedPreview` component in `DraftReview.tsx` renders skills as `.skill-pills` with `.skill-pill` elements. Matches the done page rendering in `App.tsx`.
* [x] Education entries separated by `;` or `\n` display as distinct blocks with visual dividers.
  > Both `DraftReview.tsx` (`FormattedPreview`) and `App.tsx` (done page) split on `/[;\n]/` regex. Backend `_split_entries()` uses the same regex. Entries render in `.edu-entries` with `.edu-entry + .edu-entry` border-top divider.
* [x] Certifications separated by `;` or `\n` display as individual entries with shield icons.
  > Same split logic. Each entry rendered with `.cert-entry` containing a shield-check SVG `.cert-icon`. Template-aware color variants for modern, creative, executive.
* [x] The Draft Review screen uses a click-to-edit toggle: formatted preview by default, TipTap editor on click.
  > `SectionBlock` checks `FORMATTABLE_SECTIONS` (skills, education, certifications). Default: shows `FormattedPreview` with "click to edit" hint. On click: swaps to `SectionEditor` (TipTap). Click-outside or "Done" button returns to formatted view.
* [x] The downloadable `.docx` splits education and certifications on `;` and `\n` into separate paragraphs.
  > Backend utility `_split_entries(text)` uses `re.split(r"[;\n]", text)`. All 5 template builders (classic, modern, minimal, executive, creative) call `_add_separated_entries()` for education and certifications. Modern sidebar uses `_sidebar_text()` per entry with `✓` prefix for certifications.

## REQ-010: Document Quality & PDF Download

* [x] The modern template sidebar covers the full page height in the `.docx`, extending to all pages if content overflows.
  > `_build_modern_resume` sets `row.height = Inches(11)` with `WD_ROW_HEIGHT_RULE.AT_LEAST` and removes `cantSplit` to allow the row to break across pages. Page dimensions explicitly set to 8.5"×11".
* [x] All template builders use consistent paragraph spacing.
  > All 5 builders updated: Normal style `line_spacing = Pt(14)`, `space_after = Pt(6)`. `_add_heading` gets `space_before = Pt(16)`, `space_after = Pt(2)`. `_add_horizontal_rule` gets `space_after = Pt(8)`. Body paragraphs (summary, skills) get explicit `space_after = Pt(6)`.
* [x] Experience blocks have proper indentation for bullet points and spacing between role titles and content.
  > `_add_experience_block`: role title gets `space_before = Pt(8)`, `space_after = Pt(2)`. Bullets get `left_indent = Pt(14)`, `space_after = Pt(2)`. Modern template experience lines similarly updated.
* [x] Download endpoint supports `?format=pdf` (default) and `?format=docx` query parameter.
  > `GET /api/v1/files/{file_name}?format=pdf|docx` in `main.py`. PDF is the default format. Falls back to docx silently if LibreOffice is unavailable.
* [x] PDF conversion uses `docx2pdf` (MS Word on macOS/Windows) with LibreOffice fallback and result caching.
  > `_convert_docx_to_pdf()` uses `docx2pdf.convert()` as primary (works via MS Word AppleScript on macOS). Falls back to LibreOffice headless if `docx2pdf` not installed. Caches result PDF. Previously relied solely on LibreOffice which wasn't available on the user's machine.
* [x] Frontend download buttons default to PDF with a secondary `.docx` option.
  > `getFileDownloadUrl(fileName, format)` updated in `client.ts`. Done page shows primary "Resume PDF" + "Cover Letter PDF" buttons and secondary compact ".docx" buttons.

## REQ-011: HTML-to-Rich-Text in Generated Documents

* [x] A `_add_rich_runs()` utility parses `<b>`, `<strong>`, `<i>`, `<em>` tags into proper bold/italic docx runs.
  > Added `_add_rich_runs()` in `tailor_engine.py` using regex `_KNOWN_TAG_RE` to find formatting tags. Creates separate runs with `bold=True`/`italic=True` for tagged segments. Fast path when no `<` in text.
* [x] Unknown/unsupported HTML tags are silently stripped from the output.
  > The regex matches both known tags (b/strong/i/em/u) and any other `<...>` tag. Known tags toggle bold/italic depth; unknown tags are skipped (text between them is preserved, the tag itself is dropped).
* [x] All five resume template builders and all five cover letter builders use `_add_rich_runs()` for content paragraphs.
  > Every `doc.add_paragraph(text)` and `p.add_run(text)` call replaced with `p = doc.add_paragraph(); _add_rich_runs(p, text, ...)` across classic, modern, minimal, executive, creative resume and cover letter builders.
* [x] Experience blocks, separated entries, sidebar text, and main text all process HTML correctly.
  > `_add_experience_block()`, `_add_separated_entries()`, modern `_sidebar_text()`, modern `_main_text()` all updated to use `_add_rich_runs()`. Added `_strip_html()` utility for empty-line checks on HTML content.
