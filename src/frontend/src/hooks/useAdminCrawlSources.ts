import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCreateCrawlSource,
  adminDeleteCrawlSource,
  adminListCrawlSources,
  adminPatchCrawlSource,
} from "../api/client";
import type {
  CrawlSourceCreatePayload,
  CrawlSourceUpdatePayload,
} from "../types/api";

const QK = ["admin", "crawl-sources"] as const;

export function useAdminCrawlSourcesList() {
  return useQuery({
    queryKey: QK,
    queryFn: adminListCrawlSources,
  });
}

export function useAdminCrawlSourceMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (payload: CrawlSourceCreatePayload) =>
      adminCreateCrawlSource(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const patch = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CrawlSourceUpdatePayload }) =>
      adminPatchCrawlSource(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteCrawlSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  return { create, patch, remove };
}
