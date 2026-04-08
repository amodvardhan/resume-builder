import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  usePreferences,
  useUpdatePreferences,
  usePreferencesCatalog,
} from "../hooks/usePreferences";
import { useTriggerJobSync } from "../hooks/useDashboard";
import { extractErrorMessage } from "../api/client";
import type { JobPreferences } from "../types/api";

const EXPERIENCE_LEVELS = [
  "Junior",
  "Mid",
  "Senior",
  "Lead",
  "Director",
  "Executive",
];

/** ISO2 codes supported for Adzuna + Jooble primary search (must match backend allowlist). */
const TARGET_JOB_MARKETS: { code: string; label: string }[] = [
  { code: "at", label: "Austria" },
  { code: "au", label: "Australia" },
  { code: "be", label: "Belgium" },
  { code: "br", label: "Brazil" },
  { code: "ca", label: "Canada" },
  { code: "ch", label: "Switzerland" },
  { code: "cn", label: "China" },
  { code: "de", label: "Germany" },
  { code: "es", label: "Spain" },
  { code: "fr", label: "France" },
  { code: "gb", label: "United Kingdom" },
  { code: "hk", label: "Hong Kong" },
  { code: "in", label: "India" },
  { code: "it", label: "Italy" },
  { code: "jp", label: "Japan" },
  { code: "mx", label: "Mexico" },
  { code: "nl", label: "Netherlands" },
  { code: "nz", label: "New Zealand" },
  { code: "pl", label: "Poland" },
  { code: "ru", label: "Russia" },
  { code: "sg", label: "Singapore" },
  { code: "us", label: "United States" },
  { code: "za", label: "South Africa" },
];

function SectionIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand/10 to-indigo-500/10 text-brand shadow-sm ring-1 ring-brand/10">
      {children}
    </span>
  );
}

const SECTION_META: Record<string, { icon: ReactNode; description: string }> = {
  Industry: {
    icon: (
      <SectionIcon>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75v.75h-.75v-.75zm0 3h.75v.75h-.75v-.75zm0 3h.75v.75h-.75v-.75zm0 3h.75v.75h-.75v-.75zM9 6.75h.75v.75H9v-.75zm0 3h.75v.75H9v-.75zm0 3h.75v.75H9v-.75zm0 3h.75v.75H9v-.75zm6.75-9h.75v.75h-.75v-.75zm0 3h.75v.75h-.75v-.75zm0 3h.75v.75h-.75v-.75zm0 3h.75v.75h-.75v-.75z" />
        </svg>
      </SectionIcon>
    ),
    description: "Which sector are you targeting?",
  },
  "Role Categories": {
    icon: (
      <SectionIcon>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
        </svg>
      </SectionIcon>
    ),
    description: "Select all roles that interest you.",
  },
  "Preferred Locations": {
    icon: (
      <SectionIcon>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      </SectionIcon>
    ),
    description: "Where do you want to work?",
  },
  "Experience Level": {
    icon: (
      <SectionIcon>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v7.125C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      </SectionIcon>
    ),
    description: "What seniority fits your background?",
  },
  Keywords: {
    icon: (
      <SectionIcon>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </SectionIcon>
    ),
    description: "Skills and terms the AI should prioritize.",
  },
  "Job search countries": {
    icon: (
      <SectionIcon>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      </SectionIcon>
    ),
    description:
      "Scopes every job source (Adzuna, Jooble, LinkedIn, XING, Naukri Gulf, and any future feeds). Leave empty to use the server default for Adzuna and location text for Jooble; secondary sources are not filtered by country until you choose at least one market.",
  },
};

