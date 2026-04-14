import { useApplicationHistory } from "../hooks/useHistory";
import type { Application } from "../types/api";
import type { ReferenceMode } from "../hooks/useHistory";

interface HistorySidebarProps {
  userId: string | null;
  selectedApplicationId: string | null;
  mode: ReferenceMode;
  onSelectApplication: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function HistorySidebar({
  userId,
  selectedApplicationId,
  mode,
  onSelectApplication,
  isOpen,
  onToggle,
}: HistorySidebarProps) {
  const { data: applications, isLoading } = useApplicationHistory(userId);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 rounded-md bg-surface p-2 shadow-sm lg:hidden"
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Overlay on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 z-40 h-full w-[250px]
          bg-surface/80 backdrop-blur-xl
          border-r border-border-light
          transition-transform duration-200 ease-in-out
          flex flex-col
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:relative lg:translate-x-0
        `}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">
            History
          </h2>
          {mode !== "idle" && (
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {isLoading ? (
            <div className="space-y-3 px-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-skeleton" />
                  <div className="h-2 w-1/2 animate-pulse rounded bg-skeleton" />
                </div>
              ))}
            </div>
          ) : !applications?.length ? (
            <p className="px-2 text-xs text-secondary">
              No applications yet. Tailor your first resume to get started.
            </p>
          ) : (
            <ul className="space-y-1">
              {applications.map((app) => (
                <ApplicationCard
                  key={app.id}
                  application={app}
                  isSelected={app.id === selectedApplicationId}
                  onClick={() => onSelectApplication(app.id)}
                />
              ))}
            </ul>
          )}
        </nav>
      </aside>
    </>
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
    year: "numeric",
  });

  return (
    <li>
      <button
        onClick={onClick}
        className={`
          w-full rounded-md px-3 py-2.5 text-left
          transition-colors duration-200 ease-in-out
          ${
            isSelected
              ? "bg-brand/5 text-primary"
              : "text-primary hover:bg-muted"
          }
        `}
      >
        <span className="block text-sm font-medium leading-tight truncate">
          {application.organization} — {application.job_title}
        </span>
        <span className="mt-0.5 block text-[11px] text-secondary">
          {formatted}
          {application.job_match_id && " · Pipeline"}
          {application.reference_application_id && " · Cloned"}
        </span>
      </button>
    </li>
  );
}
