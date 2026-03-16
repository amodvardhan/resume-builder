# Global Architecture & API Contract
**Owner:** Technical Architect
**Project:** Resume Builder
**Version:** 2.0.0
**Stack:** React-Query (Frontend) -> FastAPI (Backend) -> PostgreSQL (Database)

## 1. System Context
The application is a localized, high-precision resume tailoring engine. The user provides **two inputs**: (1) their **latest resume** (the content source containing real experience/achievements) and (2) a **template** (the `.docx` format blueprint with `{{TAGS}}`). The system extracts content from the resume, tailors it to a target Job Description using LLM intelligence, and injects the result into the template — guaranteeing zero layout degradation and ATS compatibility.

### Core Components:
1.  **Frontend (UI Layer):** React application strictly utilizing React-Query for server state management. No complex client-side state beyond UI toggles.
2.  **Backend (Service Layer):** FastAPI application orchestrating PostgreSQL queries, document parsing (`python-docx`, `pdfplumber`), and LLM interactions (`LangChain`).
3.  **Database (Data Layer):** Local PostgreSQL instance storing user profiles, uploaded resumes, template metadata, and application history.

## 2. Architectural Principles & Constraints
* **Two-Input Model:** Every tailoring operation requires both a **resume** (content source) and a **template** (format blueprint). These are distinct uploads serving distinct purposes.
* **Template Immutability:** The system will NOT generate documents from scratch. It will read `.docx` templates, locate predefined merge tags (e.g., `{{SUMMARY}}`, `{{EXPERIENCE_1}}`), and inject LLM-tailored text.
* **Resume Immutability:** The uploaded resume is a read-only content source. It is parsed for text extraction but never modified.
* **Stateless AI:** The LangChain orchestration must remain stateless. All historical context (Core Areas, resume text, previous applications) must be explicitly fetched from PostgreSQL and injected into the prompt chain by the Backend Lead.
* **No Self-Invention:** Leads must strictly map their implementations to the endpoints defined in Section 3.

## 3. API Contract (The "Law")

### 3.1. User & Profile Management
**`GET /api/v1/users/{user_id}`**
* **Purpose:** Fetch the user and their master "Core Areas".
* **Response (200 OK):**
    ```json
    {
      "id": "uuid",
      "full_name": "string",
      "email": "string",
      "core_skills": ["string"]
    }
    ```

### 3.2. Template Management
**`POST /api/v1/templates/upload`**
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

## 4. Integration Specifications
* **LLM Integration:** Backend will use `ChatOpenAI` (or specified LangChain LLM) with a temperature set to 0.4 for resume facts (precision) and 0.7 for the cover letter (emotion/human sentence generation).
* **Document Processing:** Backend will strictly use `python-docx` to iterate through paragraphs and tables, replacing `{{TAGS}}` with generated content to preserve XML styling for ATS parsers.
* **Resume Parsing:**
  * `.docx` — `python-docx` to extract paragraph and table text.
  * `.pdf` — `pdfplumber` to extract text with layout awareness.
  * Extracted text is stored in `resumes.extracted_text` for instant retrieval during tailoring.
* **HTML→Text Conversion:** The backend must convert rich HTML job descriptions to structured plain text before injecting into LLM prompts. Use `beautifulsoup4` with a custom converter that preserves semantic structure (headings, lists, emphasis).

## 5. AI Orchestration Layer (LangChain)

**Strict Constraint:** The Backend Lead is forbidden from using raw openai or anthropic SDK clients directly. All LLM interactions MUST be routed through LangChain to ensure modularity, prompt versioning, and deterministic output parsing.

### Agentic Tailoring Flow:

1. **Resume Content Loader:** Backend fetches `extracted_text` from the `resumes` table for the given `resume_id`. This text is the factual basis — the LLM must not invent experience.

2. **JD Processing:** Backend converts `job_description_html` to structured plain text, preserving bullets and headings for semantic clarity in the prompt.

3. **Prompt Templates:** The system must use strictly defined `ChatPromptTemplate` structures. The prompt includes: (a) resume text, (b) processed JD text, (c) user's `core_skills`, (d) sentiment directive, and (e) format instructions from `PydanticOutputParser`.

4. **Structured Output (Guardrails):** LangChain's `PydanticOutputParser` must be used. The LLM must return a strict JSON object where keys map exactly to the `{{TAGS}}` in the Word document.

5. **Memory / Context Injection:** When a user requests to "Clone previous application," the Backend Lead will fetch the history from Postgres and inject it as `SystemMessage` context into the LangChain pipeline, ensuring the LLM uses the historical tailored points as its baseline.