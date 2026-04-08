import axios from "axios";
import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { scoreListingCompatibility } from "../api/client";
import type {
  JobSyncStatus,
  JobSyncTriggerResponse,
  DashboardStats,
  JobListingWithScoreList,
  MatchDetail,
  PaginatedMatches,
} from "../types/api";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const dashboardKeys = {
  stats: ["dashboard", "stats"] as const,
  matches: (params: MatchQueryParams) =>
    ["dashboard", "matches", params] as const,
  matchDetail: (matchId: string) =>
    ["dashboard", "match", matchId] as const,
  jobSyncStatus: ["jobs", "sync", "status"] as const,
  lastRunListings: (page: number, pageSize: number) =>
    ["jobs", "last-run", page, pageSize] as const,
};

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

export interface MatchQueryParams {
  page?: number;
  per_page?: number;
  status?: string;
  min_score?: number;
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: dashboardKeys.stats,
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>(
        "/api/v1/dashboard/stats",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Paginated matches list
// ---------------------------------------------------------------------------

export function useDashboardMatches(params: MatchQueryParams) {
  return useQuery<PaginatedMatches>({
    queryKey: dashboardKeys.matches(params),
    queryFn: async () => {
      const { data } = await api.get<PaginatedMatches>(
        "/api/v1/dashboard/matches",
        { params },
      );
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// ---------------------------------------------------------------------------
// Single match detail
// ---------------------------------------------------------------------------

export function useMatchDetail(matchId: string | null) {
  return useQuery<MatchDetail>({
    queryKey: dashboardKeys.matchDetail(matchId!),
    queryFn: async () => {
      const { data } = await api.get<MatchDetail>(
        `/api/v1/dashboard/matches/${matchId}`,
      );
      return data;
    },
    enabled: !!matchId,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Update match status (save / dismiss / applied)
// ---------------------------------------------------------------------------

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { matchId: string; status: string }
  >({
    mutationFn: async ({ matchId, status }) => {
      await api.patch(`/api/v1/dashboard/matches/${matchId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Trigger job sync (background: aggregators + optional org feeds)
// ---------------------------------------------------------------------------

export function useTriggerJobSync() {
  const queryClient = useQueryClient();

  return useMutation<JobSyncTriggerResponse, Error>({
    mutationFn: async () => {
      const { data } = await api.post<JobSyncTriggerResponse>(
        "/api/v1/jobs/sync",
      );
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.jobSyncStatus,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "last-run"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Job sync status
// ---------------------------------------------------------------------------

export function useJobSyncStatus() {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | null>(null);

  const query = useQuery<JobSyncStatus | null>({
    queryKey: dashboardKeys.jobSyncStatus,
    queryFn: async () => {
      try {
        const { data } = await api.get<JobSyncStatus>(
          "/api/v1/jobs/sync/status",
        );
        return data;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5_000,
    retry: false,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (d.status === "running" || d.status === "pending") return 1800;
      return false;
    },
  });

  useEffect(() => {
    const d = query.data;
    if (!d) {
      prevStatusRef.current = null;
      return;
    }
    const prev = prevStatusRef.current;
    prevStatusRef.current = d.status;
    if (prev === null || prev === d.status) return;
    if (
      (d.status === "completed" || d.status === "failed") &&
      (prev === "running" || prev === "pending")
    ) {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "last-run"] });
    }
  }, [query.data, queryClient]);

  return query;
}

// ---------------------------------------------------------------------------
// Latest search batch jobs (raw listings from last run, with optional score)
// ---------------------------------------------------------------------------

export function useLastRunListings(
  page: number,
  pageSize: number,
  enabled = true,
) {
  return useQuery<JobListingWithScoreList>({
    queryKey: dashboardKeys.lastRunListings(page, pageSize),
    queryFn: async () => {
      const { data } = await api.get<JobListingWithScoreList>(
        "/api/v1/jobs/last-run",
        { params: { page, page_size: pageSize } },
      );
      return data;
    },
    staleTime: 15_000,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// On-demand compatibility score for one listing (creates / updates match card)
// ---------------------------------------------------------------------------

export function useScoreListingCompatibility() {
  const queryClient = useQueryClient();

  return useMutation<MatchDetail, Error, string>({
    mutationFn: (listingId) => scoreListingCompatibility(listingId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "last-run"] });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.matchDetail(data.id),
      });
    },
  });
}
