import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  memo,
  type ReactNode,
} from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import type { TailorPreviewResponse } from "../types/api";

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface DraftReviewProps {
  draft: TailorPreviewResponse;
  onConfirm: (edited: TailorPreviewResponse) => void;
  onBack: () => void;
  isConfirming: boolean;
  error?: string | null;
}

type SourceType = "extracted" | "tailored" | "generated";

interface SectionDef {
  key: keyof TailorPreviewResponse;
  label: string;
  source: SourceType;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const RESUME_SECTIONS: SectionDef[] = [
  { key: "summary", label: "Professional Summary", source: "tailored" },
  { key: "experience_1", label: "Experience — Role 1", source: "extracted" },
  { key: "experience_2", label: "Experience — Role 2", source: "extracted" },
  { key: "experience_3", label: "Experience — Role 3", source: "extracted" },
  { key: "skills", label: "Skills", source: "extracted" },
  { key: "education", label: "Education", source: "extracted" },
];

const COVER_LETTER_SECTION: SectionDef = {
  key: "cover_letter",
  label: "Cover Letter",
  source: "generated",
};

const ALL_SECTIONS = [...RESUME_SECTIONS, COVER_LETTER_SECTION];

const SOURCE_BADGE: Record<SourceType, { text: string; cls: string }> = {
  extracted: { text: "From Resume", cls: "bg-brand-subtle text-brand" },
  tailored: { text: "AI-Tailored", cls: "bg-accent-light text-accent" },
  generated: { text: "AI-Generated", cls: "bg-success-light text-success" },
};

const SOURCE_ACCENT: Record<SourceType, string> = {
  extracted: "border-l-brand/40",
  tailored: "border-l-accent/40",
  generated: "border-l-success/40",
};

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function textToHtml(text: string): string {
  if (!text?.trim()) return "<p></p>";
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function extractText(editor: Editor): string {
  return editor.state.doc.textBetween(
    0,
    editor.state.doc.content.size,
    "\n\n",
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SectionEditor — one TipTap instance per document section
   ═══════════════════════════════════════════════════════════════════════ */

const SectionEditor = memo(function SectionEditor({
  initialContent,
  onChange,
  onFocus,
}: {
  initialContent: string;
  onChange: (text: string) => void;
  onFocus: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: textToHtml(initialContent),
    editorProps: {
      attributes: {
        class: "doc-editor-content",
      },
    },
    onUpdate: ({ editor: e }) => onChange(extractText(e)),
    onFocus: ({ editor: e }) => onFocus(e),
  });

  return <EditorContent editor={editor} />;
});

/* ═══════════════════════════════════════════════════════════════════════
   SVG Icon primitives
   ═══════════════════════════════════════════════════════════════════════ */

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const IconUndo = () => (
  <Svg>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
  </Svg>
);
const IconRedo = () => (
  <Svg>
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13" />
  </Svg>
);
const IconBulletList = () => (
  <Svg>
    <line x1="9" y1="6" x2="20" y2="6" />
    <line x1="9" y1="12" x2="20" y2="12" />
    <line x1="9" y1="18" x2="20" y2="18" />
    <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);
const IconOrderedList = () => (
  <Svg>
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 7V3l-1 1" />
    <path d="M3 13h2l-2 2h2" />
    <path d="M3 19h2l-2-2h2" />
  </Svg>
);
const IconAlignLeft = () => (
  <Svg>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="15" y2="12" />
    <line x1="3" y1="18" x2="18" y2="18" />
  </Svg>
);
const IconAlignCenter = () => (
  <Svg>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="6" y1="12" x2="18" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </Svg>
);
const IconAlignRight = () => (
  <Svg>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="9" y1="12" x2="21" y2="12" />
    <line x1="6" y1="18" x2="21" y2="18" />
  </Svg>
);

/* ═══════════════════════════════════════════════════════════════════════
   Toolbar — shared formatting ribbon that operates on the active editor
   ═══════════════════════════════════════════════════════════════════════ */

function Toolbar({ editor }: { editor: Editor | null }) {
  const [, setTick] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
      cancelAnimationFrame(rafRef.current);
    };
  }, [editor]);

