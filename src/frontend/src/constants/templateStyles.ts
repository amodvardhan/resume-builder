/**
 * Built-in resume gallery — IDs must match backend `_STYLE_BUILDERS` / PDF renderer.
 */

export const TEMPLATE_IDS = [
  "classic",
  "modern",
  "minimal",
  "executive",
  "creative",
  "folio",
  "nova",
  "signal",
  "atlas",
] as const;

export type TemplateStyle = (typeof TEMPLATE_IDS)[number];

export type TemplateCategoryId = "all" | "ats" | "leadership" | "creative" | "tech" | "editorial";

export interface TemplateChoice {
  id: TemplateStyle;
  name: string;
  short: string;
  description: string;
  categories: TemplateCategoryId[];
  /** Shown in document preview chrome when applicable */
  previewHeader: string | null;
}

export const TEMPLATE_CATALOG: readonly TemplateChoice[] = [
  {
    id: "classic",
    name: "Classic Professional",
    short: "Classic",
    description:
      "Traditional single-column layout. Widely accepted in US, UK, EU, and international organizations.",
    categories: ["all", "ats"],
    previewHeader: "Tailored Resume",
  },
  {
    id: "modern",
    name: "Modern Two-Column",
    short: "Modern",
    description:
      "Clean two-column design with a skills sidebar. Popular in tech, startups, and progressive companies.",
    categories: ["all", "tech"],
    previewHeader: null,
  },
  {
    id: "minimal",
    name: "Minimalist ATS-Friendly",
    short: "Minimal",
    description:
      "Stripped-down format optimized for Applicant Tracking Systems. Maximum compatibility.",
    categories: ["all", "ats"],
    previewHeader: null,
  },
  {
    id: "executive",
    name: "Executive Brief",
    short: "Executive",
    description:
      "Premium layout with strong visual hierarchy. Suited for senior and C-level roles.",
    categories: ["all", "leadership"],
    previewHeader: "Executive Resume",
  },
  {
    id: "creative",
    name: "Creative Portfolio",
    short: "Creative",
    description:
      "Bold accent colors and visual hierarchy. Ideal for design, marketing, and media roles.",
    categories: ["all", "creative"],
    previewHeader: "Tailored Resume",
  },
  {
    id: "folio",
    name: "Editorial Teal",
    short: "Editorial",
    description:
      "Magazine-inspired hierarchy with a refined teal accent. Great for communications and policy.",
    categories: ["all", "editorial", "creative"],
    previewHeader: "Editorial Résumé",
  },
  {
    id: "nova",
    name: "Night Aurora",
    short: "Aurora",
    description:
      "Deep slate header with cyan highlights — polished for strategy, consulting, and leadership.",
    categories: ["all", "leadership"],
    previewHeader: "Professional Profile",
  },
  {
    id: "signal",
    name: "Signal Tech",
    short: "Signal",
    description:
      "Monospace section markers and crisp structure — built for engineering and product roles.",
    categories: ["all", "tech"],
    previewHeader: "Resume // SIGNAL",
  },
  {
    id: "atlas",
    name: "Atlas International",
    short: "Atlas",
    description:
      "Serif-forward, generous whitespace — suited to diplomacy, NGOs, and formal sectors.",
    categories: ["all", "ats", "editorial"],
    previewHeader: "Curriculum Vitae",
  },
];

const LABEL_MAP = Object.fromEntries(
  TEMPLATE_CATALOG.map((t) => [t.id, t.name]),
) as Record<TemplateStyle, string>;

export function templateDisplayName(id: TemplateStyle): string {
  return LABEL_MAP[id] ?? id;
}

export const CATEGORY_LABELS: Record<TemplateCategoryId, string> = {
  all: "All",
  ats: "ATS-safe",
  leadership: "Leadership",
  creative: "Creative",
  tech: "Tech",
  editorial: "Editorial",
};

/** Header strip text in single-column previews (matches PDF labels). */
export function getTemplatePreviewHeader(id: string): string | null {
  const row = TEMPLATE_CATALOG.find((t) => t.id === id);
  return row?.previewHeader ?? null;
}
