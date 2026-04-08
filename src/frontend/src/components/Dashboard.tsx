import { useCallback, useState } from "react";
import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useDashboardStats,
  useDashboardMatches,
  useUpdateMatchStatus,
  useTriggerJobSync,
  useJobSyncStatus,
  useLastRunListings,
  useScoreListingCompatibility,
} from "../hooks/useDashboard";
import api from "../api/client";
import { usePreferences } from "../hooks/usePreferences";
import { useUserResumes } from "../hooks/useResumeEngine";
import { extractErrorMessage } from "../api/client";
import type {
  ComposeJobPrefill,
  JobListingWithScore,
  JobPreferences,
  JobSyncStatus,
  MatchDetail,
} from "../types/api";
import JobMatchCard from "./JobMatchCard";
import LatestSearchListingsGrid from "./LatestSearchListingsGrid";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function descriptionTextToHtml(text: string): string {
  const t = text.trim();
  if (!t) {
    return "<p><em>No job description is stored for this listing yet — paste the full posting if you have it.</em></p>";
  }
  return t
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function listingToComposePrefill(row: JobListingWithScore): ComposeJobPrefill {
  const html = row.description_html?.trim();
  const plain = (row.description_text ?? "").trim() || row.title;
  const org =
    row.organization?.trim() ||
    row.source_name?.trim() ||
    "Employer not listed";
  return {
    job_title: row.title,
    organization: org,
    job_description_html:
      html && html.length > 0 ? html : `<p>${escapeHtml(plain)}</p>`,
  };
}

function matchDetailToComposePrefill(detail: MatchDetail): ComposeJobPrefill {
  const job = detail.job;
  const org =
    (job.organization && job.organization.trim()) ||
    job.source_name?.trim() ||
    "Employer not listed";
  return {
    job_title: job.title,
    organization: org,
    job_description_html: descriptionTextToHtml(detail.job.description_text ?? ""),
  };
}

interface DashboardProps {
  userId: string;
  onNavigatePreferences: () => void;
  onNavigateProfile: () => void;
  onComposeWithJobPrefill: (prefill: ComposeJobPrefill) => void;
}

const STATUS_FILTERS = ["all", "new", "saved", "applied"] as const;
const SCORE_OPTIONS = [
  { label: "Any Score", value: 0 },
  { label: "80+", value: 80 },
  { label: "60+", value: 60 },
] as const;

const PER_PAGE = 12;
const LISTING_PAGE_SIZE = 24;

function isSearchProfileReady(p: JobPreferences | undefined): boolean {
  if (!p) return false;
  const industry = p.industry?.trim();
  const hasTargets =
    p.role_categories.length > 0 || p.keywords.length > 0;
  return Boolean(industry && hasTargets);
}

const SOURCE_LABELS: Record<string, string> = {
  adzuna: "Adzuna",
  jooble: "Jooble",
  linkedin: "LinkedIn",
  xing: "XING",
  naukri_gulf: "Naukri Gulf",
  unknown: "Other",
};

function formatSourcesBreakdown(row: Record<string, number>): string {
  return Object.entries(row)
    .map(([k, v]) => `${SOURCE_LABELS[k] ?? k}: ${v}`)
    .join(" · ");
}

/** One place for “ingest vs score vs cards” so copy stays consistent. */
function LastRunPipelineCard({ d }: { d: JobSyncStatus }) {
  const mc = d.matches_created ?? 0;
  return (
    <div className="rounded-xl border border-border-light bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
        Last search — how it breaks down
      </p>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-medium text-secondary">
            1 · Listings from boards (after your keywords)
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-primary">
            {d.jobs_found}
          </dd>
          {d.sources_breakdown &&
            Object.keys(d.sources_breakdown).length > 0 && (
              <dd className="mt-1 text-[11px] leading-snug text-secondary">
                {formatSourcesBreakdown(d.sources_breakdown)}
              </dd>
            )}
        </div>
        <div>
          <dt className="text-[11px] font-medium text-secondary">
            2 · New rows saved to our database
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-primary">
            {d.jobs_new}
          </dd>
          <dd className="mt-1 text-[11px] leading-snug text-secondary">
            {d.jobs_found > 0 && d.jobs_new === 0
              ? "No new imports — those jobs were already stored."
              : d.jobs_new > 0
                ? "First time we saw these job IDs."
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-secondary">
            3 · Match cards created (AI vs your resume)
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-primary">
            {mc}
          </dd>
          <dd className="mt-1 text-[11px] leading-snug text-secondary">
            The Match cards tab shows these scored rows. Use Latest search jobs
            for the full board list.
          </dd>
        </div>
      </dl>
    </div>
  );
}

function JobBoardIntegrationsPanel({
  config,
}: {
  config: Record<string, boolean>;
}) {
  const entries = Object.entries(config).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="mt-4 rounded-xl border border-border-muted bg-surface/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
        Where searches run
      </p>
      <p className="mt-1 text-xs leading-relaxed text-secondary">
        Each search calls the job boards that are connected on the server. Every
        match card shows which board the listing came from. Configure API keys in
        your deployment environment (e.g.{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">APP_ADZUNA_*</code>
        ,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">APP_JOOBLE_API_KEY</code>
        ).
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {entries.map(([id, ok]) => (
          <li
            key={id}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              ok
                ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                : "bg-muted text-secondary ring-1 ring-border-muted"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-secondary/40"}`}
            />
            {SOURCE_LABELS[id] ?? id}
            {!ok && (
              <span className="text-[11px] text-secondary/80">not connected</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard({
  userId,
  onNavigatePreferences,
  onNavigateProfile,
  onComposeWithJobPrefill,
}: DashboardProps) {
  const [viewMode, setViewMode] = useState<"listings" | "matches">("listings");
  const [listingPage, setListingPage] = useState(1);
  const [matchPage, setMatchPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const prefs = usePreferences();
  const profileReady = isSearchProfileReady(prefs.data);

  const stats = useDashboardStats();
  const lastRunListings = useLastRunListings(
    listingPage,
    LISTING_PAGE_SIZE,
    viewMode === "listings",
  );
  const matches = useDashboardMatches({
    page: matchPage,
    per_page: PER_PAGE,
    status: statusFilter === "all" ? undefined : statusFilter,
    min_score: minScore || undefined,
  });
  const syncStatus = useJobSyncStatus();
  const updateStatus = useUpdateMatchStatus();
  const triggerSync = useTriggerJobSync();
  const resumes = useUserResumes(userId);
  const scoreCompat = useScoreListingCompatibility();
  const queryClient = useQueryClient();
  const [postingFetchHint, setPostingFetchHint] = useState<string | null>(null);

  const tailorFromListingMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const { data } = await api.post<JobListingWithScore>(
        `/api/v1/jobs/listings/${listingId}/fetch-posting`,
        null,
        { params: { force: false } },
      );
      return data;
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", "last-run"] });
      if (row.posting_enrichment?.status === "failed") {
        setPostingFetchHint(
          row.posting_enrichment.message ??
            "Could not load the full posting from the job URL. The summary from search is shown — paste from the browser if needed.",
        );
      } else {
        setPostingFetchHint(null);
      }
      onComposeWithJobPrefill(listingToComposePrefill(row));
    },
  });
  const applyFromMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const { data: detail } = await api.get<MatchDetail>(
        `/api/v1/dashboard/matches/${matchId}`,
      );
      try {
        const { data: listing } = await api.post<JobListingWithScore>(
          `/api/v1/jobs/listings/${detail.job.id}/fetch-posting`,
          null,
          { params: { force: false } },
        );
        return { kind: "listing" as const, row: listing };
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          return { kind: "detail" as const, detail };
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", "last-run"] });
      if (result.kind === "listing") {
        const row = result.row;
        if (row.posting_enrichment?.status === "failed") {
          setPostingFetchHint(
            row.posting_enrichment.message ??
              "Could not load the full posting from the job URL.",
          );
        } else {
          setPostingFetchHint(null);
        }
        onComposeWithJobPrefill(listingToComposePrefill(row));
      } else {
        setPostingFetchHint(null);
        onComposeWithJobPrefill(matchDetailToComposePrefill(result.detail));
      }
    },
  });
  const hasActiveResume =
    resumes.isLoading ||
    Boolean(resumes.data?.some((r) => r.is_active));

  const syncState = syncStatus.data?.status;
  const isSyncing =
    triggerSync.isPending ||
    syncState === "running" ||
    syncState === "pending";

  const lastSyncFailed = syncState === "failed";
  const syncError = syncStatus.data?.error_message;

  const handleStatusChange = useCallback(
    (id: string, status: string) => {
      updateStatus.mutate({ matchId: id, status });
    },
    [updateStatus],
  );

  const handleToggle = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
    },
    [],
  );

  const handleSearchJobs = useCallback(() => {
    if (!profileReady || isSyncing) return;
    triggerSync.mutate();
  }, [profileReady, isSyncing, triggerSync]);

  const handleTailorListing = useCallback(
    (row: JobListingWithScore) => {
      if (!hasActiveResume) {
        onNavigateProfile();
        return;
      }
      tailorFromListingMutation.mutate(row.id);
    },
    [hasActiveResume, onNavigateProfile, tailorFromListingMutation.mutate],
  );

  const handleApplyFromMatch = useCallback(
    (matchId: string) => {
      if (!hasActiveResume) {
        onNavigateProfile();
        return;
      }
      applyFromMatchMutation.mutate(matchId);
    },
    [hasActiveResume, onNavigateProfile, applyFromMatchMutation.mutate],
  );

  const handleFindCompatibility = useCallback(
    (row: JobListingWithScore) => {
      if (!hasActiveResume) {
        onNavigateProfile();
        return;
      }
      scoreCompat.mutate(row.id, {
        onSuccess: (detail) => {
          setViewMode("matches");
          setExpandedId(detail.id);
          setMatchPage(1);
        },
      });
    },
    [hasActiveResume, onNavigateProfile, scoreCompat.mutate],
  );

  const totalPages = matches.data
    ? Math.ceil(matches.data.total / PER_PAGE)
    : 0;

  const isEmpty =
    !matches.isLoading && (!matches.data || matches.data.items.length === 0);

  const hasMatches =
    !matches.isLoading && !!matches.data && matches.data.items.length > 0;

  const searchCompletedOnce = syncState === "completed";

  const jobsFoundCount = syncStatus.data?.jobs_found;
  const listingTabCount =
    lastRunListings.data?.total !== undefined
      ? lastRunListings.data.total
      : jobsFoundCount;

  return (
    <div className="page-enter page-shell">
      {/* Guided flow — what to do next */}
      <section className="meridian-card-solid animate-fade-in-up mb-8 overflow-hidden bg-linear-to-br from-surface via-surface to-brand-subtle/35 p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
              Job discovery
            </p>
            <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-primary sm:text-[1.65rem]">
              Search boards → save listings → AI match cards
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
              <span className="font-medium text-primary">Search</span> pulls jobs
              from connected boards.{" "}
              <span className="font-medium text-primary">Save</span> deduplicates
              into our database.{" "}
              <span className="font-medium text-primary">Match cards</span> (this
              page) appear only after OpenAI scores each listing against your
              resume — that is a separate step from &quot;we found 16 jobs on
              Jooble.&quot;
            </p>
            {profileReady && stats.data?.integrations_configured && (
              <JobBoardIntegrationsPanel
                config={stats.data.integrations_configured}
              />
            )}
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:max-w-sm lg:w-72">
            <FlowStep
              step={1}
              title="Define your search"
              description="Industry, roles, locations, keywords."
              done={profileReady}
              actionLabel={profileReady ? "Edit profile" : "Set up profile"}
              onAction={onNavigatePreferences}
            />
            <FlowStep
              step={2}
              title="Search job boards"
              description="Use the button below to pull listings from job boards."
              done={searchCompletedOnce}
              highlight
            />
            <FlowStep
              step={3}
              title="Review match cards"
              description="Open a card to tailor your resume (cards = AI-scored only)."
              done={hasMatches}
              muted
            />
          </div>
        </div>

        {/* Primary action + live status */}
        <div className="mt-6 flex flex-col gap-3 border-t border-border-muted pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {!profileReady && (
              <p className="text-sm text-secondary">
                Choose an{" "}
                <span className="font-medium text-primary">industry</span> and
                at least one{" "}
                <span className="font-medium text-primary">role</span> or{" "}
                <span className="font-medium text-primary">keyword</span> in
                Search setup — then run a search here.
              </p>
            )}
            {profileReady && isSyncing && (
              <p className="text-sm text-secondary">
                <span className="font-medium text-primary">Searching…</span>{" "}
                Fetching from job boards, saving new listings, then scoring
                matches against your resume. Counts appear when the run
                finishes.
              </p>
            )}
            {profileReady &&
              !isSyncing &&
              syncState === "completed" &&
              syncStatus.data && (
                <div className="space-y-3">
                  <LastRunPipelineCard d={syncStatus.data} />
                  {syncStatus.data.jobs_found === 0 &&
                    stats.data?.integrations_configured &&
                    !stats.data.integrations_configured.adzuna &&
                    !stats.data.integrations_configured.jooble && (
                      <p className="text-sm text-amber-800">
                        No primary job boards are connected (Adzuna and Jooble).
                        Add API keys on the server, or only configured secondary
                        feeds will return jobs.
                      </p>
                    )}
                </div>
              )}
            {lastSyncFailed && syncError && (
              <p className="text-sm text-danger">
                Search could not finish: {syncError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearchJobs}
            disabled={!profileReady || isSyncing}
            className="ui-btn-primary inline-flex shrink-0 gap-2 px-6 py-3 text-sm disabled:pointer-events-none disabled:opacity-45"
          >
            {isSyncing ? (
              <>
                <SpinnerIcon className="h-4 w-4" />
                Searching…
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
                Search job boards
              </>
            )}
          </button>
        </div>
      </section>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Scored matches"
          value={stats.data?.total_matches}
          isLoading={stats.isLoading}
          accent="blue"
          glyph="matches"
          stagger="stagger-1"
        />
        <StatCard
          label="Average score"
          value={stats.data?.average_score}
          isLoading={stats.isLoading}
          accent={
            (stats.data?.average_score ?? 0) >= 80
              ? "green"
              : (stats.data?.average_score ?? 0) >= 60
                ? "amber"
                : "red"
          }
          glyph="score"
          suffix="%"
          stagger="stagger-2"
        />
        <StatCard
          label="New today"
          value={stats.data?.new_today}
          isLoading={stats.isLoading}
          accent="green"
          glyph="spark"
          stagger="stagger-3"
        />
        <StatCard
          label="Saved"
          value={stats.data?.saved_count}
          isLoading={stats.isLoading}
          accent="amber"
          glyph="saved"
          stagger="stagger-4"
        />
      </div>

      {/* Latest search (raw listings) vs AI match cards */}
      <div className="meridian-card-solid animate-fade-in-up stagger-2 mb-6 flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs font-medium text-secondary">
          Choose what to review: every job from the last board search, or only
          AI-scored match cards.
        </p>
        <div className="flex rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setViewMode("listings")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
              viewMode === "listings"
                ? "bg-surface text-primary shadow-sm ring-1 ring-black/4"
                : "text-secondary hover:text-primary"
            }`}
          >
            Latest search jobs
            {listingTabCount != null && (
              <span className="ml-1.5 tabular-nums text-[11px] opacity-80">
                ({listingTabCount})
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("matches")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
              viewMode === "matches"
                ? "bg-surface text-primary shadow-sm ring-1 ring-black/4"
                : "text-secondary hover:text-primary"
            }`}
          >
            Match cards
            {stats.data != null && (
              <span className="ml-1.5 tabular-nums text-[11px] opacity-80">
                ({stats.data.total_matches})
              </span>
            )}
          </button>
        </div>
      </div>

      {postingFetchHint && (
        <div className="animate-fade-in-up mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
          {postingFetchHint}
        </div>
      )}

      {/* Filters — only when there are matches to filter */}
      {viewMode === "matches" && hasMatches && (
        <div className="animate-fade-in-up stagger-3 mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border-light bg-surface px-5 py-3.5 shadow-sm">
          <span className="text-xs font-medium text-secondary">Filter:</span>
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter(s);
                  setMatchPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium capitalize transition-all duration-200 ${
                  statusFilter === s
                    ? "bg-surface text-primary shadow-sm ring-1 ring-black/4"
                    : "text-secondary hover:text-primary"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <select
            value={minScore}
            onChange={(e) => {
              setMinScore(Number(e.target.value));
              setMatchPage(1);
            }}
            className="ui-select ui-select-sm w-auto min-w-[10rem] font-medium"
          >
            {SCORE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Listings from last search (full batch, paginated) */}
      {viewMode === "listings" && (
        <div className="min-w-0 space-y-3">
          {scoreCompat.isError && (
            <div className="rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">
              {extractErrorMessage(scoreCompat.error)}
            </div>
          )}
          {tailorFromListingMutation.isError && (
            <div className="rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">
              {extractErrorMessage(tailorFromListingMutation.error)}
            </div>
          )}
          <LatestSearchListingsGrid
            items={lastRunListings.data?.items ?? []}
            isLoading={lastRunListings.isLoading}
            isError={lastRunListings.isError}
            total={lastRunListings.data?.total ?? 0}
            page={listingPage}
            pageSize={LISTING_PAGE_SIZE}
            onPageChange={setListingPage}
            onTailorResume={handleTailorListing}
            onFindCompatibility={handleFindCompatibility}
            compatibilityBusyId={
              scoreCompat.isPending && scoreCompat.variables
                ? scoreCompat.variables
                : null
            }
            tailorBusyId={
              tailorFromListingMutation.isPending &&
              tailorFromListingMutation.variables
                ? tailorFromListingMutation.variables
                : null
            }
          />
        </div>
      )}

      {/* Loading skeleton — match cards */}
      {viewMode === "matches" && matches.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border-light bg-surface p-5"
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 animate-pulse rounded-full bg-skeleton" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-skeleton" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-skeleton" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-skeleton" />
                </div>
              </div>
              <div className="mt-4 flex gap-1.5">
                <div className="h-5 w-14 animate-pulse rounded-full bg-skeleton" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-skeleton" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — match cards */}
      {viewMode === "matches" && isEmpty && !matches.isError && (
        <div className="animate-fade-in-up flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-muted bg-surface px-6 py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-subtle">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-brand"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.903 2.903 0 00-.106-.563m-2.41-.918a2.25 2.25 0 01-2.135 0m2.41.918V9.75a2.25 2.25 0 00-.75-1.688l-3.703-2.962a.75.75 0 00-.876 0l-3.703 2.962a2.25 2.25 0 00-.75 1.688v4.236c0 .92.56 1.748 1.415 2.09m0 0a2.25 2.25 0 104.23 0"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-primary">
            {!profileReady
              ? "Start with your search profile"
              : "No match cards yet"}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-secondary">
            {!profileReady
              ? "We need your industry and at least one role or keyword before we can search and score jobs for you."
              : "Cards appear here only after the AI scores jobs against your resume (see step 3 in the summary above)."}
          </p>
          {profileReady &&
            syncState === "completed" &&
            syncStatus.data &&
            syncStatus.data.jobs_found > 0 &&
            stats.data &&
            stats.data.total_matches === 0 && (
              <p className="mx-auto mt-4 max-w-lg text-center text-sm leading-relaxed text-secondary">
                Last run added{" "}
                <span className="font-semibold tabular-nums text-primary">
                  {syncStatus.data.matches_created ?? 0}
                </span>{" "}
                match card(s). If that number is 0, scoring did not produce rows
                (often: no active resume, or OpenAI errors — check server logs).
                If it is above 0 but you still see an empty grid, refresh the page
                or clear filters.
              </p>
            )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onNavigatePreferences}
              className="ui-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              {profileReady ? "Adjust search profile" : "Open search setup"}
            </button>
            {profileReady && (
              <button
                type="button"
                onClick={handleSearchJobs}
                disabled={isSyncing}
                className="ui-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {isSyncing ? "Searching…" : "Search job boards"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error state — match cards */}
      {viewMode === "matches" && matches.isError && (
        <div className="animate-fade-in-up rounded-xl bg-danger-light p-4">
          <p className="text-sm text-danger">
            Failed to load matches. Please try again later.
          </p>
        </div>
      )}

      {viewMode === "matches" && applyFromMatchMutation.isError && (
        <div className="animate-fade-in-up rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">
          {extractErrorMessage(applyFromMatchMutation.error)}
        </div>
      )}

      {/* Match cards grid */}
      {viewMode === "matches" &&
        !matches.isLoading &&
        matches.data &&
        matches.data.items.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.data.items.map((m, idx) => (
              <div
                key={m.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(idx * 0.05, 0.3)}s` }}
              >
                <JobMatchCard
                  match={m}
                  onStatusChange={handleStatusChange}
                  onApply={handleApplyFromMatch}
                  applyBusy={
                    applyFromMatchMutation.isPending &&
                    applyFromMatchMutation.variables === m.id
                  }
                  isExpanded={expandedId === m.id}
                  onToggle={() => handleToggle(m.id)}
                />
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setMatchPage((p) => Math.max(1, p - 1))}
                disabled={matchPage <= 1}
                className="inline-flex items-center gap-1 rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-xs font-medium text-secondary shadow-sm transition-all duration-200 hover:border-brand/40 hover:text-brand disabled:opacity-40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
                Previous
              </button>
              <span className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-secondary">
                {matchPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setMatchPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={matchPage >= totalPages}
                className="inline-flex items-center gap-1 rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-xs font-medium text-secondary shadow-sm transition-all duration-200 hover:border-brand/40 hover:text-brand disabled:opacity-40"
              >
                Next
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow step
// ---------------------------------------------------------------------------

function FlowStep({
  step,
  title,
  description,
  done,
  actionLabel,
  onAction,
  actionDisabled,
  actionLoading,
  highlight,
  muted,
}: {
  step: number;
  title: string;
  description: string;
  done?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${
        highlight
          ? "border-brand/30 bg-brand-subtle/50"
          : "border-border-muted bg-surface/80"
      } ${muted ? "opacity-80" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-emerald-500 text-white"
            : highlight
              ? "bg-brand text-white"
              : "bg-muted text-secondary"
        }`}
      >
        {done ? "✓" : step}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">{title}</p>
        <p className="text-xs text-secondary">{description}</p>
        {actionLabel && onAction && !muted && (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled || actionLoading}
            className="mt-1.5 text-xs font-semibold text-brand hover:underline disabled:opacity-45"
          >
            {actionLoading ? "Working…" : actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
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

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

const ACCENT_CONFIG = {
  blue: {
    gradient: "from-blue-50 to-blue-100/50",
    text: "text-blue-700",
    ring: "ring-blue-200/50",
  },
  green: {
    gradient: "from-emerald-50 to-emerald-100/50",
    text: "text-emerald-700",
    ring: "ring-emerald-200/50",
  },
  amber: {
    gradient: "from-amber-50 to-amber-100/50",
    text: "text-amber-700",
    ring: "ring-amber-200/50",
  },
  red: {
    gradient: "from-red-50 to-red-100/50",
    text: "text-red-700",
    ring: "ring-red-200/50",
  },
} as const;

function StatGlyph({
  kind,
  className,
}: {
  kind: "matches" | "score" | "spark" | "saved";
  className?: string;
}) {
  const cn = className ?? "";
  if (kind === "matches") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v7.125C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    );
  }
  if (kind === "score") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.875v4.875m3-6.75v6.75m3-10.125v10.125M5.25 20.25h13.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 5.25v12.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    );
  }
  if (kind === "spark") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  isLoading,
  accent,
  glyph,
  suffix = "",
  stagger,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  accent: "blue" | "green" | "amber" | "red";
  glyph: "matches" | "score" | "spark" | "saved";
  suffix?: string;
  stagger: string;
}) {
  const a = ACCENT_CONFIG[accent];

  return (
    <div
      className={`animate-fade-in-up ${stagger} overflow-hidden rounded-2xl border border-border-muted/50 bg-linear-to-br ${a.gradient} p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ${a.ring} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
    >
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-skeleton" />
          <div className="h-9 w-16 animate-pulse rounded bg-skeleton" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary/90">
              {label}
            </p>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 ${a.text} shadow-sm ring-1 ring-white/80`}>
              <StatGlyph kind={glyph} className="h-4 w-4" />
            </span>
          </div>
          <p className={`mt-3 text-3xl font-extrabold tracking-tight tabular-nums ${a.text}`}>
            {value ?? 0}
            {suffix && (
              <span className="ml-0.5 text-lg font-semibold opacity-60">
                {suffix}
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