export default function PreferencesPage() {
  const prefs = usePreferences();
  const catalog = usePreferencesCatalog();
  const updatePrefs = useUpdatePreferences();
  const triggerSync = useTriggerJobSync();

  const [form, setForm] = useState<JobPreferences>({
    industry: null,
    role_categories: [],
    preferred_locations: [],
    experience_level: null,
    keywords: [],
    target_country_codes: [],
  });

  const [locationInput, setLocationInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (prefs.data) {
      setForm(prefs.data);
    }
  }, [prefs.data]);

  const industries = catalog.data ? Object.keys(catalog.data).sort() : [];
  const roleOptions =
    form.industry && catalog.data?.[form.industry]
      ? catalog.data[form.industry]
      : [];

  const handleIndustryChange = useCallback(
    (industry: string) => {
      setForm((prev) => ({
        ...prev,
        industry: industry || null,
        role_categories: [],
      }));
    },
    [],
  );

  const toggleRole = useCallback((role: string) => {
    setForm((prev) => ({
      ...prev,
      role_categories: prev.role_categories.includes(role)
        ? prev.role_categories.filter((r) => r !== role)
        : [...prev.role_categories, role],
    }));
  }, []);

  const addLocation = useCallback(() => {
    const val = locationInput.trim();
    if (!val) return;
    setForm((prev) => ({
      ...prev,
      preferred_locations: prev.preferred_locations.includes(val)
        ? prev.preferred_locations
        : [...prev.preferred_locations, val],
    }));
    setLocationInput("");
  }, [locationInput]);

  const removeLocation = useCallback((loc: string) => {
    setForm((prev) => ({
      ...prev,
      preferred_locations: prev.preferred_locations.filter((l) => l !== loc),
    }));
  }, []);

  const addKeyword = useCallback(() => {
    const val = keywordInput.trim();
    if (!val) return;
    setForm((prev) => ({
      ...prev,
      keywords: prev.keywords.includes(val)
        ? prev.keywords
        : [...prev.keywords, val],
    }));
    setKeywordInput("");
  }, [keywordInput]);

  const removeKeyword = useCallback((kw: string) => {
    setForm((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== kw),
    }));
  }, []);

  const toggleTargetCountry = useCallback((code: string) => {
    setForm((prev) => {
      const c = code.toLowerCase();
      const has = prev.target_country_codes.includes(c);
      return {
        ...prev,
        target_country_codes: has
          ? prev.target_country_codes.filter((x) => x !== c)
          : [...prev.target_country_codes, c],
      };
    });
  }, []);

  const handleSave = useCallback(() => {
    setShowSuccess(false);
    updatePrefs.mutate(form, {
      onSuccess: () => setShowSuccess(true),
    });
  }, [form, updatePrefs]);

  const handleJobSync = useCallback(() => {
    triggerSync.mutate();
  }, [triggerSync]);

  if (prefs.isLoading) {
    return (
      <div className="page-enter page-shell">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border-light bg-surface p-6"
            >
              <div className="h-4 w-1/3 animate-pulse rounded bg-skeleton" />
              <div className="mt-3 h-10 w-full animate-pulse rounded-lg bg-skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter page-shell">
      <div className="mx-auto w-full max-w-2xl">
      <div className="animate-fade-in-up mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
          Step 1 — Search profile
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-primary">
          What jobs should we find?
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
          Meridian uses this profile to query job boards and to filter
          listings before AI scores them against your resume. Choose an
          industry and at least one role or keyword, save, then run a search
          from the Matches page.
        </p>
      </div>

      <div className="space-y-6">
        {/* Industry */}
        <Section title="Industry" stagger="stagger-1">
          <select
            value={form.industry ?? ""}
            onChange={(e) => handleIndustryChange(e.target.value)}
            className="ui-select mt-1.5"
          >
            <option value="">Select an industry</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
          {catalog.isLoading && (
            <p className="mt-1.5 text-xs text-secondary/60">
              Loading catalog...
            </p>
          )}
        </Section>

        {/* Role categories */}
        <Section title="Role Categories" stagger="stagger-2">
          {/* Selected chips */}
          {form.role_categories.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {form.role_categories.map((role) => (
                <span
                  key={role}
                  className="animate-scale-in inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                >
                  {role}
                  <button
                    onClick={() => toggleRole(role)}
                    className="ml-0.5 rounded-full p-0.5 text-brand/50 transition-colors hover:bg-brand/10 hover:text-brand"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          {roleOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {roleOptions.map((role) => {
                const selected = form.role_categories.includes(role);
                return (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                      selected
                        ? "bg-brand text-white shadow-sm"
                        : "bg-muted text-secondary hover:bg-brand-subtle hover:text-brand"
                    }`}
                  >
                    {role}
                    {selected && (
                      <span className="ml-1.5 inline-flex">&times;</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-secondary/60">
              {form.industry
                ? "No roles available for this industry."
                : "Select an industry first to see available roles."}
            </p>
          )}
        </Section>

        {/* Target countries (primary APIs) */}
        <Section title="Job search countries" stagger="stagger-3">
          <p className="mb-3 text-xs text-secondary/80">
            Select one or more countries to scope all integrations: primary APIs
            use them directly; LinkedIn, XING, Naukri Gulf, and other feeds are
            filtered by matching location or description text to your selection.
            If none are selected, behaviour is unchanged (Adzuna uses{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              APP_ADZUNA_COUNTRY
            </code>
            ; Jooble uses preferred locations below; secondary sources are not
            country-filtered).
          </p>
          <div className="flex flex-wrap gap-2">
            {TARGET_JOB_MARKETS.map(({ code, label }) => {
              const selected = form.target_country_codes.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleTargetCountry(code)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                    selected
                      ? "bg-brand text-white shadow-sm"
                      : "bg-muted text-secondary hover:bg-brand-subtle hover:text-brand"
                  }`}
                >
                  {label}
                  {selected && <span className="ml-1.5 inline-flex">&times;</span>}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Preferred locations */}
        <Section title="Preferred Locations" stagger="stagger-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLocation();
                }
              }}
              placeholder="e.g. New York, Remote, Geneva"
              className="ui-input flex-1"
            />
            <button
              type="button"
              onClick={addLocation}
              disabled={!locationInput.trim()}
              className="ui-btn-primary shrink-0 px-5 py-2.5 text-xs"
            >
              Add
            </button>
          </div>
          {form.preferred_locations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {form.preferred_locations.map((loc) => (
                <span
                  key={loc}
                  className="animate-scale-in inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                >
                  {loc}
                  <button
                    onClick={() => removeLocation(loc)}
                    className="ml-0.5 rounded-full p-0.5 text-brand/50 transition-colors hover:bg-brand/10 hover:text-brand"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Experience level */}
        <Section title="Experience Level" stagger="stagger-4">
          <select
            value={form.experience_level ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                experience_level: e.target.value || null,
              }))
            }
            className="ui-select mt-1.5"
          >
            <option value="">Select experience level</option>
            {EXPERIENCE_LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>
        </Section>

        {/* Keywords */}
        <Section title="Keywords" stagger="stagger-5">
          <div className="flex gap-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="e.g. Python, project management, DevOps"
              className="ui-input flex-1"
            />
            <button
              type="button"
              onClick={addKeyword}
              disabled={!keywordInput.trim()}
              className="ui-btn-primary shrink-0 px-5 py-2.5 text-xs"
            >
              Add
            </button>
          </div>
          {form.keywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {form.keywords.map((kw) => (
                <span
                  key={kw}
                  className="animate-scale-in inline-flex items-center gap-1 rounded-full bg-accent-light px-3 py-1 text-xs font-medium text-accent"
                >
                  {kw}
                  <button
                    onClick={() => removeKeyword(kw)}
                    className="ml-0.5 rounded-full p-0.5 text-accent/50 transition-colors hover:bg-accent/10 hover:text-accent"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Save button */}
        <div className="animate-fade-in-up stagger-5 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={updatePrefs.isPending}
            className="ui-btn-primary w-full py-3.5 text-[15px]"
          >
            {updatePrefs.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                Saving...
              </span>
            ) : (
              "Save Preferences"
            )}
          </button>
        </div>

        {/* Success feedback */}
        {showSuccess && (
          <div className="animate-fade-in-up rounded-2xl border border-success/20 bg-success-light p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-success"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">
                  Preferences saved
                </p>
                <p className="mt-0.5 text-xs text-secondary">
                  Open Matches and tap &quot;Search job boards&quot; to import
                  listings.
                </p>
              </div>
              <button
                type="button"
                onClick={handleJobSync}
                disabled={triggerSync.isPending}
                className="ui-btn-primary shrink-0 px-4 py-2.5 text-xs"
              >
                {triggerSync.isPending ? "Searching…" : "Search from here"}
              </button>
            </div>
          </div>
        )}

        {/* Error feedback */}
        {updatePrefs.isError && (
          <div className="animate-fade-in-up rounded-xl bg-danger-light p-4">
            <p className="text-sm text-danger">
              {extractErrorMessage(updatePrefs.error)}
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper with icon
// ---------------------------------------------------------------------------

function Section({
  title,
  stagger,
  children,
}: {
  title: string;
  stagger: string;
  children: React.ReactNode;
}) {
  const meta = SECTION_META[title];

  return (
    <div className={`meridian-card-solid animate-fade-in-up ${stagger} p-6 transition-all duration-200 hover:shadow-(--shadow-float)`}>
      <div className="mb-4 flex items-center gap-3">
        {meta && meta.icon}
        <div>
          <h2 className="text-sm font-semibold text-primary">{title}</h2>
          {meta && (
            <p className="text-xs text-secondary/60">{meta.description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

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
