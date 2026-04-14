import { useMatchDetail, type PatchMatchPayload } from "../hooks/useDashboard";
import type { MatchListItem } from "../types/api";
import MatchBreakdown from "./MatchBreakdown";

interface JobMatchCardProps {
  match: MatchListItem;
  onStatusChange: (id: string, status: string) => void;
  onApply: (matchId: string) => void;
  /** True while fetching job details for the compose prefill. */
  applyBusy?: boolean;
  /** Save CRM fields (notes, follow-up, pipeline stage). */
  onPatchMatch?: (payload: PatchMatchPayload) => void;
  patchBusy?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
}

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  new: { dot: "bg-blue-500", label: "New" },
  reviewing: { dot: "bg-sky-500", label: "Reviewing" },
  saved: { dot: "bg-amber-500", label: "Saved" },
  applied: { dot: "bg-emerald-500", label: "Applied" },
  interviewing: { dot: "bg-violet-500", label: "Interviewing" },
  rejected: { dot: "bg-slate-400", label: "Rejected" },
  dismissed: { dot: "bg-red-400", label: "Dismissed" },
};

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-emerald-600"
      : score >= 60
        ? "text-amber-600"
        : "text-red-500";

  const bgRing =
    score >= 80
      ? "stroke-emerald-100"
      : score >= 60
        ? "stroke-amber-100"
        : "stroke-red-100";

  const fgRing =
    score >= 80
      ? "stroke-emerald-500"
      : score >= 60
        ? "stroke-amber-500"
        : "stroke-red-500";

  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          strokeWidth="3"
          className={bgRing}
        />
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={`${fgRing} transition-all duration-700 ease-out`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={`relative text-sm font-bold ${color}`}>{score}</span>
    </div>
  );
}

export default function JobMatchCard({
  match,
  onStatusChange,
  onApply,
  applyBusy = false,
  onPatchMatch,
  patchBusy = false,
  isExpanded,
  onToggle,
}: JobMatchCardProps) {
  const detail = useMatchDetail(isExpanded ? match.id : null);

  const topStrengths = match.strengths.slice(0, 3);
  const posted = relativeTime(match.job.posted_at);
  const isSaved = match.status === "saved";
  const statusInfo = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.new;
  const followUp = match.next_follow_up_at
    ? new Date(match.next_follow_up_at)
    : null;
  const followUpLabel =
    followUp && !Number.isNaN(followUp.getTime())
      ? followUp.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <div
      className={`group rounded-2xl border bg-surface shadow-sm transition-all duration-200 ${
        isExpanded
          ? "border-brand/30 shadow-md"
          : "border-border-light hover:-translate-y-0.5 hover:border-border-hover hover:shadow-md"
      }`}
    >
      {/* Main card area */}
      <div
        className="cursor-pointer px-5 pb-4 pt-5"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="flex items-start gap-3.5">
          {/* Score ring */}
          <ScoreRing score={match.overall_score} />

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-primary">
                {match.job.title}
              </h3>
              <span
                className="inline-flex max-w-[140px] shrink-0 truncate rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand"
                title={`Listing source: ${match.job.source_name}`}
              >
                {match.job.source_name}
              </span>
              {/* Status badge */}
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-secondary">
                <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                {statusInfo.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-secondary">
              {match.job.organization}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-secondary/60">
              {match.job.location && (
                <>
                  <span className="flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                      />
                    </svg>
                    {match.job.location}
                  </span>
                  <span className="text-secondary/30">&middot;</span>
                </>
              )}
              <span className="font-medium text-secondary/80">
                {match.job.source_name}
              </span>
              {posted && (
                <>
                  <span className="text-secondary/30">&middot;</span>
                  <span>{posted}</span>
                </>
              )}
              {followUpLabel && (
                <>
                  <span className="text-secondary/30">&middot;</span>
                  <span
                    className="text-violet-600/90"
                    title="Next follow-up"
                  >
                    Follow-up {followUpLabel}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`mt-1 h-4 w-4 shrink-0 text-secondary/30 transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>

        {/* Strength pills */}
        {topStrengths.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topStrengths.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-1 h-2.5 w-2.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(match.id, isSaved ? "new" : "saved");
            }}
            title={isSaved ? "Unsave" : "Save"}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150 ${
              isSaved
                ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "text-secondary hover:bg-muted hover:text-primary"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill={isSaved ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
              />
            </svg>
            {isSaved ? "Saved" : "Save"}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(match.id, "dismissed");
            }}
            title="Dismiss"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-secondary transition-all duration-150 hover:bg-red-50 hover:text-red-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Dismiss
          </button>

          <button
            disabled={applyBusy}
            onClick={(e) => {
              e.stopPropagation();
              onApply(match.id);
            }}
            title="Apply"
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-brand-subtle px-3 py-1.5 text-[11px] font-semibold text-brand transition-all duration-150 hover:bg-brand-light hover:shadow-sm disabled:opacity-50"
          >
            {applyBusy ? "Loading…" : "Apply"}
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
                d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded breakdown */}
      {isExpanded && (
        <MatchBreakdown
          detail={detail.data}
          isLoading={detail.isLoading}
          onApply={onApply}
          applyBusy={applyBusy}
          onPatchMatch={onPatchMatch}
          patchBusy={patchBusy}
        />
      )}
    </div>
  );
}
