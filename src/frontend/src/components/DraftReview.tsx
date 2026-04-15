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
import type { ResumeContactInfo, TailorPreviewResponse } from "../types/api";
import type { TemplateStyle } from "../constants/templateStyles";
import { getTemplatePreviewHeader, templateDisplayName } from "../constants/templateStyles";
import ExportFidelityNote from "./ExportFidelityNote";
import A4PageRail from "./A4PageRail";
import ResumeIdentityPanel from "./ResumeIdentityPanel";

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface DraftReviewProps {
  draft: TailorPreviewResponse;
  templateStyle?: TemplateStyle;
  /** Optional headshot (object URL) from Profile — matches PDF/DOCX export */
  profilePhotoSrc?: string | null;
  /** Name, LinkedIn, country, phone, email from Profile — matches PDF/DOCX */
  resumeContact?: ResumeContactInfo | null;
  onConfirm: (edited: TailorPreviewResponse) => void;
  onBack: () => void;
  onRegenerate?: () => void;
  onRegenerateSection?: (sectionId: string, currentContent: string, userInstruction?: string) => Promise<string>;
  isConfirming: boolean;
  isRegenerating?: boolean;
  error?: string | null;
}

type SourceType = "extracted" | "tailored" | "generated";

interface SectionDef {
  id: string;
  label: string;
  source: SourceType;
  experienceIndex?: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Dynamic section builder
   ═══════════════════════════════════════════════════════════════════════ */

function buildResumeSections(draft: TailorPreviewResponse): SectionDef[] {
  const sections: SectionDef[] = [
    { id: "summary", label: "Professional Summary", source: "tailored" },
  ];

  (draft.experiences || []).forEach((_, i) => {
    sections.push({
      id: `experience_${i}`,
      label: `Experience — Role ${i + 1}`,
      source: "tailored",
      experienceIndex: i,
    });
  });

  sections.push(
    { id: "skills", label: "Skills", source: "extracted" },
    { id: "education", label: "Education", source: "extracted" },
  );

  if (draft.certifications) {
    sections.push({
      id: "certifications",
      label: "Certifications",
      source: "extracted",
    });
  }

  return sections;
}

const COVER_LETTER_SECTION: SectionDef = {
  id: "cover_letter",
  label: "Cover Letter",
  source: "generated",
};

function getContent(data: TailorPreviewResponse, section: SectionDef): string {
  if (section.experienceIndex !== undefined) {
    return data.experiences[section.experienceIndex] || "";
  }
  switch (section.id) {
    case "summary":
      return data.summary;
    case "skills":
      return data.skills;
    case "education":
      return data.education;
    case "certifications":
      return data.certifications;
    case "cover_letter":
      return data.cover_letter;
    default:
      return "";
  }
}

function setContent(
  prev: TailorPreviewResponse,
  section: SectionDef,
  text: string,
): TailorPreviewResponse {
  if (section.experienceIndex !== undefined) {
    const newExps = [...prev.experiences];
    newExps[section.experienceIndex] = text;
    return { ...prev, experiences: newExps };
  }
  return { ...prev, [section.id]: text };
}

/* ═══════════════════════════════════════════════════════════════════════
   Source badge / accent config
   ═══════════════════════════════════════════════════════════════════════ */

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

function textToHtml(text: string, sectionId?: string): string {
  if (!text?.trim()) return "<p></p>";

  const isExperience = sectionId?.startsWith("experience_");
  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;
  let firstContent = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { html.push("</ul>"); inList = false; }
      continue;
    }

    const isBullet = /^[•\-–]\s/.test(trimmed);

