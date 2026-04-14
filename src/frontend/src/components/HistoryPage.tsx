import { useApplicationHistory, useApplicationDetail, useDeleteApplication, historyKeys } from "../hooks/useHistory";
import {
  downloadGeneratedFile,
  extractErrorMessage,
  regenerateApplicationCoverLetterPdf,
  regenerateApplicationResumePdf,
} from "../api/client";
import type { Application } from "../types/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

interface HistoryPageProps {
  userId: string;
  onUseAsBaseline: (applicationId: string) => void;
}

function applicationHasDocuments(app: Application): boolean {
  return !!(
    app.resume_pdf_url ||
    app.tailored_resume_url ||
    app.cover_letter_pdf_url ||
    app.cover_letter_url ||
    app.export_snapshot_present
  );
}

/** Compact labels for export availability (for card chips). */
function exportFormatChips(app: Application): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  if (app.resume_pdf_url) chips.push({ key: "rpdf", label: "Resume PDF" });
  else if (app.export_snapshot_present) chips.push({ key: "rpdf", label: "Resume PDF" });
  if (app.tailored_resume_url) chips.push({ key: "rdoc", label: "Resume DOCX" });
  if (app.cover_letter_pdf_url) chips.push({ key: "cpdf", label: "Cover PDF" });
  else if (app.export_snapshot_present && (app.cover_letter_text || "").trim())
    chips.push({ key: "cpdf", label: "Cover PDF" });
  if (app.cover_letter_url) chips.push({ key: "cdoc", label: "Cover DOCX" });
  return chips;
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 0) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function groupKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function groupLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function initials(title: string, org: string): string {
  const t = title.trim();
  const o = org.trim();
  if (t.length >= 2) return t.slice(0, 2).toUpperCase();
  if (o.length >= 2) return o.slice(0, 2).toUpperCase();
  return "?";
}

