import { useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   Built-in resume template definitions
   ═══════════════════════════════════════════════════════════════════════ */

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  layout: "classic" | "modern" | "minimal" | "executive" | "creative";
  regions: string[];
}

const TEMPLATES: TemplateOption[] = [
  {
    id: "classic",
    name: "Classic Professional",
    description: "Traditional single-column layout. Widely accepted in US, UK, EU, and international organizations (UN, OECD, etc.).",
    layout: "classic",
    regions: ["US", "UK", "EU", "International Orgs"],
  },
  {
    id: "modern",
    name: "Modern Two-Column",
    description: "Clean two-column design with skills sidebar. Popular in tech, startups, and progressive companies.",
    layout: "modern",
    regions: ["US", "UK", "Canada", "Australia"],
  },
  {
    id: "minimal",
    name: "Minimalist ATS-Friendly",
    description: "Stripped-down format optimized for Applicant Tracking Systems. Maximum compatibility.",
    layout: "minimal",
    regions: ["Universal"],
  },
  {
    id: "executive",
    name: "Executive Brief",
    description: "Premium layout with strong visual hierarchy. Suited for senior/C-level roles.",
    layout: "executive",
    regions: ["US", "UK", "EU", "Singapore", "UAE"],
  },
  {
    id: "creative",
    name: "Creative Portfolio",
    description: "Bold design with accent colors and visual elements. Ideal for design, marketing, and media roles.",
    layout: "creative",
    regions: ["US", "UK", "Netherlands", "Germany"],
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   Template thumbnail preview
   ═══════════════════════════════════════════════════════════════════════ */

function TemplateThumbnail({ layout }: { layout: TemplateOption["layout"] }) {
  const base = "w-full h-full rounded";

  if (layout === "classic") {
    return (
      <div className={`${base} bg-white p-3 flex flex-col gap-1.5`}>
        <div className="h-2.5 w-3/4 rounded-sm bg-primary/20 mx-auto" />
        <div className="h-1 w-1/2 rounded-sm bg-secondary/15 mx-auto" />
        <div className="mt-1 h-px bg-border-muted" />
        <div className="space-y-1">
          <div className="h-1.5 w-1/3 rounded-sm bg-brand/25" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-5/6 rounded-sm bg-secondary/10" />
        </div>
        <div className="space-y-1 mt-1">
          <div className="h-1.5 w-2/5 rounded-sm bg-brand/25" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-4/5 rounded-sm bg-secondary/10" />
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
          <div className="h-1 w-4/5 rounded-sm bg-brand/10" />
          <div className="h-1 w-full rounded-sm bg-brand/10" />
          <div className="mt-1 h-1.5 w-3/4 rounded-sm bg-brand/15" />
          <div className="h-1 w-full rounded-sm bg-brand/10" />
        </div>
        <div className="flex-1 p-2 flex flex-col gap-1">
          <div className="h-2 w-3/4 rounded-sm bg-primary/20" />
          <div className="h-1 w-1/2 rounded-sm bg-secondary/15" />
          <div className="mt-1 h-px bg-border-muted" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-5/6 rounded-sm bg-secondary/10" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "minimal") {
    return (
      <div className={`${base} bg-white p-3 flex flex-col gap-1`}>
        <div className="h-2.5 w-2/3 rounded-sm bg-primary/25" />
        <div className="h-1 w-2/5 rounded-sm bg-secondary/15" />
        <div className="mt-2 space-y-1">
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-3/4 rounded-sm bg-secondary/10" />
        </div>
        <div className="mt-2 space-y-1">
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-5/6 rounded-sm bg-secondary/10" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  if (layout === "executive") {
    return (
      <div className={`${base} bg-white flex flex-col overflow-hidden`}>
        <div className="bg-primary/10 px-3 py-2">
          <div className="h-2.5 w-3/4 rounded-sm bg-primary/30" />
          <div className="mt-1 h-1 w-1/2 rounded-sm bg-primary/15" />
        </div>
        <div className="p-2 flex flex-col gap-1">
          <div className="h-1.5 w-2/5 rounded-sm bg-brand/30 border-b border-brand/20" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
          <div className="h-1 w-5/6 rounded-sm bg-secondary/10" />
          <div className="mt-1 h-1.5 w-1/3 rounded-sm bg-brand/30 border-b border-brand/20" />
          <div className="h-1 w-full rounded-sm bg-secondary/10" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${base} bg-white flex flex-col overflow-hidden`}>
      <div className="bg-linear-to-r from-accent/15 to-brand/10 px-3 py-2">
        <div className="h-3 w-1/2 rounded-sm bg-accent/25" />
        <div className="mt-1 h-1 w-2/3 rounded-sm bg-accent/15" />
      </div>
      <div className="p-2 flex flex-col gap-1">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-accent/15" />
          <div className="h-3 w-3 rounded-full bg-brand/15" />
          <div className="h-3 w-3 rounded-full bg-success/15" />
        </div>
        <div className="h-1 w-full rounded-sm bg-secondary/10" />
        <div className="h-1 w-4/5 rounded-sm bg-secondary/10" />
        <div className="h-1 w-full rounded-sm bg-secondary/10" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TemplateGallery component
   ═══════════════════════════════════════════════════════════════════════ */

export default function TemplateGallery({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (templateId: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div>
      <p className="mb-3 text-xs text-secondary">
        Choose a resume format. All templates are ATS-compatible and optimized
        for the target region.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TEMPLATES.map((tpl) => {
          const isSelected = selectedId === tpl.id;
          const isHovered = hoveredId === tpl.id;

          return (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl.id)}
              onMouseEnter={() => setHoveredId(tpl.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`group relative flex flex-col rounded-xl border-2 p-2 text-left transition-all ${
                isSelected
                  ? "border-brand bg-brand-subtle shadow-md"
                  : "border-border-light bg-surface hover:border-brand/30 hover:shadow-sm"
              }`}
            >
              {/* Thumbnail */}
              <div className="aspect-3/4 w-full overflow-hidden rounded-lg border border-border-light bg-muted">
                <TemplateThumbnail layout={tpl.layout} />
              </div>

              {/* Label */}
              <div className="mt-2 px-0.5">
                <p className="text-[11px] font-semibold text-primary leading-tight">
                  {tpl.name}
                </p>
                <p className="mt-0.5 text-[9px] text-secondary leading-snug line-clamp-2">
                  {tpl.description}
                </p>
              </div>

              {/* Region pills */}
              <div className="mt-1.5 flex flex-wrap gap-1 px-0.5">
                {tpl.regions.slice(0, 2).map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-medium text-secondary"
                  >
                    {r}
                  </span>
                ))}
                {tpl.regions.length > 2 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-medium text-secondary">
                    +{tpl.regions.length - 2}
                  </span>
                )}
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand shadow-sm">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}

              {/* Hover tooltip */}
              {isHovered && !isSelected && (
                <div className="absolute inset-x-0 -bottom-8 z-10 mx-auto w-max rounded-md bg-primary px-2 py-1 text-[9px] text-white shadow-lg">
                  Click to select
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
