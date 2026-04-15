import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api, { fetchIoJobListings } from "../api/client";
import type { IoJobFamily, IoJobListResponse, JobSyncTriggerResponse } from "../types/api";

export const ioJobsKeys = {
  list: (page: number, pageSize: number, family: string, q: string) =>
    ["io-jobs", "list", page, pageSize, family, q] as const,
};

export function useIoJobs(
  page: number,
  pageSize: number,
  filters: { family: IoJobFamily | ""; q: string },
) {
  return useQuery<IoJobListResponse>({
    queryKey: ioJobsKeys.list(page, pageSize, filters.family, filters.q),
    queryFn: () =>
      fetchIoJobListings({
        page,
        page_size: pageSize,
        family: filters.family || undefined,
        q: filters.q || undefined,
      }),
  });
}

/** Same pattern as `useTriggerJobSync` / `POST /api/v1/jobs/sync` — admin-only IO RSS poll. */
export function useTriggerIoJobSync() {
  const queryClient = useQueryClient();

  return useMutation<JobSyncTriggerResponse, Error>({
    mutationFn: async () => {
      const { data } = await api.post<JobSyncTriggerResponse>(
        "/api/v1/io-jobs/sync",
      );
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["io-jobs"] });
    },
  });
}
