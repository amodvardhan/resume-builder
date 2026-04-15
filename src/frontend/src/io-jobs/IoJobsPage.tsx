import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useIoJobs, useTriggerIoJobSync } from "./useIoJobs";
import type { IoJobFamily } from "../types/api";

const FILTERS_STORAGE_KEY = "meridian.ioJobs.filters.v1";

const FAMILY_LABEL: Record<IoJobFamily, string> = {
  un: "UN & agencies",
  mdb: "Multilateral development banks",
  eu: "EU institutions",
  other: "Other IO",
};

function readInitialFilters(): { family: IoJobFamily | ""; q: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const f = params.get("io_family");
    const qq = params.get("io_q") ?? "";
    const valid =
      f === "un" || f === "mdb" || f === "eu" || f === "other" ? f : "";
    if (valid || qq) return { family: valid, q: qq };
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (raw) {
      const j = JSON.parse(raw) as { family?: string; q?: string };
      const ff =
        j.family === "un" ||
        j.family === "mdb" ||
        j.family === "eu" ||
        j.family === "other"
          ? j.family
          : "";
      return { family: ff, q: typeof j.q === "string" ? j.q : "" };
    }
  } catch {
    /* ignore */
  }
  return { family: "", q: "" };
}

function FamilyBadge({ family }: { family: IoJobFamily }) {
  const cls =
    family === "un"
      ? "bg-sky-100 text-sky-800 ring-sky-200/80"
      : family === "mdb"
        ? "bg-emerald-100 text-emerald-900 ring-emerald-200/80"
        : family === "eu"
          ? "bg-amber-100 text-amber-900 ring-amber-200/80"
          : "bg-slate-100 text-slate-700 ring-slate-200/80";
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${cls}`}
    >
      {FAMILY_LABEL[family]}
    </span>
  );
}

function formatRefreshed(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

/**
 * Standalone module: curated / ingested vacancies for UN, MDBs, EU institutions.
 */
export default function IoJobsPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(readInitialFilters);

  const q = useIoJobs(page, 20, filters);
  const ioSyncMut = useTriggerIoJobSync();

  useEffect(() => {
    setPage(1);
  }, [filters.family, filters.q]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (filters.family) params.set("io_family", filters.family);
    else params.delete("io_family");
    if (filters.q.trim()) params.set("io_q", filters.q.trim());
    else params.delete("io_q");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  const data = q.data;
  const refreshedLabel = formatRefreshed(data?.catalog_refreshed_at ?? null);
  const hasFilters = Boolean(filters.family || filters.q.trim());
  const catalogEmpty = (data?.catalog_total ?? 0) === 0;
  const filteredEmpty = (data?.items.length ?? 0) === 0;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-border-muted/70 pb-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
            Standalone module
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-[1.65rem]">
            International organization careers
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-secondary">
            A dedicated space for roles at the{" "}
            <strong className="font-semibold text-primary/90">United Nations</strong>,{" "}
            <strong className="font-semibold text-primary/90">multilateral development banks</strong>, and{" "}
            <strong className="font-semibold text-primary/90">EU institutions</strong>. This is intentionally{" "}
            <strong className="font-semibold text-primary/90">separate</strong> from{" "}
            <strong className="font-semibold text-primary/90">Matches</strong>, which uses your job-board integrations
            (search sync) and AI scoring.
          </p>
        </div>

        <div className="mb-4 rounded-xl border border-border-muted/80 bg-muted/20 px-4 py-3 text-xs leading-relaxed text-secondary sm:px-5">
          <p className="font-medium text-primary/90">Official applications only</p>
          <p className="mt-1">
            Apply on each organization&apos;s careers site. Listings here come from configured RSS feeds and may lag
            the source. Eligibility (citizenship, contract type, languages) is always defined by the employer—confirm on
            the official posting. EU institution staff competitions often require eligible nationality; UN and MDB roles
            vary by vacancy.
          </p>
          {refreshedLabel ? (
            <p className="mt-2 text-[11px] text-secondary/90">Catalog last polled: {refreshedLabel}</p>
          ) : null}
        </div>

        <div className="meridian-card-solid p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-primary">Vacancies</h2>
              <p className="mt-1 text-xs text-secondary">
                Filter by family or title. URLs and saved filters use query params and local storage on this device.
              </p>
            </div>
            {isAdmin ? (
              <button
                type="button"
                disabled={ioSyncMut.isPending}
                onClick={() => ioSyncMut.mutate()}
                className="shrink-0 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/15 disabled:opacity-50"
              >
                {ioSyncMut.isPending ? "Starting…" : "Sync IO feeds (admin)"}
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <label className="flex min-w-[10rem] flex-col gap-1 text-[11px] font-medium text-secondary">
              Family
              <select
                value={filters.family}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    family: e.target.value as IoJobFamily | "",
                  }))
                }
                className="rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-primary"
              >
                <option value="">All</option>
                <option value="un">{FAMILY_LABEL.un}</option>
                <option value="mdb">{FAMILY_LABEL.mdb}</option>
                <option value="eu">{FAMILY_LABEL.eu}</option>
                <option value="other">{FAMILY_LABEL.other}</option>
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[11px] font-medium text-secondary">
              Search title
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="Keyword…"
                className="rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-primary placeholder:text-secondary/60"
              />
            </label>
          </div>

          {q.isLoading ? (
            <div className="mt-8 flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            </div>
          ) : q.isError ? (
            <p className="mt-6 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
              Could not load IO careers. Try again later.
            </p>
          ) : (
            <>
              {catalogEmpty ? (
                <div className="mt-8 rounded-xl border border-dashed border-border-muted bg-muted/30 px-6 py-12 text-center">
                  <p className="text-sm font-medium text-primary">No vacancies in the catalog yet</p>
                  <p className="mt-2 text-xs text-secondary">
                    Status:{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-primary/90">
                      {data?.module_status ?? "empty_catalog"}
                    </code>
                    {(data?.allowlisted_feed_count ?? 0) > 0 ? (
                      <>
                        {" "}
                        · {data!.allowlisted_feed_count} RSS feed
                        {data!.allowlisted_feed_count === 1 ? "" : "s"} configured. Data appears after the next poll
                        (hourly) or when an admin runs &quot;Sync IO feeds&quot;.
                      </>
                    ) : null}
                  </p>
                </div>
              ) : filteredEmpty ? (
                <div className="mt-8 rounded-xl border border-dashed border-border-muted bg-muted/30 px-6 py-10 text-center">
                  <p className="text-sm font-medium text-primary">No vacancies match your filters</p>
                  <p className="mt-2 text-xs text-secondary">
                    {hasFilters
                      ? "Try clearing family or search, or browse all rows."
                      : "Adjust filters above."}
                  </p>
                </div>
              ) : (
                <ul className="mt-6 space-y-4">
                  {data!.items.map((job) => (
                    <li
                      key={job.id}
                      className="rounded-xl border border-border-muted/80 bg-surface px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <FamilyBadge family={job.family} />
                          <h3 className="mt-2 text-base font-semibold text-primary">{job.title}</h3>
                          {job.source_label ? (
                            <p className="mt-1 text-[11px] text-secondary">
                              Source: <span className="font-medium text-primary/80">{job.source_label}</span>
                            </p>
                          ) : null}
                          <p className="mt-0.5 text-sm text-secondary">
                            {[job.organization, job.location].filter(Boolean).join(" · ") || "—"}
                          </p>
                          {job.eligibility_hint ? (
                            <p className="mt-2 text-xs text-secondary">{job.eligibility_hint}</p>
                          ) : null}
                        </div>
                        {job.apply_url ? (
                          <a
                            href={job.apply_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-lg border border-brand/35 bg-brand/5 px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/10"
                          >
                            View official posting
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {data && data.total > data.page_size ? (
                <div className="mt-6 flex items-center justify-center gap-3 text-xs">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-border-muted px-3 py-1.5 font-medium disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-secondary">
                    Page {data.page} · {data.total} matching
                  </span>
                  <button
                    type="button"
                    disabled={page * data.page_size >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-border-muted px-3 py-1.5 font-medium disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
