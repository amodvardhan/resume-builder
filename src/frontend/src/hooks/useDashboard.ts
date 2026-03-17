import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type {
  CrawlStatus,
  DashboardStats,
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
  crawlStatus: ["jobs", "crawl", "status"] as const,
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
// Trigger crawl
// ---------------------------------------------------------------------------

export function useTriggerCrawl() {
  const queryClient = useQueryClient();

  return useMutation<CrawlStatus, Error>({
    mutationFn: async () => {
      const { data } = await api.post<CrawlStatus>("/api/v1/jobs/crawl");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.crawlStatus,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Crawl status
// ---------------------------------------------------------------------------

export function useCrawlStatus() {
  return useQuery<CrawlStatus | null>({
    queryKey: dashboardKeys.crawlStatus,
    queryFn: async () => {
      const { data } = await api.get<CrawlStatus>(
        "/api/v1/jobs/crawl/status",
      );
      return data;
    },
    staleTime: 10_000,
    retry: false,
  });
}
