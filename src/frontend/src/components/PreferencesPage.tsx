import { useCallback, useEffect, useState } from "react";
import {
  usePreferences,
  useUpdatePreferences,
  usePreferencesCatalog,
} from "../hooks/usePreferences";
import { useTriggerCrawl } from "../hooks/useDashboard";
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

const SECTION_META: Record<string, { icon: string; description: string }> = {
  Industry: {
    icon: "🏢",
    description: "Which sector are you targeting?",
  },
  "Role Categories": {
    icon: "🎯",
    description: "Select all roles that interest you.",
  },
  "Preferred Locations": {
    icon: "📍",
    description: "Where do you want to work?",
  },
  "Experience Level": {
    icon: "📈",
    description: "What seniority fits your background?",
  },
  Keywords: {
    icon: "🔑",
    description: "Skills and terms the AI should prioritize.",
  },
};

export default function PreferencesPage() {
  const prefs = usePreferences();
  const catalog = usePreferencesCatalog();
  const updatePrefs = useUpdatePreferences();
  const triggerCrawl = useTriggerCrawl();

  const [form, setForm] = useState<JobPreferences>({
    industry: null,
    role_categories: [],
    preferred_locations: [],
    experience_level: null,
    keywords: [],
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

  const handleSave = useCallback(() => {
    setShowSuccess(false);
    updatePrefs.mutate(form, {
      onSuccess: () => setShowSuccess(true),
    });
  }, [form, updatePrefs]);

  const handleCrawl = useCallback(() => {
    triggerCrawl.mutate();
  }, [triggerCrawl]);

  if (prefs.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-6">
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
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Job Preferences
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          Configure your ideal job criteria. These guide the AI job matching
          engine.
        </p>
      </div>

      <div className="space-y-6">
        {/* Industry */}
        <Section title="Industry" stagger="stagger-1">
          <select
            value={form.industry ?? ""}
            onChange={(e) => handleIndustryChange(e.target.value)}
            className="w-full rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
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
              className="flex-1 rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary/40 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
            />
            <button
              onClick={addLocation}
              disabled={!locationInput.trim()}
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-brand-dark disabled:opacity-40"
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
            className="w-full rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
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
              className="flex-1 rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary/40 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
            />
            <button
              onClick={addKeyword}
              disabled={!keywordInput.trim()}
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-brand-dark disabled:opacity-40"
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
            onClick={handleSave}
            disabled={updatePrefs.isPending}
            className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-dark hover:shadow-md active:scale-[0.99] disabled:opacity-50"
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
                  Want to find matching jobs now?
                </p>
              </div>
              <button
                onClick={handleCrawl}
                disabled={triggerCrawl.isPending}
                className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-brand-dark disabled:opacity-50"
              >
                {triggerCrawl.isPending ? "Searching..." : "Search Now"}
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
    <div className={`animate-fade-in-up ${stagger} rounded-2xl border border-border-light bg-surface p-6 shadow-sm transition-shadow duration-200 hover:shadow-md`}>
      <div className="mb-4 flex items-center gap-3">
        {meta && (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-base">
            {meta.icon}
          </span>
        )}
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
