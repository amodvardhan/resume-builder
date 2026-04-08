import { useEffect, useState } from "react";
import type { MatchDetail } from "../types/api";

interface MatchBreakdownProps {
  detail: MatchDetail | undefined;
  isLoading: boolean;
  onApply: (matchId: string) => void;
  applyBusy?: boolean;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 60
        ? "bg-amber-500"
        : "bg-red-500";
  const trackColor =
    score >= 80
      ? "bg-emerald-100"
      : score >= 60
        ? "bg-amber-100"
        : "bg-red-100";
  const scoreColor =
    score >= 80
      ? "text-emerald-700"
      : score >= 60
        ? "text-amber-700"
        : "text-red-700";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-primary">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>
          {score}%
        </span>
      </div>
      <div className={`h-2 w-full overflow-hidden rounded-full ${trackColor}`}>
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
          style={{ width: animated ? `${Math.min(score, 100)}%` : "0%" }}
        />
      </div>
    </div>
  );
}

export default function MatchBreakdown({
  detail,
  isLoading,
  onApply,
  applyBusy = false,
}: MatchBreakdownProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 border-t border-border-light px-5 pb-5 pt-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-skeleton" />
              <div className="h-2 w-full animate-pulse rounded-full bg-skeleton" />
            </div>
          ))}
        </div>
        <div className="h-3 w-3/4 animate-pulse rounded bg-skeleton" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-skeleton" />
      </div>
    );
  }

  if (!detail) return null;

  const { match_details } = detail;

  return (
    <div className="animate-fade-in-up space-y-5 border-t border-border-light px-5 pb-5 pt-5">
      {/* Score bars */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ScoreBar label="Skill Match" score={detail.skill_match_score} />
        <ScoreBar label="Experience" score={detail.experience_match_score} />
        <ScoreBar label="Role Fit" score={detail.role_fit_score} />
      </div>

      {/* Strengths */}
      {match_details.strengths.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary/70">
            Strengths
          </p>
          <div className="flex flex-wrap gap-1.5">
            {match_details.strengths.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {match_details.gaps.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary/70">
            Gaps
          </p>
          <div className="flex flex-wrap gap-1.5">
            {match_details.gaps.map((g) => (
              <span
                key={g}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200/60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {match_details.recommendation && (
        <div className="rounded-xl border-l-4 border-brand bg-brand-subtle/50 py-3 pl-4 pr-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
            Recommendation
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-primary/80">
            {match_details.recommendation}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={applyBusy}
          onClick={() => onApply(detail.id)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-dark hover:shadow-md active:scale-[0.98] disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {applyBusy ? "Loading…" : "Apply with Tailored Resume"}
        </button>
        {detail.job.url && (
          <a
            href={detail.job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-muted px-3 py-2.5 text-xs font-medium text-secondary transition-all duration-200 hover:border-brand/40 hover:text-brand"
          >
            View Original Posting
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
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
