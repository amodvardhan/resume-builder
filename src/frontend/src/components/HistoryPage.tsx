import { useApplicationHistory, useApplicationDetail, useDeleteApplication } from "../hooks/useHistory";
import { getFileDownloadUrl } from "../api/client";
import type { Application } from "../types/api";
import { useState } from "react";

interface HistoryPageProps {
  userId: string;
  onUseAsBaseline: (applicationId: string) => void;
}

export default function HistoryPage({ userId, onUseAsBaseline }: HistoryPageProps) {
  const { data: applications, isLoading } = useApplicationHistory(userId);
  const deleteMutation = useDeleteApplication(userId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="page-enter mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Application History
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Review past applications and use them as baselines for new ones.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
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
          <p className="mt-1 max-w-sm text-sm text-secondary">
            Create your first tailored application to start building your history.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              isSelected={app.id === selectedId}
              onClick={() => setSelectedId(app.id === selectedId ? null : app.id)}
            />
          ))}
        </div>
      )}

      {selectedId && (
        <ApplicationDetail
          applicationId={selectedId}
          onUseAsBaseline={() => onUseAsBaseline(selectedId)}
          onDelete={() => {
            deleteMutation.mutate(selectedId, {
              onSuccess: () => setSelectedId(null),
            });
          }}
          isDeleting={deleteMutation.isPending}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ApplicationCard({
  application,
  isSelected,
  onClick,
}: {
  application: Application;
  isSelected: boolean;
  onClick: () => void;
}) {
  const date = new Date(application.created_at);
  const formatted = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <button
      onClick={onClick}
      className={`
        group w-full rounded-xl border p-5 text-left
        transition-all duration-200
        ${isSelected
          ? "border-brand bg-brand-subtle shadow-sm ring-1 ring-brand/20"
          : "border-border-light bg-surface hover:border-border-hover hover:shadow-sm"
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-primary">
            {application.job_title}
          </h3>
          <p className="mt-0.5 truncate text-sm text-secondary">
            {application.organization}
          </p>
        </div>
        {application.reference_application_id && (
          <span className="shrink-0 rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            Cloned
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-secondary">{formatted}</span>
        {application.tailored_resume_url && (
          <>
            <span className="text-xs text-border-hover">&middot;</span>
            <span className="text-xs text-success">Resume ready</span>
          </>
        )}
      </div>
    </button>
  );
}

function ApplicationDetail({
  applicationId,
  onUseAsBaseline,
  onDelete,
  isDeleting,
  onClose,
}: {
  applicationId: string;
  onUseAsBaseline: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useApplicationDetail(applicationId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mt-8 page-enter">
      <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
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
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                    Application Details
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-primary">
                    {data.job_title}
                  </h2>
                  <p className="mt-0.5 text-sm text-secondary">{data.organization}</p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-secondary transition-colors hover:bg-muted hover:text-primary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-6 p-6 sm:p-8">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                  Job Description
                </h3>
                <div
                  className="prose prose-sm max-w-none text-primary/80"
                  dangerouslySetInnerHTML={{ __html: data.job_description_html }}
                />
              </div>

              {data.cover_letter_text && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                    Cover Letter
                  </h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary/80">
                    {data.cover_letter_text}
                  </p>
                </div>
              )}

              {data.tailored_resume_url && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                    Resume
                  </h3>
                  <a
                    href={getFileDownloadUrl(data.tailored_resume_url)}
                    download
                    className="inline-flex items-center gap-2 rounded-lg border border-border-muted px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-brand hover:text-brand"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download Tailored Resume
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border-light px-6 py-4 sm:px-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={onUseAsBaseline}
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md"
                >
                  Use as Baseline
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:text-primary"
                >
                  Close
                </button>
              </div>

              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-danger">Delete permanently?</span>
                  <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="rounded-lg bg-danger px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-secondary transition-colors hover:text-primary"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-danger/70 transition-colors hover:bg-danger-light hover:text-danger"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