function DocumentDownloadToolbar({
  app,
  userId,
  className = "",
  dense = false,
}: {
  app: Application;
  userId: string;
  className?: string;
  dense?: boolean;
}) {
  const queryClient = useQueryClient();
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const run = (url: string | null | undefined) => {
    void downloadGeneratedFile(url!).catch((e) => {
      window.alert(extractErrorMessage(e));
    });
  };

  const invalidateAfterExport = async () => {
    await queryClient.invalidateQueries({ queryKey: historyKeys.list(userId) });
    await queryClient.invalidateQueries({ queryKey: historyKeys.detail(app.id) });
  };

  const btnPrimary = dense
    ? "inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-brand"
    : "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-brand";

  const btnGhost = dense
    ? "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border-muted bg-surface px-2 py-1.5 text-[10px] font-semibold text-secondary transition-all hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-45"
    : "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-muted bg-surface px-3 py-2.5 text-[10px] font-semibold text-secondary shadow-sm transition-all hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-45";

  const btnCoverPdf = dense
    ? "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-brand/30 bg-brand/5 px-2 py-1.5 text-[11px] font-semibold text-brand transition-all hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-45"
    : "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2.5 text-xs font-semibold text-brand shadow-sm transition-all hover:bg-brand/10 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45";

  const wrap = dense
    ? "flex flex-wrap items-center gap-1.5"
    : "flex flex-wrap items-center gap-2";

  const missingHint = "No file stored for this application (e.g. older run or export not generated).";
  const rebuildResumeHint =
    "No PDF on disk — generate from your saved draft (same as after Confirm) and download.";
  const rebuildCoverHint =
    "No cover PDF on disk — generate from your saved draft and download.";

  type Slot = {
    id: string;
    label: string;
    /** Full-width toolbar label */
    shortLabel: string;
    /** Compact label on list cards */
    denseLabel: string;
    url: string | null | undefined;
    variant: "primary" | "ghost" | "coverPdf";
  };

  const slots: Slot[] = [
    {
      id: "resume-pdf",
      label: "Download tailored resume as PDF",
      shortLabel: "Resume PDF",
      denseLabel: "Resume PDF",
      url: app.resume_pdf_url,
      variant: "primary",
    },
    {
      id: "resume-docx",
      label: "Download tailored resume as Word (.docx)",
      shortLabel: "Resume .docx",
      denseLabel: "Resume .docx",
      url: app.tailored_resume_url,
      variant: "ghost",
    },
    {
      id: "cover-pdf",
      label: "Download cover letter as PDF",
      shortLabel: "Cover letter PDF",
      denseLabel: "Cover PDF",
      url: app.cover_letter_pdf_url,
      variant: "coverPdf",
    },
    {
      id: "cover-docx",
      label: "Download cover letter as Word (.docx)",
      shortLabel: "Cover .docx",
      denseLabel: "Cover .docx",
      url: app.cover_letter_url,
      variant: "ghost",
    },
  ];

  const slotAvailable = (slot: Slot) => {
    if (slot.url) return true;
    if (slot.id === "resume-pdf" && app.export_snapshot_present) return true;
    if (slot.id === "cover-pdf" && app.export_snapshot_present) return true;
    return false;
  };

  const handleSlot = async (slot: Slot) => {
    if (slot.url) {
      run(slot.url);
      return;
    }
    if (slot.id === "resume-pdf" && app.export_snapshot_present) {
      setBusySlot(slot.id);
      try {
        const { resume_pdf_url } = await regenerateApplicationResumePdf(app.id);
        await downloadGeneratedFile(resume_pdf_url);
        await invalidateAfterExport();
      } catch (e) {
        window.alert(extractErrorMessage(e));
      } finally {
        setBusySlot(null);
      }
      return;
    }
    if (slot.id === "cover-pdf" && app.export_snapshot_present) {
      setBusySlot(slot.id);
      try {
        const { cover_letter_pdf_url } = await regenerateApplicationCoverLetterPdf(app.id);
        await downloadGeneratedFile(cover_letter_pdf_url);
        await invalidateAfterExport();
      } catch (e) {
        window.alert(extractErrorMessage(e));
      } finally {
        setBusySlot(null);
      }
    }
  };

  return (
    <div className={`${wrap} ${className}`}>
      {slots.map((slot) => {
        const available = slotAvailable(slot);
        const loading = busySlot === slot.id;
        const cls =
          slot.variant === "primary" ? btnPrimary : slot.variant === "coverPdf" ? btnCoverPdf : btnGhost;
        const baseText = dense ? slot.denseLabel : slot.shortLabel;
        const text = loading ? (dense ? "…" : "Generating…") : baseText;
        const regen =
          !slot.url &&
          app.export_snapshot_present &&
          (slot.id === "resume-pdf" || slot.id === "cover-pdf");
        const title = slot.url
          ? slot.label
          : regen
            ? slot.id === "resume-pdf"
              ? rebuildResumeHint
              : rebuildCoverHint
            : missingHint;
        return (
          <button
            key={slot.id}
            type="button"
            title={title}
            disabled={!available || loading}
            className={cls}
            onClick={() => void handleSlot(slot)}
          >
            {(slot.variant === "primary" || slot.variant === "coverPdf") && (
              <DownloadIcon className={dense ? "h-3 w-3" : "h-3.5 w-3.5"} />
            )}
            {text}
          </button>
        );
      })}
    </div>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

export default function HistoryPage({ userId, onUseAsBaseline }: HistoryPageProps) {
  const { data: applications, isLoading } = useApplicationHistory(userId);
  const deleteMutation = useDeleteApplication(userId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wasLg = useRef(false);
  const [query, setQuery] = useState("");
  const [sortNewest, setSortNewest] = useState(true);

  const isLg = useMediaMinWidth(1024);

  useEffect(() => {
    if (!applications?.length) return;
    if (isLg && !wasLg.current && selectedId === null) {
      setSelectedId(applications[0].id);
    }
    wasLg.current = isLg;
  }, [applications, isLg, selectedId]);

  const filtered = useMemo(() => {
    if (!applications?.length) return [];
    const q = query.trim().toLowerCase();
    let list = applications;
    if (q) {
      list = applications.filter(
        (a) =>
          a.job_title.toLowerCase().includes(q) ||
          a.organization.toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortNewest ? tb - ta : ta - tb;
    });
    return sorted;
  }, [applications, query, sortNewest]);

  const grouped = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const app of filtered) {
      const k = groupKey(app.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(app);
    }
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = applications?.length ?? 0;

  return (
    <div className="page-enter page-shell">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-primary">Application History</h1>
            {!isLoading && total > 0 && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-secondary">
                {total}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Search, download exports, and reuse any past application as a baseline—without leaving this page.
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3 lg:max-w-sm">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border-light bg-surface p-5">
              <div className="space-y-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-skeleton" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-skeleton" />
                <div className="h-3 w-full animate-pulse rounded bg-skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : !applications?.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-muted bg-surface py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-subtle">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-primary">No applications yet</h3>
          <p className="mt-1 max-w-sm text-sm text-secondary">Compose a tailored application to build your archive here.</p>
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside
            className={`
              mb-6 flex flex-col gap-4 lg:sticky lg:top-24 lg:mb-0 lg:max-h-[calc(100vh-6rem)] lg:min-h-0
              ${selectedId && !isLg ? "hidden" : ""}
            `}
          >
            <div className="shrink-0 space-y-3">
              <label className="sr-only" htmlFor="history-search">
                Search applications
              </label>
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  id="history-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by role or company"
                  className="ui-input ui-input--search py-2.5 pr-3"
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary">Timeline</span>
                <button
                  type="button"
                  onClick={() => setSortNewest((s) => !s)}
                  className="text-[11px] font-medium text-brand hover:underline"
                >
                  {sortNewest ? "Newest first" : "Oldest first"}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border-muted bg-muted/50 px-4 py-8 text-center text-sm text-secondary">
                  No matches for &ldquo;{query.trim()}&rdquo;.
                </p>
              ) : (
                grouped.map(([monthKey, apps]) => (
                  <div key={monthKey}>
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-secondary">
                      {groupLabel(monthKey)}
                    </p>
                    <ul className="space-y-2" role="list">
                      {apps.map((app) => (
                        <li key={app.id}>
                          <ApplicationCard
                            application={app}
                            userId={userId}
                            isSelected={app.id === selectedId}
                            onSelect={() => setSelectedId(app.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </aside>

          <section className="min-w-0">
            {selectedId ? (
              <>
                {!isLg && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-dark"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    All applications
                  </button>
                )}
                <ApplicationDetail
                  applicationId={selectedId}
                  userId={userId}
                  onUseAsBaseline={() => onUseAsBaseline(selectedId)}
                  onDelete={() => {
                    const idToRemove = selectedId;
                    deleteMutation.mutate(selectedId, {
                      onSuccess: () => {
                        const rest = applications?.filter((a) => a.id !== idToRemove) ?? [];
                        setSelectedId(rest[0]?.id ?? null);
                      },
                    });
                  }}
                  isDeleting={deleteMutation.isPending}
                  onClose={() => setSelectedId(null)}
                />
              </>
            ) : (
              <div className="hidden min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border-muted bg-surface/80 px-6 py-16 text-center lg:flex">
                <p className="text-sm font-medium text-primary">Select an application</p>
                <p className="mt-1 max-w-xs text-xs text-secondary">Pick an entry from the list to view the job description, cover letter, and downloads.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function useMediaMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${px}px)`).matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const fn = () => setMatches(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [px]);
  return matches;
}

function ApplicationCard({
  application,
  userId,
  isSelected,
  onSelect,
}: {
  application: Application;
  userId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const formatted = new Date(application.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const relative = formatRelativeDate(application.created_at);
  const hasDocs = applicationHasDocuments(application);
  const chips = exportFormatChips(application);
  const ini = initials(application.job_title, application.organization);

  return (
    <div
      className={`
        w-full rounded-xl border text-left transition-all duration-200
        ${isSelected ? "border-brand bg-brand-subtle shadow-sm ring-1 ring-brand/20" : "border-border-light bg-surface hover:border-border-hover hover:shadow-sm"}
      `}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full rounded-xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        aria-current={isSelected ? "page" : undefined}
      >
        <div className="flex gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[12px] font-semibold text-brand"
            style={{
              background:
                "linear-gradient(145deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.06) 100%)",
            }}
            aria-hidden
          >
            {ini}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-primary">{application.job_title}</h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {application.job_match_id && (
                  <span
                    className="rounded-full bg-brand-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand"
                    title="Started from a dashboard match — linked in pipeline CRM"
                  >
                    Pipeline
                  </span>
                )}
                {application.reference_application_id && (
                  <span className="rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Clone
                  </span>
                )}
              </div>
            </div>
            <p className="mt-0.5 truncate text-sm text-secondary">{application.organization}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <time className="text-xs text-secondary" dateTime={application.created_at} title={formatted}>
                {relative}
              </time>
              {chips.length > 0 && (
                <>
                  <span className="text-border-hover" aria-hidden>
                    &middot;
                  </span>
                  <span className="text-xs text-success">{chips.length} export{chips.length === 1 ? "" : "s"}</span>
                </>
              )}
            </div>
            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {chips.slice(0, 3).map((c) => (
                  <span
                    key={c.key}
                    className="inline-flex max-w-[140px] truncate rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-secondary"
                  >
                    {c.label}
                  </span>
                ))}
                {chips.length > 3 && (
                  <span className="text-[10px] font-medium text-secondary">+{chips.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>

      {hasDocs && (
        <div className="border-t border-border-light px-4 pb-4 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-secondary">Quick download</p>
          <DocumentDownloadToolbar app={application} userId={userId} dense />
        </div>
      )}
    </div>
  );
}

function CollapsibleJobDescription({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">Job description</h3>
      <div className="relative">
        <div
          className={`overflow-hidden rounded-xl border border-border-light bg-muted/40 transition-[max-height] duration-300 ease-out ${
            open ? "max-h-[min(70vh,1200px)]" : "max-h-[220px]"
          }`}
        >
          <div className="prose prose-sm max-w-none overflow-y-auto px-4 py-4 text-primary/85 prose-p:leading-relaxed sm:px-5">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
        {!open && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 rounded-b-xl bg-linear-to-t from-background to-transparent"
            aria-hidden
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 text-sm font-medium text-brand hover:text-brand-dark"
      >
        {open ? "Show less" : "Show full description"}
      </button>
    </div>
  );
}

function ApplicationDetail({
  applicationId,
  userId,
  onUseAsBaseline,
  onDelete,
  isDeleting,
  onClose,
}: {
  applicationId: string;
  userId: string;
  onUseAsBaseline: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useApplicationDetail(applicationId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="page-enter">
      <div className="overflow-hidden rounded-2xl border border-border-light bg-surface shadow-sm">
        {isLoading ? (
          <div className="space-y-4 p-8">
            <div className="h-5 w-2/3 animate-pulse rounded bg-skeleton" />
            <div className="h-4 w-full animate-pulse rounded bg-skeleton" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-skeleton" />
            <div className="h-4 w-4/6 animate-pulse rounded bg-skeleton" />
          </div>
        ) : !data ? (
          <div className="p-8 text-sm text-secondary">Application not found.</div>
        ) : (
          <>
            <div className="border-b border-border-light p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">Application</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-primary">{data.job_title}</h2>
                  <p className="mt-0.5 text-sm text-secondary">{data.organization}</p>
                  <p className="mt-2 text-xs text-secondary">
                    Saved{" "}
                    <time dateTime={data.created_at}>
                      {new Date(data.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden shrink-0 rounded-lg p-2 text-secondary transition-colors hover:bg-muted hover:text-primary sm:inline-flex"
                  aria-label="Close detail"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {applicationHasDocuments(data) && (
                <div className="mt-6 rounded-xl border border-success/25 bg-success/6 px-4 py-4 sm:px-5">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary">Exports</p>
                        <p className="text-xs text-secondary">PDF and Word from this run</p>
                      </div>
                    </div>
                  </div>
                  <DocumentDownloadToolbar app={data} userId={userId} />
                </div>
              )}
            </div>

            <div className="space-y-8 p-6 sm:p-8">
              <CollapsibleJobDescription html={data.job_description_html} />

              {data.cover_letter_text && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">Cover letter</h3>
                  <div className="rounded-xl border border-border-light bg-muted/30 px-4 py-4 sm:px-5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary/90">{data.cover_letter_text}</p>
                  </div>
                </div>
              )}

              {applicationHasDocuments(data) && (
                <div className="rounded-xl border border-border-light bg-muted/20 px-4 py-4 sm:px-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-secondary">Download exports</h3>
                  <p className="mb-3 text-xs text-secondary">Faded buttons were not stored for this application.</p>
                  <DocumentDownloadToolbar app={data} userId={userId} />
                </div>
              )}

              {!applicationHasDocuments(data) && data.tailored_resume_url === null && (
                <p className="text-sm text-secondary">No generated files are stored for this application.</p>
              )}
            </div>

            <div className="flex flex-col gap-4 border-t border-border-light px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onUseAsBaseline}
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md"
                >
                  Use as Baseline
                </button>
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:text-primary">
                  Close
                </button>
              </div>

              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-danger">Delete permanently?</span>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="rounded-lg bg-danger px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Yes, delete"}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-2 text-xs font-medium text-secondary transition-colors hover:text-primary">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="self-start rounded-lg px-3 py-2 text-xs font-medium text-danger/70 transition-colors hover:bg-danger-light hover:text-danger sm:self-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="mr-1 inline-block h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244-2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
