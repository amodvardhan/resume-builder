import type { JobListingWithScore } from "../types/api";

function formatListingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

const SOURCE_LABELS: Record<string, string> = {
  adzuna: "Adzuna",
  jooble: "Jooble",
  linkedin: "LinkedIn",
  xing: "XING",
  naukri_gulf: "Naukri Gulf",
  unknown: "Other",
};

interface LatestSearchListingsGridProps {
  items: JobListingWithScore[];
  isLoading: boolean;
  isError: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onTailorResume: (row: JobListingWithScore) => void;
  onFindCompatibility: (row: JobListingWithScore) => void;
  compatibilityBusyId: string | null;
  tailorBusyId: string | null;
}

export default function LatestSearchListingsGrid({
  items,
  isLoading,
  isError,
  total,
  page,
  pageSize,
  onPageChange,
  onTailorResume,
  onFindCompatibility,
  compatibilityBusyId,
  tailorBusyId,
}: LatestSearchListingsGridProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-border-light bg-surface p-4"
          >
            <div className="h-4 w-2/3 rounded bg-skeleton" />
            <div className="mt-2 h-3 w-1/3 rounded bg-skeleton" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-light p-4">
        <p className="text-sm text-danger">
          Could not load the latest search list. Try again in a moment.
        </p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-6 py-12 text-center">
        <p className="text-sm font-medium text-primary">No batch list yet</p>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          After your next successful board search, every job ID from that run
          appears here in order so you can open postings and choose what to do
          next.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden min-w-0 rounded-2xl border border-border-light bg-surface shadow-sm lg:block">
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="border-b border-border-muted bg-muted/40 text-xs font-semibold uppercase tracking-wide text-secondary">
            <tr>
              <th className="w-[26%] px-4 py-3">Role</th>
              <th className="w-[18%] px-4 py-3">Company</th>
              <th className="w-[11%] px-4 py-3">Listed</th>
              <th className="w-[11%] px-4 py-3">Apply by</th>
              <th className="w-[14%] px-4 py-3">Source</th>
              <th className="w-[20%] px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {items.map((row, idx) => (
              <ListingRowDesktop
                key={`${row.id}-${idx}`}
                row={row}
                onTailorResume={onTailorResume}
                onFindCompatibility={onFindCompatibility}
                compatibilityBusy={compatibilityBusyId === row.id}
                tailorBusy={tailorBusyId === row.id}
              />
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {items.map((row, idx) => (
          <ListingCardMobile
            key={`${row.id}-${idx}`}
            row={row}
            onTailorResume={onTailorResume}
            onFindCompatibility={onFindCompatibility}
            compatibilityBusy={compatibilityBusyId === row.id}
            tailorBusy={tailorBusyId === row.id}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-xs font-medium text-secondary shadow-sm transition-all duration-200 hover:border-brand/40 hover:text-brand disabled:opacity-40"
          >
            Previous
          </button>
          <span className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-secondary">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-xl border border-border-muted bg-surface px-4 py-2.5 text-xs font-medium text-secondary shadow-sm transition-all duration-200 hover:border-brand/40 hover:text-brand disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

function ListingRowDesktop({
  row,
  onTailorResume,
  onFindCompatibility,
  compatibilityBusy,
  tailorBusy,
}: {
  row: JobListingWithScore;
  onTailorResume: (row: JobListingWithScore) => void;
  onFindCompatibility: (row: JobListingWithScore) => void;
  compatibilityBusy: boolean;
  tailorBusy: boolean;
}) {
  const src = SOURCE_LABELS[row.provider] ?? row.source_name;
  return (
    <tr className="transition-colors hover:bg-brand-subtle/30">
      <td className="min-w-0 px-4 py-3 align-top">
        <p className="wrap-break-word font-medium text-primary line-clamp-2">
          {row.title}
        </p>
        {row.location && (
          <p className="mt-0.5 wrap-break-word text-xs text-secondary line-clamp-1">
            {row.location}
          </p>
        )}
      </td>
      <td className="min-w-0 px-4 py-3 align-top text-secondary">
        <p className="wrap-break-word line-clamp-2" title={row.organization ?? undefined}>
          {row.organization ?? "—"}
        </p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-secondary tabular-nums">
        {formatListingDate(row.posted_at)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-secondary tabular-nums">
        {formatListingDate(row.application_closes_at)}
      </td>
      <td className="min-w-0 px-4 py-3 align-top">
        <span className="inline-flex max-w-full rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-border-muted">
          <span className="truncate">{src}</span>
        </span>
      </td>
      <td className="min-w-0 px-4 py-3 align-top text-right">
        <ListingActionCluster
          variant="table"
          row={row}
          onTailorResume={onTailorResume}
          onFindCompatibility={onFindCompatibility}
          compatibilityBusy={compatibilityBusy}
          tailorBusy={tailorBusy}
        />
      </td>
    </tr>
  );
}

function ListingActionCluster({
  variant,
  row,
  onTailorResume,
  onFindCompatibility,
  compatibilityBusy,
  tailorBusy,
}: {
  variant: "table" | "card";
  row: JobListingWithScore;
  onTailorResume: (row: JobListingWithScore) => void;
  onFindCompatibility: (row: JobListingWithScore) => void;
  compatibilityBusy: boolean;
  tailorBusy: boolean;
}) {
  const shell =
    variant === "table"
      ? "ml-auto flex w-full min-w-0 max-w-[16.5rem] flex-col items-stretch gap-2 sm:max-w-[18rem]"
      : "flex w-full flex-col gap-2";
  return (
    <div className={shell}>
      {row.url && (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center rounded-lg border border-border-muted bg-surface px-2.5 py-1.5 text-center text-xs font-semibold text-brand transition-colors hover:border-brand/50"
        >
          View posting
        </a>
      )}
      <div className="flex min-w-0 overflow-hidden rounded-lg ring-1 ring-border-muted">
        <button
          type="button"
          disabled={tailorBusy || compatibilityBusy}
          onClick={() => onTailorResume(row)}
          className="min-h-8 min-w-0 flex-1 border-r border-border-muted bg-brand px-2 py-1.5 text-center text-[11px] font-semibold leading-tight text-white transition-colors hover:bg-brand-dark disabled:opacity-50 sm:text-xs"
        >
          {tailorBusy ? "Loading…" : "Tailor resume"}
        </button>
        <button
          type="button"
          disabled={compatibilityBusy}
          onClick={() => onFindCompatibility(row)}
          className="min-h-8 min-w-0 flex-1 bg-surface px-2 py-1.5 text-center text-[11px] font-semibold leading-tight text-primary transition-colors hover:bg-muted/60 disabled:opacity-50 sm:text-xs"
        >
          {compatibilityBusy ? "Scoring…" : "Compatibility"}
        </button>
      </div>
    </div>
  );
}

function ListingCardMobile({
  row,
  onTailorResume,
  onFindCompatibility,
  compatibilityBusy,
  tailorBusy,
}: {
  row: JobListingWithScore;
  onTailorResume: (row: JobListingWithScore) => void;
  onFindCompatibility: (row: JobListingWithScore) => void;
  compatibilityBusy: boolean;
  tailorBusy: boolean;
}) {
  const src = SOURCE_LABELS[row.provider] ?? row.source_name;
  return (
    <div className="rounded-xl border border-border-light bg-surface p-4 shadow-sm">
      <div className="min-w-0">
        <p className="font-semibold text-primary">{row.title}</p>
        <p className="mt-0.5 text-sm text-secondary">
          {row.organization ?? "—"}
          {row.location ? ` · ${row.location}` : ""}
        </p>
        <p className="mt-1.5 text-[11px] text-secondary/90">
          <span className="font-medium text-secondary">Listed:</span>{" "}
          {formatListingDate(row.posted_at)}
          <span className="mx-1.5 text-border-muted">·</span>
          <span className="font-medium text-secondary">Apply by:</span>{" "}
          {formatListingDate(row.application_closes_at)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-border-muted">
          {src}
        </span>
      </div>
      <div className="mt-3">
        <ListingActionCluster
          variant="card"
          row={row}
          onTailorResume={onTailorResume}
          onFindCompatibility={onFindCompatibility}
          compatibilityBusy={compatibilityBusy}
          tailorBusy={tailorBusy}
        />
      </div>
    </div>
  );
}
