import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  TEMPLATE_CATALOG,
  type TemplateCategoryId,
  type TemplateStyle,
  CATEGORY_LABELS,
} from "../constants/templateStyles";

/* ═══════════════════════════════════════════════════════════════════════
   Abstract thumbnails — match each layout’s visual DNA
   ═══════════════════════════════════════════════════════════════════════ */

function TemplateThumbnail({ layout }: { layout: TemplateStyle }) {
  const base = "w-full h-full rounded-[2px]";

  if (layout === "classic") {
    return (
      <div className={`${base} bg-white p-3 flex flex-col gap-1.5`}>
        <div className="h-2.5 w-3/4 rounded-sm bg-primary/20 mx-auto" />
        <div className="h-1 w-1/2 rounded-sm bg-secondary/15 mx-auto" />
        <div className="mt-1 h-px bg-border-muted" />
        <div className="space-y-1">
          <div className="h-1.5 w-1/3 rounded-sm bg-brand/25" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "modern") {
    return (
      <div className={`${base} bg-white flex overflow-hidden`}>
        <div className="w-1/3 bg-brand/8 p-2 flex flex-col gap-1.5">
          <div className="h-5 w-5 rounded-full bg-brand/20 mx-auto" />
          <div className="h-1.5 w-full rounded-sm bg-brand/15" />
          <div className="h-1 w-full rounded-sm bg-brand/10" />
        </div>
        <div className="flex-1 p-2 flex flex-col gap-1">
          <div className="h-2 w-3/4 rounded-sm bg-primary/20" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "minimal") {
    return (
      <div className={`${base} bg-white p-3 flex flex-col gap-1`}>
        <div className="h-2.5 w-2/3 rounded-sm bg-primary/25" />
        <div className="mt-2 space-y-1">
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "executive") {
    return (
      <div className={`${base} bg-white flex flex-col overflow-hidden`}>
        <div className="bg-primary px-2 py-1.5">
          <div className="h-1.5 w-2/3 rounded-sm bg-white/30" />
        </div>
        <div className="p-2 flex flex-col gap-1">
          <div className="h-1.5 w-2/5 rounded-sm bg-brand/30" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "creative") {
    return (
      <div className={`${base} bg-white flex flex-col overflow-hidden`}>
        <div className="bg-linear-to-r from-accent/40 to-brand/35 px-2 py-1.5">
          <div className="h-2 w-1/2 rounded-sm bg-white/35" />
        </div>
        <div className="p-2 flex flex-col gap-1">
          <div className="flex gap-1">
            <div className="h-2.5 w-2.5 rounded-full bg-accent/20" />
            <div className="h-2.5 w-2.5 rounded-full bg-brand/20" />
          </div>
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "folio") {
    return (
      <div className={`${base} bg-white flex overflow-hidden`}>
        <div className="w-1 bg-teal-600 h-full" />
        <div className="flex-1 p-2 flex flex-col gap-1 bg-linear-to-r from-teal-50/80 to-white">
          <div className="h-2 w-4/5 rounded-sm bg-teal-700/25" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-5/6 rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "nova") {
    return (
      <div className={`${base} bg-white flex flex-col overflow-hidden`}>
        <div className="bg-slate-950 px-2 py-1.5 border-b-2 border-cyan-400">
          <div className="h-1.5 w-3/5 rounded-sm bg-cyan-400/90" />
        </div>
        <div className="p-2 flex flex-col gap-1">
          <div className="h-1.5 w-2/5 border-l-2 border-cyan-500 pl-1 rounded-none bg-cyan-50/50" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "signal") {
    return (
      <div className={`${base} bg-white p-2 flex flex-col gap-1`}>
        <div className="border-b-2 border-slate-900 pb-1">
          <div className="h-1 w-2/3 font-mono bg-slate-200/80 rounded-[1px]" style={{ fontSize: "6px" }} />
        </div>
        <div className="font-mono text-[5px] text-slate-600 space-y-0.5">
          <div className="h-0.5 w-1/4 bg-slate-300 rounded-sm" />
          <div className="h-1 w-full bg-secondary/10 rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${base} bg-white p-2.5 flex flex-col gap-1`}>
      <div className="h-1 w-1/2 mx-auto rounded-sm bg-slate-800/20" />
      <div className="h-px w-full bg-slate-700/25" />
      <div className="space-y-1 mt-0.5">
        <div className="h-1 w-full rounded-sm bg-secondary/10" />
        <div className="h-1 w-[94%] rounded-sm bg-secondary/10" />
      </div>
    </div>
  );
}

const FILTER_ORDER: TemplateCategoryId[] = [
  "all",
  "ats",
  "tech",
  "leadership",
  "creative",
  "editorial",
];

/* ═══════════════════════════════════════════════════════════════════════
   TemplateGallery — scroll-snap “sample deck” + jump rail + detail panel
   ═══════════════════════════════════════════════════════════════════════ */

export default function TemplateGallery({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (templateId: string) => void;
}) {
  const [category, setCategory] = useState<TemplateCategoryId>("all");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<TemplateStyle, HTMLButtonElement | null>>>({});

  const visible = useMemo(() => {
    if (category === "all") return [...TEMPLATE_CATALOG];
    return TEMPLATE_CATALOG.filter((t) => t.categories.includes(category));
  }, [category]);

  const selected = useMemo(
    () => visible.find((t) => t.id === selectedId) ?? visible[0] ?? TEMPLATE_CATALOG[0],
    [visible, selectedId],
  );

  const scrollCardIntoView = useCallback((id: TemplateStyle) => {
    const el = cardRefs.current[id];
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  // If filter hides the current pick, move selection to first visible
  useEffect(() => {
    if (!visible.length) return;
    if (!visible.some((t) => t.id === selectedId)) {
      onSelect(visible[0].id);
    }
  }, [visible, selectedId, onSelect]);

  // When the filter set changes, center the active card in the deck (not on every selection change)
  useEffect(() => {
    const id = (selectedId && visible.some((t) => t.id === selectedId)
      ? selectedId
      : visible[0]?.id) as TemplateStyle | undefined;
    if (!id) return;
    const raf = requestAnimationFrame(() => scrollCardIntoView(id));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only after category (filter) changes
  }, [category, scrollCardIntoView]);

  const scrollByOne = useCallback(
    (dir: -1 | 1) => {
      const idx = visible.findIndex((t) => t.id === selectedId);
      const next = visible[(idx + dir + visible.length) % visible.length];
      if (next) {
        onSelect(next.id);
        requestAnimationFrame(() => scrollCardIntoView(next.id));
      }
    },
    [visible, selectedId, onSelect, scrollCardIntoView],
  );

  const onDeckKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollByOne(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollByOne(-1);
      }
    },
    [scrollByOne],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-medium text-primary">Choose your export format</p>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-secondary">
            Browse like a stack of sample pages — tap a miniature to jump, or swipe the deck. PDF and Word match what you pick.
          </p>
        </div>

        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1 pt-0.5 scrollbar-thin"
          role="tablist"
          aria-label="Filter by role or need"
        >
          {FILTER_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={category === id}
              onClick={() => setCategory(id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[10px] font-semibold transition-all ${
                category === id
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border-muted bg-surface text-secondary hover:border-brand/30 hover:text-primary"
              }`}
            >
              {CATEGORY_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      {/* Quick jump rail — at-a-glance navigation without hunting in the deck */}
      <div className="rounded-2xl border border-border-muted/70 bg-muted/20 px-3 py-3 sm:px-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-secondary">
            Quick jump
          </span>
          <span className="hidden text-[10px] text-secondary sm:inline">
            {visible.length} format{visible.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-between sm:gap-3">
          {visible.map((t) => {
            const active = selectedId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                title={t.name}
                onClick={() => {
                  onSelect(t.id);
                  requestAnimationFrame(() => scrollCardIntoView(t.id));
                }}
                className={`group relative flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-all ${
                  active
                    ? "ring-2 ring-brand ring-offset-2 ring-offset-muted/20"
                    : "opacity-90 hover:opacity-100"
                }`}
              >
                <div
                  className={`h-16 w-12 overflow-hidden rounded-md border shadow-sm transition-transform group-hover:scale-[1.03] sm:h-[4.5rem] sm:w-14 ${
                    active ? "border-brand bg-white" : "border-border-light bg-white"
                  }`}
                >
                  <TemplateThumbnail layout={t.id} />
                </div>
                <span
                  className={`max-w-[4.5rem] truncate text-center text-[8px] font-semibold leading-tight sm:max-w-[5rem] ${
                    active ? "text-brand" : "text-secondary"
                  }`}
                >
                  {t.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main deck — horizontal scroll-snap */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-linear-to-r from-muted/30 to-transparent sm:w-14" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-linear-to-l from-muted/30 to-transparent sm:w-14" />

        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-secondary">
            Preview deck
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous format"
              onClick={() => scrollByOne(-1)}
              className="rounded-lg border border-border-muted bg-surface p-1.5 text-secondary shadow-sm transition-colors hover:border-brand/40 hover:text-primary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next format"
              onClick={() => scrollByOne(1)}
              className="rounded-lg border border-border-muted bg-surface p-1.5 text-secondary shadow-sm transition-colors hover:border-brand/40 hover:text-primary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          tabIndex={0}
          role="listbox"
          aria-label="Resume format previews. Use arrow keys when focused."
          onKeyDown={onDeckKeyDown}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-visible pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 [&::-webkit-scrollbar]:hidden"
        >
          {visible.map((tpl) => {
            const isSelected = selectedId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                ref={(el) => {
                  cardRefs.current[tpl.id] = el;
                }}
                onClick={() => onSelect(tpl.id)}
                className={`group relative shrink-0 snap-center text-left transition-all ${
                  isSelected ? "z-[1]" : "z-0 opacity-[0.88] hover:opacity-100"
                }`}
                style={{ width: "min(78vw, 17.5rem)" }}
              >
                {/* Paper stack illusion */}
                <div
                  className={`pointer-events-none absolute -right-1 -bottom-1 left-1 top-1 rounded-2xl bg-slate-200/60 shadow-inner transition-transform ${
                    isSelected ? "translate-x-0.5 translate-y-0.5" : ""
                  }`}
                />
                <div
                  className={`pointer-events-none absolute -right-0.5 bottom-0 left-0.5 top-0 rounded-2xl bg-slate-100/80 shadow-sm ${
                    isSelected ? "" : ""
                  }`}
                />

                <div
                  className={`relative flex flex-col overflow-hidden rounded-2xl border-2 bg-surface shadow-lg transition-all ${
                    isSelected
                      ? "border-brand shadow-xl shadow-brand/15"
                      : "border-border-muted hover:border-brand/35 hover:shadow-md"
                  }`}
                >
                  <div className="relative aspect-3/4 w-full overflow-hidden bg-linear-to-b from-muted/50 to-muted/20 p-3 sm:p-4">
                    <div className="h-full w-full overflow-hidden rounded-lg border border-white/80 bg-white shadow-md">
                      <TemplateThumbnail layout={tpl.id} />
                    </div>
                  </div>
                  <div className="border-t border-border-muted/60 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight text-primary">{tpl.name}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-secondary">
                          {tpl.description}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-md">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tpl.categories
                        .filter((c) => c !== "all")
                        .map((c) => (
                          <span
                            key={c}
                            className="rounded-md bg-muted px-2 py-0.5 text-[9px] font-medium text-secondary"
                          >
                            {CATEGORY_LABELS[c]}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-1 px-1 text-center text-[10px] text-secondary sm:text-left">
          Swipe on mobile · Arrow keys when the deck is focused · Use Quick jump for instant switches
        </p>
      </div>

      {/* Confirmation strip — reinforces choice without another grid */}
      <div
        className={`rounded-2xl border px-4 py-4 transition-colors ${
          selectedId === selected.id ? "border-brand/35 bg-brand-subtle/80" : "border-border-muted bg-surface"
        }`}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">Active format</p>
            <p className="mt-0.5 text-sm font-semibold text-primary">{selected.name}</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-secondary">{selected.description}</p>
          </div>
          <div className="mt-3 shrink-0 sm:mt-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-medium text-secondary shadow-sm ring-1 ring-border-muted/60">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
              Ready for tailoring
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
