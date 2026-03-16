Owner: UX/UI Designer
Project: Meridian Resume Engine
Target Vibe: Premium, Minimalist, High-Utility
Version: 2.0.0

## 1. Design Philosophy & Layout
**The Golden Rule:** Content is the interface. Remove all unnecessary borders, heavy drop shadows, and decorative elements.

**Layout Structure:**
* **Left:** 250px Collapsible "History & Reference" Sidebar (Subtle frosted glass effect).
* **Center:** Maximum 800px wide reading/editing container to maintain optimal line length for document preview.

**Transitions:** All state changes (opening a modal, sliding a toggle) must use a standard `duration-200 ease-in-out` Tailwind transition to feel responsive but not rushed.

## 2. Typography & Color Tokens (Tailwind)
We rely on high-contrast, highly legible typography to make the application feel professional.

**Font Stack:** `font-sans` mapped to Inter, SF Pro Display, or Roboto.

**Colors:**
* `bg-background`: #FAFAFA (Off-white, reduces eye strain compared to pure white).
* `text-primary`: #111827 (Deep gray/black for crisp readability).
* `text-secondary`: #6B7280 (For timestamps and metadata).
* `accent-brand`: #0F172A (Slate-900 for primary buttons — no loud colors, keep it sophisticated).
* `surface-card`: #FFFFFF with a very subtle shadow: `shadow-sm border border-gray-100`.

## 3. Component Specifications (Shadcn UI overrides)

### 3.1. The "Resume Drop" (Resume Upload Area) — NEW
The primary upload zone where users provide their **latest resume** (the content source).

* **Position:** Top of the center pane, above the template upload. This is the first action the user takes.
* **Visuals:** A prominent dashed border area (`border-blue-200 hover:border-blue-400`) with `bg-blue-50/50` background. Slightly larger than the template drop zone to emphasize importance.
* **Icon:** A clean document-with-arrow-up icon (not a generic cloud icon).
* **Label:** `"Drop your latest resume here"` with subtext `"Supports .docx and .pdf"`.
* **Accepted formats:** `.docx`, `.pdf`.
* **Post-upload state:** The drop zone collapses into a compact "pill" showing filename, file type badge (DOCX/PDF), and a replace button (circular refresh icon). A subtle green checkmark indicates the resume is loaded.
* **Constraint:** The tailor button must remain disabled until both a resume AND a template are uploaded.

### 3.2. The "Template Drop" (Template Upload Area)
Where users provide the `.docx` format template with `{{TAGS}}`.

* **Position:** Below the Resume Drop zone.
* **Visuals:** A dashed border area (`border-gray-200 hover:border-gray-400`) with `bg-gray-50`.
* **Label:** `"Drop your resume template (.docx with {{TAGS}})"` with subtext `"This defines the output format"`.
* **Interaction:** On drag-over, the background slightly darkens, and the border turns solid.
* **Constraint:** No massive upload icons. Use a simple, elegant document icon.

### 3.3. The Rich JD Editor (Job Description) — NEW
Replaces the plain textarea with a rich HTML editor.

* **Library:** TipTap (headless, fully customizable, React-native).
* **Visuals:**
  * Minimal floating toolbar: Bold, Italic, Bullet List, Ordered List, Heading (H2/H3 only). No color pickers, no font selectors.
  * Editor area styled as `surface-card` with `min-h-[200px]` and `prose prose-sm` typography.
  * Placeholder text: `"Paste the job description here — formatting is preserved"`.
* **Behavior:**
  * Paste from web preserves structural HTML (headings, lists, bold) but strips styles, scripts, and iframes.
  * Sanitization via DOMPurify on paste.
  * The toolbar auto-hides when the editor is not focused, showing only on hover/focus for a cleaner look.
* **Constraint:** The editor must feel native to the app — no "embedded widget" aesthetic. It should look like a slightly enhanced textarea.

### 3.4. The Sentiment Slider (Cover Letter Control)

* **Visuals:** A thin, sleek slider track.
* **Labels:** Clean, micro-typography (`text-xs uppercase tracking-wider`).
  * Left: FORMAL & DIRECT
  * Middle: BALANCED
  * Right: MISSION-DRIVEN & EMPATHETIC
* **Interaction:** As the user moves the slider, a subtle text hint updates below it (e.g., "Focuses on strict impact metrics" vs. "Focuses on alignment with organizational values").

## 4. User Flow: New Application (Primary Path)

**Step 1 — Upload Resume:** User drops their latest resume (`.docx` or `.pdf`). The zone collapses to a success pill.

**Step 2 — Upload Template:** User drops their `.docx` template. The zone collapses to a success pill.

**Step 3 — Fill JD:** User pastes the job description into the rich HTML editor. Enters job title and organization.

**Step 4 — Set Tone:** User adjusts the Sentiment Slider.

**Step 5 — Tailor:** User clicks "Tailor Resume & Cover Letter". Skeleton loaders appear while the LLM processes.

## 5. User Flow: The Reference Engine (< 3 Clicks)
To ensure the "Clone Previous Application" feature is seamless:

**Click 1 (The Sidebar):** User clicks a past application card in the left sidebar (e.g., "UNHCR P4 - Nov 2025").

**The Context View:** The center pane smoothly updates to show the details of that past application. A primary button appears: "Use as Baseline for New Application".

**Click 2 (The Action):** User clicks the button.

**The State Change:** The center pane instantly transforms into the "New Application" screen, but the Template and Resume fields are automatically pre-filled and locked with a subtle checkmark indicating the context is loaded.

## 6. Strict Frontend Constraints

* **No Modals for Core Workflows:** Do not hide the Job Description or Resume Preview inside modals. Side-by-side or stacked clean layouts only.
* **Loading States:** No generic spinners. Use skeleton loaders (`animate-pulse bg-gray-200`) that mimic the shape of the text being generated by the LangChain engine.
* **Responsiveness:** The layout must gracefully collapse into a single column on mobile, hiding the History sidebar behind a hamburger menu.
* **Disabled State:** The "Tailor" button must be disabled with a tooltip explaining what's missing (e.g., "Upload your resume first") until all required inputs are provided.