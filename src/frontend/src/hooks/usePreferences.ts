import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { JobPreferences } from "../types/api";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const preferencesKeys = {
  all: ["preferences"] as const,
  catalog: ["preferences", "catalog"] as const,
};

// ---------------------------------------------------------------------------
// Get preferences
// ---------------------------------------------------------------------------

export function usePreferences() {
  return useQuery<JobPreferences>({
    queryKey: preferencesKeys.all,
    queryFn: async () => {
      const { data } = await api.get<JobPreferences>("/api/v1/preferences");
      return data;
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Update preferences
// ---------------------------------------------------------------------------

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation<JobPreferences, Error, JobPreferences>({
    mutationFn: async (payload) => {
      const { data } = await api.put<JobPreferences>(
        "/api/v1/preferences",
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(preferencesKeys.all, data);
    },
  });
}

// ---------------------------------------------------------------------------
// Preferences catalog (industries → role categories)
// ---------------------------------------------------------------------------

export function usePreferencesCatalog() {
  return useQuery<Record<string, string[]>>({
    queryKey: preferencesKeys.catalog,
    queryFn: async () => {
      const { data } = await api.get<Record<string, string[]>>(
        "/api/v1/preferences/catalog",
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
