import { useCallback, useState } from "react";
import {
  useDashboardStats,
  useDashboardMatches,
  useUpdateMatchStatus,
  useTriggerCrawl,
  useCrawlStatus,
} from "../hooks/useDashboard";
import JobMatchCard from "./JobMatchCard";

interface DashboardProps {
  onNavigatePreferences: () => void;
  onApply: (matchId: string) => void;
}

const STATUS_FILTERS = ["all", "new", "saved", "applied"] as const;
const SCORE_OPTIONS = [
  { label: "Any Score", value: 0 },
  { label: "80+", value: 80 },
  { label: "60+", value: 60 },
] as const;

const PER_PAGE = 12;

export default function Dashboard({
  onNavigatePreferences,
  onApply,
}: DashboardProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useDashboardStats();
  const matches = useDashboardMatches({
    page,
    per_page: PER_PAGE,
    status: statusFilter === "all" ? undefined : statusFilter,
    min_score: minScore || undefined,
  });
  const crawlStatus = useCrawlStatus();
  const updateStatus = useUpdateMatchStatus();
  const triggerCrawl = useTriggerCrawl();

  const isCrawling =
    triggerCrawl.isPending ||
    crawlStatus.data?.status === "running" ||
    crawlStatus.data?.status === "pending";

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

  const handleRefresh = useCallback(() => {
    triggerCrawl.mutate();
  }, [triggerCrawl]);

  const totalPages = matches.data
    ? Math.ceil(matches.data.total / PER_PAGE)
    : 0;

  const isEmpty =
    !matches.isLoading && (!matches.data || matches.data.items.length === 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Job Dashboard
        </h1>
        <p className="mt-2 text-sm text-secondary">
          Your matched opportunities, scored and ranked by AI.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard
          label="Total Matches"
          value={stats.data?.total_matches}
          isLoading={stats.isLoading}
          accent="blue"
          icon="📊"
          stagger="stagger-1"
        />
        <StatCard
          label="Average Score"
          value={stats.data?.average_score}
          isLoading={stats.isLoading}
          accent={
            (stats.data?.average_score ?? 0) >= 80
              ? "green"
              : (stats.data?.average_score ?? 0) >= 60
                ? "amber"
                : "red"
          }
          icon="🎯"
          suffix="%"
          stagger="stagger-2"
        />
        <StatCard
          label="New Today"
          value={stats.data?.new_today}
          isLoading={stats.isLoading}
          accent="green"
          icon="✨"
          stagger="stagger-3"
        />
        <StatCard
          label="Saved"
          value={stats.data?.saved_count}
          isLoading={stats.isLoading}
          accent="amber"
          icon="🔖"
          stagger="stagger-4"
        />
      </div>

      {/* Filter bar */}
      <div className="animate-fade-in-up stagger-3 mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border-light bg-surface px-5 py-3.5 shadow-sm">
        {/* Status pills */}
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
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

        {/* Score filter */}
        <select
          value={minScore}
          onChange={(e) => {
            setMinScore(Number(e.target.value));
            setPage(1);
          }}
          className="rounded-lg border border-border-muted bg-surface px-3 py-1.5 text-xs font-medium text-primary transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
        >
          {SCORE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={isCrawling}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface px-3.5 py-1.5 text-xs font-medium text-secondary shadow-sm transition-all duration-200 hover:border-brand/40 hover:text-brand hover:shadow-md disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3.5 w-3.5 ${isCrawling ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
          {isCrawling ? "Searching..." : "Refresh Jobs"}
        </button>
      </div>

      {/* Crawl status banner */}
      {isCrawling && crawlStatus.data && (
        <div className="animate-fade-in-up mb-6 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-subtle px-5 py-3.5">
          <svg
            className="h-4 w-4 animate-spin text-brand"
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
          <p className="text-xs font-medium text-brand">
            Crawling jobs — found {crawlStatus.data.jobs_found} so far
            {crawlStatus.data.jobs_new > 0 &&
              ` (${crawlStatus.data.jobs_new} new)`}
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {matches.isLoading && (
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

      {/* Empty state */}
      {isEmpty && !matches.isError && (
        <div className="animate-fade-in-up flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-muted bg-surface py-24 text-center">
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
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-primary">
            No job matches yet
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-secondary">
            Set up your preferences and trigger a search to start receiving
            AI-scored job matches.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={onNavigatePreferences}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-dark hover:shadow-md"
            >
              Set Up Preferences
            </button>
            <button
              onClick={handleRefresh}
              disabled={isCrawling}
              className="inline-flex items-center gap-2 rounded-xl border border-border-muted bg-surface px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-all duration-200 hover:border-brand/40 hover:text-brand disabled:opacity-50"
            >
              {isCrawling ? "Searching..." : "Trigger a Search"}
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {matches.isError && (
        <div className="animate-fade-in-up rounded-xl bg-danger-light p-4">
          <p className="text-sm text-danger">
            Failed to load matches. Please try again later.
          </p>
        </div>
      )}

      {/* Match cards grid */}
      {!matches.isLoading && matches.data && matches.data.items.length > 0 && (
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
                  onApply={onApply}
                  isExpanded={expandedId === m.id}
                  onToggle={() => handleToggle(m.id)}
                />
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
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
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
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
// Stat card sub-component
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

function StatCard({
  label,
  value,
  isLoading,
  accent,
  icon,
  suffix = "",
  stagger,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  accent: "blue" | "green" | "amber" | "red";
  icon: string;
  suffix?: string;
  stagger: string;
}) {
  const a = ACCENT_CONFIG[accent];

  return (
    <div
      className={`animate-fade-in-up ${stagger} overflow-hidden rounded-2xl border border-border-light bg-linear-to-br ${a.gradient} p-5 shadow-sm ring-1 ${a.ring} transition-shadow duration-200 hover:shadow-md`}
    >
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-skeleton" />
          <div className="h-9 w-16 animate-pulse rounded bg-skeleton" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-secondary">
              {label}
            </p>
            <span className="text-base">{icon}</span>
          </div>
          <p className={`mt-3 text-3xl font-extrabold tracking-tight ${a.text}`}>
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
