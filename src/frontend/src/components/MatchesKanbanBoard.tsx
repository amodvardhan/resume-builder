import { useMemo } from "react";
import type { MatchListItem } from "../types/api";
import type { PatchMatchPayload } from "../hooks/useDashboard";
import JobMatchCard from "./JobMatchCard";

const COLUMNS: { id: string; label: string }[] = [
  { id: "new", label: "New" },
  { id: "reviewing", label: "Reviewing" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "interviewing", label: "Interviewing" },
  { id: "rejected", label: "Rejected" },
  { id: "dismissed", label: "Dismissed" },
];

const KNOWN = new Set(COLUMNS.map((c) => c.id));

function bucketStatus(status: string): string {
  return KNOWN.has(status) ? status : "new";
}

interface MatchesKanbanBoardProps {
  items: MatchListItem[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onApply: (matchId: string) => void;
  onPatchMatch: (payload: PatchMatchPayload) => void;
  getPatchBusy: (matchId: string) => boolean;
  getApplyBusy: (matchId: string) => boolean;
}

export default function MatchesKanbanBoard({
  items,
  expandedId,
  onToggle,
  onStatusChange,
  onApply,
  onPatchMatch,
  getPatchBusy,
  getApplyBusy,
}: MatchesKanbanBoardProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, MatchListItem[]>();
    for (const col of COLUMNS) {
      map.set(col.id, []);
    }
    for (const m of items) {
      const key = bucketStatus(m.status);
      const list = map.get(key);
      if (list) list.push(m);
    }
    return map;
  }, [items]);

  return (
    <div className="animate-fade-in-up flex gap-4 overflow-x-auto pb-2 pt-1">
      {COLUMNS.map((col) => {
        const colItems = grouped.get(col.id) ?? [];
        return (
          <div
            key={col.id}
            className="flex w-[min(100%,340px)] shrink-0 flex-col rounded-2xl border border-border-light bg-muted/30"
          >
            <div className="border-b border-border-light px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                {col.label}
              </span>
              <span className="ml-2 tabular-nums text-[11px] font-medium text-secondary/70">
                {colItems.length}
              </span>
            </div>
            <div className="flex max-h-[min(70vh,720px)] flex-col gap-3 overflow-y-auto p-2.5">
              {colItems.length === 0 ? (
                <p className="px-1 py-6 text-center text-[11px] text-secondary/60">
                  No cards
                </p>
              ) : (
                colItems.map((m) => (
                  <JobMatchCard
                    key={m.id}
                    match={m}
                    onStatusChange={onStatusChange}
                    onApply={onApply}
                    applyBusy={getApplyBusy(m.id)}
                    onPatchMatch={onPatchMatch}
                    patchBusy={getPatchBusy(m.id)}
                    isExpanded={expandedId === m.id}
                    onToggle={() => onToggle(m.id)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