  const none = !editor;

  const btn = (
    active: boolean,
    onClick: () => void,
    children: ReactNode,
    title: string,
    disabled = false,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled || none}
      className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded px-1 transition-colors ${
        disabled || none
          ? "cursor-default opacity-30"
          : active
            ? "bg-brand/10 text-brand"
            : "text-secondary hover:bg-gray-100 hover:text-primary"
      }`}
    >
      {children}
    </button>
  );

  const sep = <div className="mx-1 h-4 w-px bg-border-muted" />;

  const isLeft =
    editor &&
    !editor.isActive({ textAlign: "center" }) &&
    !editor.isActive({ textAlign: "right" });

  return (
    <div className="flex items-center gap-0.5 border-b border-border-muted bg-surface px-4 py-1">
      {/* Undo / Redo */}
      {btn(
        false,
        () => editor?.chain().focus().undo().run(),
        <IconUndo />,
        "Undo (⌘Z)",
      )}
      {btn(
        false,
        () => editor?.chain().focus().redo().run(),
        <IconRedo />,
        "Redo (⌘⇧Z)",
      )}
      {sep}

      {/* Text style */}
      {btn(
        !!editor?.isActive("bold"),
        () => editor?.chain().focus().toggleBold().run(),
        <span className="text-[13px] font-bold">B</span>,
        "Bold (⌘B)",
      )}
      {btn(
        !!editor?.isActive("italic"),
        () => editor?.chain().focus().toggleItalic().run(),
        <span className="font-serif text-[13px] italic">I</span>,
        "Italic (⌘I)",
      )}
      {btn(
        !!editor?.isActive("underline"),
        () => editor?.chain().focus().toggleUnderline().run(),
        <span className="text-[13px] underline">U</span>,
        "Underline (⌘U)",
      )}
      {btn(
        !!editor?.isActive("strike"),
        () => editor?.chain().focus().toggleStrike().run(),
        <span className="text-[13px] line-through">S</span>,
        "Strikethrough",
      )}
      {sep}

      {/* Headings */}
      {btn(
        !!editor?.isActive("heading", { level: 2 }),
        () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
        <span className="text-[11px] font-bold">H2</span>,
        "Heading 2",
      )}
      {btn(
        !!editor?.isActive("heading", { level: 3 }),
        () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
        <span className="text-[10px] font-bold">H3</span>,
        "Heading 3",
      )}
      {sep}

      {/* Lists */}
      {btn(
        !!editor?.isActive("bulletList"),
        () => editor?.chain().focus().toggleBulletList().run(),
        <IconBulletList />,
        "Bullet List",
      )}
      {btn(
        !!editor?.isActive("orderedList"),
        () => editor?.chain().focus().toggleOrderedList().run(),
        <IconOrderedList />,
        "Numbered List",
      )}
      {sep}

      {/* Alignment */}
      {btn(
        !!isLeft,
        () => editor?.chain().focus().setTextAlign("left").run(),
        <IconAlignLeft />,
        "Align Left",
      )}
      {btn(
        !!editor?.isActive({ textAlign: "center" }),
        () => editor?.chain().focus().setTextAlign("center").run(),
        <IconAlignCenter />,
        "Align Center",
      )}
      {btn(
        !!editor?.isActive({ textAlign: "right" }),
        () => editor?.chain().focus().setTextAlign("right").run(),
        <IconAlignRight />,
        "Align Right",
      )}

      {/* Hint when no editor */}
      {none && (
        <>
          {sep}
          <span className="ml-1 text-[11px] italic text-secondary/50">
            Click a section to begin editing
          </span>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Breadcrumb — progress indicator embedded in the top chrome
   ═══════════════════════════════════════════════════════════════════════ */

function Breadcrumb({ hasChanges }: { hasChanges: boolean }) {
  const chevron = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3 w-3 text-border-hover"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );

  return (
    <div className="flex items-center justify-between border-b border-border-light bg-surface/80 px-4 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[11px] font-medium text-secondary">
        <span className="text-brand">Input</span>
        {chevron}
        <span className="rounded-full bg-brand px-2 py-0.5 text-white">
          Review Draft
        </span>
        {chevron}
        <span>Final Document</span>
      </div>
      {hasChanges && (
        <span className="rounded-full bg-accent-light px-2.5 py-0.5 text-[10px] font-semibold text-accent">
          Unsaved edits
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Section Nav — left sidebar showing document structure
   ═══════════════════════════════════════════════════════════════════════ */

function SectionNav({
  activeSection,
  edited,
  draft,
  onNavigate,
}: {
  activeSection: string | null;
  edited: TailorPreviewResponse;
  draft: TailorPreviewResponse;
  onNavigate: (key: string) => void;
}) {
  const navBtn = (section: SectionDef) => {
    const isActive = activeSection === section.key;
    const isEdited = edited[section.key] !== draft[section.key];
    return (
      <button
        key={section.key}
        onClick={() => onNavigate(section.key)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[11px] transition-colors ${
          isActive
            ? "bg-brand-subtle font-medium text-brand"
            : "text-secondary hover:bg-muted hover:text-primary"
        }`}
      >
        <span className="truncate">{section.label}</span>
        {isEdited && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        )}
      </button>
    );
  };

  return (
    <aside className="hidden w-48 shrink-0 overflow-y-auto border-r border-border-light bg-surface px-3 py-4 lg:block">
      <p className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-secondary/50">
        Resume
      </p>
      <div className="space-y-0.5">{RESUME_SECTIONS.map(navBtn)}</div>

      <div className="my-3 border-t border-border-light" />

      <p className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-secondary/50">
        Cover Letter
      </p>
      {navBtn(COVER_LETTER_SECTION)}

      {/* Source legend */}
      <div className="mt-8 space-y-1.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-secondary/50">
          Source Legend
        </p>
        {(["tailored", "extracted", "generated"] as SourceType[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-sm ${SOURCE_BADGE[s].cls}`}
            />
            <span className="text-[10px] text-secondary">
              {SOURCE_BADGE[s].text}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Section Block — heading + editor rendered inside a document page
   ═══════════════════════════════════════════════════════════════════════ */

function SectionBlock({
  section,
  isActive,
  isEdited,
  resetKey,
  draftContent,
  onChange,
  onFocus,
  onReset,
  sectionRef,
}: {
  section: SectionDef;
  isActive: boolean;
  isEdited: boolean;
  resetKey: number;
  draftContent: string;
  onChange: (text: string) => void;
  onFocus: (editor: Editor) => void;
  onReset: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const badge = SOURCE_BADGE[section.source];

  return (
    <div
      ref={sectionRef}
      className={`doc-section group border-l-[3px] pl-5 transition-colors ${
        isActive ? "border-l-brand" : SOURCE_ACCENT[section.source]
      }`}
    >
      {/* Section heading row */}
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-secondary/70">
          {section.label}
        </h3>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${badge.cls}`}
        >
          {badge.text}
        </span>
        {isEdited && (
          <span className="rounded bg-accent-light px-1.5 py-0.5 text-[9px] font-semibold text-accent">
            Edited
          </span>
        )}
        {isEdited && (
          <button
            onClick={onReset}
            className="ml-auto text-[10px] font-medium text-secondary opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
          >
            Reset
          </button>
        )}
      </div>

      {/* TipTap editor */}
      <SectionEditor
        key={`${section.key}-${resetKey}`}
        initialContent={draftContent}
        onChange={onChange}
        onFocus={onFocus}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DraftReview — the Document Studio
   ═══════════════════════════════════════════════════════════════════════ */

export default function DraftReview({
  draft,
  onConfirm,
  onBack,
  isConfirming,
  error,
}: DraftReviewProps) {
  const [edited, setEdited] = useState<TailorPreviewResponse>({ ...draft });
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* Stable per-section callbacks */
  const changeHandlers = useMemo(
    () =>
      Object.fromEntries(
        ALL_SECTIONS.map((s) => [
          s.key,
          (text: string) =>
            setEdited((prev) => ({ ...prev, [s.key]: text })),
        ]),
      ),
    [],
  );

  const focusHandlers = useMemo(
    () =>
      Object.fromEntries(
        ALL_SECTIONS.map((s) => [
          s.key,
          (editor: Editor) => {
            setActiveEditor(editor);
            setActiveSection(s.key);
          },
        ]),
      ),
    [],
  );

  const handleReset = useCallback(
    (key: keyof TailorPreviewResponse) => {
      setEdited((prev) => ({ ...prev, [key]: draft[key] }));
      setResetKeys((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    },
    [draft],
  );

  const scrollToSection = useCallback((key: string) => {
    sectionRefs.current[key]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const hasChanges = ALL_SECTIONS.some((s) => edited[s.key] !== draft[s.key]);

  const renderSectionBlock = (section: SectionDef) => (
    <SectionBlock
      key={section.key}
      section={section}
      isActive={activeSection === section.key}
      isEdited={edited[section.key] !== draft[section.key]}
      resetKey={resetKeys[section.key] || 0}
      draftContent={draft[section.key]}
      onChange={changeHandlers[section.key]}
      onFocus={focusHandlers[section.key]}
      onReset={() => handleReset(section.key)}
      sectionRef={(el) => {
        sectionRefs.current[section.key] = el;
      }}
    />
  );

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* ── Top chrome: breadcrumb + toolbar ────────────────────── */}
      <div className="sticky top-0 z-20 shadow-sm">
        <Breadcrumb hasChanges={hasChanges} />
        <Toolbar editor={activeEditor} />
      </div>

      {/* ── Main body: sidebar + canvas ─────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <SectionNav
          activeSection={activeSection}
          edited={edited}
          draft={draft}
          onNavigate={scrollToSection}
        />

        {/* Document canvas */}
        <main className="flex-1 overflow-y-auto bg-[#eaecf0]">
          <div className="mx-auto max-w-[860px] px-4 py-8 sm:px-8">
            {/* ── Resume page ──────────────────────────────────── */}
            <div className="doc-page rounded bg-surface">
              <div className="space-y-7 px-12 py-10 sm:px-16 sm:py-12">
                {RESUME_SECTIONS.map(renderSectionBlock)}
              </div>
            </div>

            {/* ── Page break ───────────────────────────────────── */}
            <div className="my-5 flex items-center justify-center">
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-secondary/40">
                <div className="h-px w-10 bg-secondary/20" />
                Page 2 — Cover Letter
                <div className="h-px w-10 bg-secondary/20" />
              </div>
            </div>

            {/* ── Cover letter page ────────────────────────────── */}
            <div className="doc-page rounded bg-surface">
              <div className="px-12 py-10 sm:px-16 sm:py-12">
                {renderSectionBlock(COVER_LETTER_SECTION)}
              </div>
            </div>

            {/* Bottom spacer */}
            <div className="h-8" />
          </div>
        </main>
      </div>

      {/* ── Bottom action bar ───────────────────────────────────── */}
      <div className="shrink-0 border-t border-border-muted bg-surface">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-6 py-3">
          <button
            onClick={onBack}
            disabled={isConfirming}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-secondary transition-colors hover:text-primary disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Editor
          </button>

          <div className="flex items-center gap-3">
            {error && (
              <span className="rounded-lg bg-danger-light px-3 py-1.5 text-xs text-danger">
                {error}
              </span>
            )}
            <button
              onClick={() => onConfirm(edited)}
              disabled={isConfirming}
              className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isConfirming ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Generating Document…
                </span>
              ) : (
                "Confirm & Generate Document"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Spinner
   ═══════════════════════════════════════════════════════════════════════ */

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
