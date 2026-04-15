/**
 * Explains A4 preview vs downloads: PDF uses the same template CSS as the server;
 * Word uses its own layout engine and may differ (fonts, bullets, spacing).
 */

export default function ExportFidelityNote({ className = "" }: { className?: string }) {
  return (
    <div
      role="note"
      className={`rounded-lg border border-border-muted/80 bg-surface/80 px-3 py-2 text-[11px] leading-snug text-secondary ${className}`}
    >
      <p className="font-medium text-primary/90">A4 — what you see vs what you download</p>
      <p className="mt-1">
        The canvas is <span className="text-primary/85">A4 width (210 mm)</span>. The left margin lists which sections fall on
        each page (or continue from the previous page); alternating light bands match each{" "}
        <span className="text-primary/85">297 mm</span> sheet for easier scanning.
        The editor is <strong className="font-semibold text-primary/90">one flowing document</strong> — unlike Word, you
        cannot drag blocks between separate on-screen pages; pagination is applied when you export.{" "}
        <strong className="font-semibold text-primary/90">PDF</strong> uses the same template styles as our print layout
        (fonts, colors, spacing, bullets). <strong className="font-semibold text-primary/90">Word (.docx)</strong> uses
        Microsoft Word’s renderer and may differ — use <strong className="font-semibold text-primary/90">PDF</strong> for
        the closest match to this preview.
      </p>
    </div>
  );
}
