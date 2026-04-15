import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type A4SectionSpec = { id: string; label: string };

function useMmToPx(mm: number): number {
  const [px, setPx] = useState(() => (typeof window !== "undefined" ? 0 : (96 / 25.4) * mm));

  useLayoutEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;left:-9999px;top:0;height:" +
      mm +
      "mm;width:1px;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    if (h > 0) setPx(h);
  }, [mm]);

  return px || (96 / 25.4) * mm;
}

function findSectionEl(root: HTMLElement, id: string): HTMLElement | null {
  for (const el of root.querySelectorAll("[data-section]")) {
    if ((el as HTMLElement).getAttribute("data-section") === id) {
      return el as HTMLElement;
    }
  }
  return null;
}

function truncate(s: string, max = 20): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type Placement = {
  id: string;
  label: string;
  startPage: number;
  endPage: number;
};

function measurePlacements(
  root: HTMLElement,
  specs: A4SectionSpec[],
  step: number,
): Placement[] {
  const cr = root.getBoundingClientRect();
  const out: Placement[] = [];
  for (const { id, label } of specs) {
    const el = findSectionEl(root, id);
    if (!el) continue;
    const er = el.getBoundingClientRect();
    const top = er.top - cr.top + root.scrollTop;
    const bottom = er.bottom - cr.top + root.scrollTop;
    if (step <= 0) continue;
    const startPage = Math.max(1, Math.floor(top / step) + 1);
    const endPage = Math.max(startPage, Math.floor((bottom - 1) / step) + 1);
    out.push({ id, label, startPage, endPage });
  }
  return out;
}

function linesForPage(
  pageNum1: number,
  placements: Placement[],
): { key: string; text: string; title: string }[] {
  const lines: { key: string; text: string; title: string }[] = [];
  for (const p of placements) {
    if (p.endPage < pageNum1 || p.startPage > pageNum1) continue;
    const startsHere = p.startPage === pageNum1;
    const continues =
      p.startPage < pageNum1 && p.endPage >= pageNum1;
    if (startsHere) {
      lines.push({
        key: `${p.id}-start`,
        text: truncate(p.label, 22),
        title: `${p.label} — starts on page ${p.startPage}${
          p.endPage > p.startPage ? `, ends page ${p.endPage}` : ""
        }`,
      });
    } else if (continues) {
      lines.push({
        key: `${p.id}-cont`,
        text: `${truncate(p.label, 16)} (cont.)`,
        title: `${p.label} — continues from page ${p.startPage}`,
      });
    }
  }
  return lines;
}

/**
 * Left gutter: Page N markers + optional per-section page mapping (from [data-section]).
 * Subtle alternating bands behind the sheet clarify A4 vertical zones.
 */
export default function A4PageRail({
  children,
  className = "",
  sections,
}: {
  children: ReactNode;
  className?: string;
  /** When set, each block with matching data-section id is mapped to page ranges. */
  sections?: A4SectionSpec[];
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const pageH = useMmToPx(297);

  const step = pageH > 8 ? pageH : (96 / 25.4) * 297;
  const railH = contentHeight > 0 ? contentHeight : step;
  const pageCount = Math.max(1, Math.ceil(railH / step));

  const runMeasure = useCallback(() => {
    const root = bodyRef.current;
    if (!root) return;
    setContentHeight(root.getBoundingClientRect().height);
    if (sections?.length) {
      setPlacements(measurePlacements(root, sections, step));
    } else {
      setPlacements([]);
    }
  }, [sections, step]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(runMeasure);
    });
    ro.observe(el);
    requestAnimationFrame(runMeasure);
    return () => ro.disconnect();
  }, [runMeasure]);

  return (
    <div
      className={`flex w-full max-w-[calc(210mm+7.5rem)] items-start gap-1.5 sm:gap-2 ${className}`}
    >
      <div
        className="relative min-w-[6.25rem] shrink-0 sm:min-w-[7rem]"
        style={{ height: railH, minHeight: step }}
        aria-hidden
      >
        <div className="pointer-events-none absolute bottom-2 left-[4px] top-2 w-[3px] rounded-full bg-gradient-to-b from-slate-200 via-slate-300/90 to-slate-200 shadow-sm" />
        {Array.from({ length: pageCount }, (_, i) => {
          const pageNum = i + 1;
          const pageLines = placements.length
            ? linesForPage(pageNum, placements)
            : [];
          const show = pageLines.slice(0, 5);
          const rest = pageLines.length - show.length;

          return (
            <div
              key={i}
              className="absolute left-0 right-0 flex flex-col items-stretch gap-1 px-0.5 pt-1"
              style={{
                top: i * step,
                height: step,
              }}
            >
              <div className="ml-0.5 self-center rounded-lg bg-white/95 px-1.5 py-1 text-center shadow-md ring-1 ring-slate-200/90">
                <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">
                  Page
                </p>
                <p className="text-[13px] font-bold tabular-nums leading-tight text-slate-600">
                  {pageNum}
                </p>
              </div>
              {show.length > 0 ? (
                <ul className="mt-0.5 space-y-0.5 pl-0.5 text-left">
                  {show.map((row) => (
                    <li
                      key={row.key}
                      title={row.title}
                      className="list-none text-[7px] leading-tight text-slate-500"
                    >
                      <span className="font-medium text-slate-600">{row.text}</span>
                    </li>
                  ))}
                  {rest > 0 ? (
                    <li className="list-none text-[6.5px] text-slate-400">+{rest} more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        ref={bodyRef}
        className="relative isolate min-w-0 flex-1 [--a4-step:297mm]"
        style={{ ["--a4-step" as string]: `${step}px` }}
      >
        <div className="relative z-[1]">{children}</div>
      </div>
    </div>
  );
}