    if (isBullet) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${trimmed.replace(/^[•\-–]\s*/, "")}</li>`);
      firstContent = false;
    } else {
      if (inList) { html.push("</ul>"); inList = false; }
      if (isExperience && firstContent && trimmed.includes(" | ")) {
        html.push(`<h3>${trimmed}</h3>`);
      } else {
        html.push(`<p>${trimmed}</p>`);
      }
      firstContent = false;
    }
  }

  if (inList) html.push("</ul>");
  return html.join("") || "<p></p>";
}

function extractText(editor: Editor): string {
  const parts: string[] = [];
  editor.state.doc.content.forEach((node) => {
    if (node.type.name === "bulletList" || node.type.name === "orderedList") {
      const bullets: string[] = [];
      node.content.forEach((li) => {
        bullets.push("• " + li.textContent);
      });
      parts.push(bullets.join("\n"));
    } else if (node.textContent) {
      parts.push(node.textContent);
    }
  });
  return parts.join("\n\n");
}

function formatOriginalText(raw: string): string[] {
  if (!raw) return [];
  return raw.split("\n").filter((line) => line.trim() !== "");
}

/* ═══════════════════════════════════════════════════════════════════════
   SectionEditor — one TipTap instance per document section
   ═══════════════════════════════════════════════════════════════════════ */

const SectionEditor = memo(function SectionEditor({
  initialContent,
  sectionId,
  onChange,
  onFocus,
}: {
  initialContent: string;
  sectionId?: string;
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
    content: textToHtml(initialContent, sectionId),
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
   Breadcrumb — progress indicator with compare + regenerate toggles
   ═══════════════════════════════════════════════════════════════════════ */

function Breadcrumb({
  hasChanges,
  showCompare,
  onToggleCompare,
  hasOriginal,
  onRegenerate,
  isRegenerating,
}: {
  hasChanges: boolean;
  showCompare: boolean;
  onToggleCompare: () => void;
  hasOriginal: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}) {
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

      <div className="flex items-center gap-2">
        {hasChanges && (
          <span className="rounded-full bg-accent-light px-2.5 py-0.5 text-[10px] font-semibold text-accent">
            Unsaved edits
          </span>
        )}

        {hasOriginal && (
          <button
            onClick={onToggleCompare}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
              showCompare
                ? "bg-brand/10 text-brand"
                : "text-secondary hover:bg-muted hover:text-primary"
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="14" y="3" width="7" height="18" rx="1" />
            </svg>
            {showCompare ? "Hide Original" : "Compare with Original"}
          </button>
        )}

        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-1.5 rounded-lg bg-accent-light px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
          >
            {isRegenerating ? (
              <MiniSpinner />
            ) : (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0115-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 01-15 6.7L3 16" />
              </svg>
            )}
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Section Nav — left sidebar showing document structure
   ═══════════════════════════════════════════════════════════════════════ */

function SectionNav({
  resumeSections,
  activeSection,
  edited,
  draft,
  onNavigate,
}: {
  resumeSections: SectionDef[];
  activeSection: string | null;
  edited: TailorPreviewResponse;
  draft: TailorPreviewResponse;
  onNavigate: (id: string) => void;
}) {
  const allSections = useMemo(
    () => [...resumeSections, COVER_LETTER_SECTION],
    [resumeSections],
  );

  const navBtn = (section: SectionDef) => {
    const isActive = activeSection === section.id;
    const isEdited =
      getContent(edited, section) !== getContent(draft, section);
    return (
      <button
        key={section.id}
        onClick={() => onNavigate(section.id)}
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
      <div className="space-y-0.5">{resumeSections.map(navBtn)}</div>

      <div className="my-3 border-t border-border-light" />

      <p className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-secondary/50">
        Cover Letter
      </p>
      {navBtn(COVER_LETTER_SECTION)}

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

      <div className="mt-6 rounded-lg border border-border-light bg-muted p-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-secondary/50 mb-1.5">
          Sections
        </p>
        <p className="text-[10px] text-secondary leading-relaxed">
          {allSections.length} sections detected from your resume
        </p>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Section Block — heading + editor rendered inside a document page
   ═══════════════════════════════════════════════════════════════════════ */

function RegenPrompt({
  onSubmit,
  onCancel,
  isRegenerating,
}: {
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
  isRegenerating?: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="mt-2 rounded-lg border border-accent/20 bg-accent-light/30 p-3 shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={inputRef}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="How should I improve this? (leave empty for default AI regeneration)"
        rows={2}
        disabled={isRegenerating}
        className="w-full resize-none rounded-md border border-border-muted bg-surface px-3 py-2 text-xs text-primary placeholder:text-secondary/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit(instruction);
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[9px] text-secondary/50">
          {"\u2318"}+Enter to submit
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onCancel}
            disabled={isRegenerating}
            className="rounded px-2.5 py-1 text-[10px] font-medium text-secondary transition-colors hover:text-primary disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(instruction)}
            disabled={isRegenerating}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {isRegenerating ? <MiniSpinner /> : null}
            {isRegenerating ? "Working…" : instruction.trim() ? "Regenerate with Instructions" : "Regenerate"}
          </button>
        </div>
      </div>
    </div>
  );
}

const FORMATTABLE_SECTIONS = new Set(["skills", "education", "certifications"]);

function FormattedPreview({ sectionId, content, onClick }: { sectionId: string; content: string; onClick: () => void }) {
  if (sectionId === "skills") {
    return (
      <div className="formatted-preview" onClick={onClick}>
        <span className="formatted-preview-hint">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          click to edit
        </span>
        <div className="skill-pills">
          {content.split(",").map((s, i) => {
            const trimmed = s.trim();
            return trimmed ? <span key={i} className="skill-pill">{trimmed}</span> : null;
          })}
        </div>
      </div>
    );
  }

  if (sectionId === "education") {
    const entries = content.split(/[;\n]/).filter((l) => l.trim());
    return (
      <div className="formatted-preview" onClick={onClick}>
        <span className="formatted-preview-hint">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          click to edit
        </span>
        <div className="edu-entries">
          {entries.map((entry, i) => (
            <div key={i} className="edu-entry">
              <p className="text-sm leading-relaxed text-primary/85">{entry.trim()}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sectionId === "certifications") {
    const entries = content.split(/[;\n]/).filter((l) => l.trim());
    return (
      <div className="formatted-preview" onClick={onClick}>
        <span className="formatted-preview-hint">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          click to edit
        </span>
        <div className="cert-entries">
          {entries.map((entry, i) => (
            <div key={i} className="cert-entry">
              <svg className="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span className="text-sm leading-relaxed text-primary/85">{entry.trim()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function SectionBlock({
  section,
  isActive,
  isEdited,
  resetKey,
  draftContent,
  onChange,
  onFocus,
  onReset,
  onRegenerate,
  isRegenerating,
  sectionRef,
  useTemplateHeading,
}: {
  section: SectionDef;
  isActive: boolean;
  isEdited: boolean;
  resetKey: number;
  draftContent: string;
  onChange: (text: string) => void;
  onFocus: (editor: Editor) => void;
  onReset: () => void;
  onRegenerate?: (instruction?: string) => void;
  isRegenerating?: boolean;
  sectionRef: (el: HTMLDivElement | null) => void;
  useTemplateHeading?: boolean;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isEditingFormatted, setIsEditingFormatted] = useState(false);
  const badge = SOURCE_BADGE[section.source];
  const isFormattable = FORMATTABLE_SECTIONS.has(section.id);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleRegenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRegenerate) setShowPrompt((p) => !p);
  };

  const handleRegenSubmit = (instruction: string) => {
    onRegenerate?.(instruction || undefined);
    setShowPrompt(false);
  };

  useEffect(() => {
    if (isRegenerating) setShowPrompt(false);
  }, [isRegenerating]);

  useEffect(() => {
    if (!isEditingFormatted || !isFormattable) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsEditingFormatted(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditingFormatted, isFormattable]);

  const regenBtn = onRegenerate && (
    <button
      onClick={handleRegenClick}
      disabled={isRegenerating}
      title="Regenerate this section with optional instructions"
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold transition-all ${
        isRegenerating
          ? "bg-accent-light text-accent opacity-100"
          : showPrompt
            ? "bg-accent-light text-accent opacity-100"
            : "bg-transparent text-secondary opacity-0 hover:bg-accent-light hover:text-accent group-hover:opacity-100"
      }`}
    >
      {isRegenerating ? (
        <MiniSpinner />
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0115-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 01-15 6.7L3 16" />
        </svg>
      )}
      {isRegenerating ? "Regenerating…" : "Regenerate"}
    </button>
  );

  const headingActions = (
    <span className="ml-auto flex items-center gap-1.5">
      {isFormattable && isEditingFormatted && (
        <button
          onClick={() => setIsEditingFormatted(false)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold text-brand opacity-100 transition-all hover:bg-brand-subtle"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
          Done
        </button>
      )}
      {regenBtn}
      {isEdited && (
        <button
          onClick={onReset}
          className="text-[10px] font-medium text-secondary opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
        >
          Reset
        </button>
      )}
    </span>
  );

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        sectionRef(el);
      }}
      data-section={section.id}
      className={`doc-section group relative transition-colors ${
        useTemplateHeading
          ? ""
          : `border-l-[3px] pl-5 ${isActive ? "border-l-brand" : SOURCE_ACCENT[section.source]}`
      } ${isRegenerating ? "opacity-50 pointer-events-none" : ""}`}
    >
      {useTemplateHeading ? (
        <div className="tpl-section-heading flex items-center gap-2">
          <span>{section.label}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold opacity-60 ${badge.cls}`}
          >
            {badge.text}
          </span>
          {isEdited && (
            <span className="rounded bg-accent-light px-1.5 py-0.5 text-[9px] font-semibold text-accent">
              Edited
            </span>
          )}
          {headingActions}
        </div>
      ) : (
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
          {headingActions}
        </div>
      )}

      {isFormattable && !isEditingFormatted ? (
        <FormattedPreview
          sectionId={section.id}
          content={draftContent}
          onClick={() => setIsEditingFormatted(true)}
        />
      ) : (
        <SectionEditor
          key={`${section.id}-${resetKey}`}
          initialContent={draftContent}
          sectionId={section.id}
          onChange={onChange}
          onFocus={onFocus}
        />
      )}

      {showPrompt && !isRegenerating && (
        <RegenPrompt
          onSubmit={handleRegenSubmit}
          onCancel={() => setShowPrompt(false)}
          isRegenerating={isRegenerating}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Comparison Panel — shows original resume text alongside the editor
   ═══════════════════════════════════════════════════════════════════════ */

function ComparisonPanel({
  originalText,
  onClose,
}: {
  originalText: string;
  onClose: () => void;
}) {
  const lines = useMemo(() => formatOriginalText(originalText), [originalText]);

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-border-light bg-surface xl:w-96">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-subtle">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-brand"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-primary">
            Original Resume
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-secondary transition-colors hover:bg-muted hover:text-primary"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-4">
        <div className="space-y-0.5 text-[12px] leading-relaxed text-primary/80">
          {lines.map((line, i) => {
            const isSectionHeader = line.startsWith("[SECTION:");
            const isRoleHeader = line.startsWith("[ROLE:");

            if (isSectionHeader) {
              const label = line.replace("[SECTION:", "").replace("]", "").trim();
              return (
                <div key={i} className="mt-4 first:mt-0">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-brand">
                    {label}
                  </div>
                </div>
              );
            }

            if (isRoleHeader) {
              const label = line.replace("[ROLE:", "").replace("]", "").trim();
              return (
                <div
                  key={i}
                  className="mt-2 text-[11px] font-semibold text-primary"
                >
                  {label}
                </div>
              );
            }

            const isBullet =
              line.startsWith("•") ||
              line.startsWith("-") ||
              line.startsWith("–");

            return (
              <p
                key={i}
                className={isBullet ? "pl-3 text-secondary" : "text-primary/80"}
              >
                {line}
              </p>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DraftReview — the Document Studio
   ═══════════════════════════════════════════════════════════════════════ */

export default function DraftReview({
  draft,
  templateStyle = "classic",
  profilePhotoSrc,
  resumeContact,
  onConfirm,
  onBack,
  onRegenerate,
  onRegenerateSection,
  isConfirming,
  isRegenerating,
  error,
}: DraftReviewProps) {
  const [edited, setEdited] = useState<TailorPreviewResponse>({ ...draft });
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [showCompare, setShowCompare] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const resumeSections = useMemo(() => buildResumeSections(draft), [draft]);
  const allSections = useMemo(
    () => [...resumeSections, COVER_LETTER_SECTION],
    [resumeSections],
  );
  const resumeA4Specs = useMemo(
    () => resumeSections.map((s) => ({ id: s.id, label: s.label })),
    [resumeSections],
  );

  useEffect(() => {
    setEdited({ ...draft });
    setResetKeys({});
  }, [draft]);

  const handleSectionChange = useCallback(
    (section: SectionDef, text: string) => {
      setEdited((prev) => setContent(prev, section, text));
    },
    [],
  );

  const handleSectionFocus = useCallback(
    (section: SectionDef, editor: Editor) => {
      setActiveEditor(editor);
      setActiveSection(section.id);
    },
    [],
  );

  const handleReset = useCallback(
    (section: SectionDef) => {
      setEdited((prev) => setContent(prev, section, getContent(draft, section)));
      setResetKeys((prev) => ({
        ...prev,
        [section.id]: (prev[section.id] || 0) + 1,
      }));
    },
    [draft],
  );

  const handleSectionRegenerate = useCallback(
    (section: SectionDef, userInstruction?: string) => {
      if (!onRegenerateSection || regeneratingSection) return;
      const currentContent = getContent(edited, section);
      setRegeneratingSection(section.id);
      onRegenerateSection(section.id, currentContent, userInstruction)
        .then((newContent) => {
          setEdited((prev) => setContent(prev, section, newContent));
          setResetKeys((prev) => ({
            ...prev,
            [section.id]: (prev[section.id] || 0) + 1,
          }));
        })
        .finally(() => setRegeneratingSection(null));
    },
    [onRegenerateSection, regeneratingSection, edited],
  );

  const scrollToSection = useCallback((id: string) => {
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const hasChanges = allSections.some(
    (s) => getContent(edited, s) !== getContent(draft, s),
  );

  const hasOriginal = !!draft.original_resume_text;

  const useTpl = templateStyle !== "classic" || true;

  const renderSectionBlock = (section: SectionDef) => (
    <SectionBlock
      key={section.id}
      section={section}
      isActive={activeSection === section.id}
      isEdited={getContent(edited, section) !== getContent(draft, section)}
      resetKey={resetKeys[section.id] || 0}
      draftContent={getContent(edited, section)}
      onChange={(text) => handleSectionChange(section, text)}
      onFocus={(editor) => handleSectionFocus(section, editor)}
      onReset={() => handleReset(section)}
      onRegenerate={onRegenerateSection ? (instruction?: string) => handleSectionRegenerate(section, instruction) : undefined}
      isRegenerating={regeneratingSection === section.id}
      sectionRef={(el) => {
        sectionRefs.current[section.id] = el;
      }}
      useTemplateHeading={useTpl}
    />
  );

  const tplCls = `tpl-${templateStyle}`;

  const mainSections = resumeSections.filter(
    (s) =>
      s.id === "summary" || s.experienceIndex !== undefined,
  );
  const sidebarSections = resumeSections.filter(
    (s) =>
      s.id !== "summary" && s.experienceIndex === undefined,
  );
  const isModern = templateStyle === "modern";

  const formatLabel = templateDisplayName(templateStyle);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Top chrome: breadcrumb + toolbar */}
      <div className="sticky top-0 z-20 shadow-sm">
        <Breadcrumb
          hasChanges={hasChanges}
          showCompare={showCompare}
          onToggleCompare={() => setShowCompare((p) => !p)}
          hasOriginal={hasOriginal}
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
        <Toolbar editor={activeEditor} />
      </div>

      {/* Main body: sidebar + canvas + comparison panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <SectionNav
          resumeSections={resumeSections}
          activeSection={activeSection}
          edited={edited}
          draft={draft}
          onNavigate={scrollToSection}
        />

        {/* Document canvas */}
        <main className="flex-1 overflow-y-auto bg-[#eaecf0]">
          <div className="mx-auto w-full max-w-[min(100%,calc(210mm+5rem))] px-3 py-8 sm:px-6">
            {/* Template badge */}
            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-semibold text-secondary shadow-sm">
                Format: {formatLabel}
              </span>
            </div>

            <ExportFidelityNote className="mb-5 mx-auto max-w-[min(100%,210mm)]" />

            {/* Resume page */}
            <A4PageRail className="mx-auto" sections={resumeA4Specs}>
            <div className={`doc-page doc-page--a4-zones rounded ${tplCls}`}>
              {isModern ? (
                <div className="tpl-grid">
                  <div className="tpl-sidebar space-y-5">
                    {profilePhotoSrc ? (
                      <div className="flex justify-center pb-1">
                        <img
                          src={profilePhotoSrc}
                          alt=""
                          className="h-[7.25rem] w-[7.25rem] rounded-full border-2 border-[rgba(51,107,135,0.25)] object-cover shadow-sm"
                        />
                      </div>
                    ) : null}
                    <ResumeIdentityPanel contact={resumeContact} variant="modern" />
                    {sidebarSections.map(renderSectionBlock)}
                  </div>
                  <div className="tpl-main space-y-6">
                    {mainSections.map(renderSectionBlock)}
                  </div>
                </div>
              ) : (
                <div className="px-12 py-10 sm:px-16 sm:py-12">
                  <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <ResumeIdentityPanel contact={resumeContact} variant="strip" />
                    </div>
                    {profilePhotoSrc ? (
                      <div className="flex shrink-0 justify-end sm:pt-0">
                        <img
                          src={profilePhotoSrc}
                          alt=""
                          className="h-[7.25rem] w-[7.25rem] rounded-full border-2 border-border-muted object-cover shadow-sm"
                        />
                      </div>
                    ) : null}
                  </div>
                  {getTemplatePreviewHeader(templateStyle) && (
                    <div className="tpl-header">
                      <div
                        className={
                          templateStyle === "executive" ||
                          templateStyle === "creative" ||
                          templateStyle === "nova"
                            ? "text-[10px] font-medium uppercase tracking-widest text-white/90"
                            : "text-[10px] font-medium uppercase tracking-widest text-secondary/75"
                        }
                      >
                        {getTemplatePreviewHeader(templateStyle)}
                      </div>
                    </div>
                  )}
                  <div className="space-y-7">
                    {resumeSections.map(renderSectionBlock)}
                  </div>
                </div>
              )}
            </div>
            </A4PageRail>

            {/* Page break */}
            <div className="my-5 flex items-center justify-center">
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-secondary/40">
                <div className="h-px w-10 bg-secondary/20" />
                Cover Letter
                <div className="h-px w-10 bg-secondary/20" />
              </div>
            </div>

            {/* Cover letter page */}
            <A4PageRail
              className="mx-auto"
              sections={[
                { id: COVER_LETTER_SECTION.id, label: COVER_LETTER_SECTION.label },
              ]}
            >
            <div className={`doc-page doc-page--a4-zones rounded ${tplCls}`}>
              <div className="px-12 py-10 sm:px-16 sm:py-12">
                {renderSectionBlock(COVER_LETTER_SECTION)}
              </div>
            </div>
            </A4PageRail>

            <div className="h-8" />
          </div>
        </main>

        {/* Comparison panel (slides in from right) */}
        {showCompare && hasOriginal && (
          <ComparisonPanel
            originalText={draft.original_resume_text}
            onClose={() => setShowCompare(false)}
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border-muted bg-surface">
        <div className="mx-auto flex max-w-[210mm] items-center justify-between px-6 py-3">
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
   Spinner variants
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

function MiniSpinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
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
