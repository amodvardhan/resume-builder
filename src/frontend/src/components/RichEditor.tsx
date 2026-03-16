import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useState } from "react";

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function MenuBar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${
      active
        ? "bg-brand/10 text-brand"
        : "text-secondary hover:bg-gray-100 hover:text-primary"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border-muted px-3 py-2">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive("bold"))}
        title="Bold"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive("italic"))}
        title="Italic"
      >
        <em>I</em>
      </button>
      <div className="mx-1 h-4 w-px bg-border-muted" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btnClass(editor.isActive("heading", { level: 2 }))}
        title="Heading 2"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btnClass(editor.isActive("heading", { level: 3 }))}
        title="Heading 3"
      >
        H3
      </button>
      <div className="mx-1 h-4 w-px bg-border-muted" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btnClass(editor.isActive("bulletList"))}
        title="Bullet List"
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btnClass(editor.isActive("orderedList"))}
        title="Ordered List"
      >
        1. List
      </button>
    </div>
  );
}

export default function RichEditor({ value, onChange, placeholder }: RichEditorProps) {
  const [isFocused, setIsFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Paste the job description here — formatting is preserved",
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-3 min-h-[200px] focus:outline-none text-primary",
      },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData("text/html");
        if (html) {
          const clean = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
              "p", "br", "strong", "b", "em", "i", "u",
              "h1", "h2", "h3", "h4", "h5", "h6",
              "ul", "ol", "li", "a", "blockquote",
            ],
            ALLOWED_ATTR: ["href"],
          });
          editor?.commands.insertContent(clean);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  const resetEditor = useCallback(() => {
    if (editor && !value && editor.getHTML() !== "<p></p>") {
      editor.commands.clearContent();
    }
  }, [editor, value]);

  useEffect(() => {
    resetEditor();
  }, [resetEditor]);

  return (
    <div>
      <label className="block text-xs font-medium text-secondary">
        Job Description
      </label>
      <div
        className={`mt-1.5 overflow-hidden rounded-xl border bg-surface transition-all duration-200 ${
          isFocused ? "border-brand ring-1 ring-brand/20" : "border-border-muted"
        }`}
      >
        <div
          className={`transition-all duration-200 ${
            isFocused ? "max-h-20 opacity-100" : "max-h-0 opacity-0 overflow-hidden"
          }`}
        >
          <MenuBar editor={editor} />
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
