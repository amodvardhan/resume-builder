import { useCallback, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  cloneApplication,
  deleteApplication,
  getApplication,
  getUserApplications,
} from "../api/client";
import type {
  Application,
  CloneRequest,
  CloneResponse,
} from "../types/api";
import { resumeKeys } from "./useResumeEngine";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const historyKeys = {
  list: (userId: string) => resumeKeys.applications(userId),
  detail: (applicationId: string) => ["application", applicationId] as const,
};

// ---------------------------------------------------------------------------
// Application list query (sidebar — REQ-004, UI-guidelines §4)
// ---------------------------------------------------------------------------

export function useApplicationHistory(userId: string | null) {
  return useQuery<Application[]>({
    queryKey: historyKeys.list(userId!),
    queryFn: () => getUserApplications(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Single-application detail query
// ---------------------------------------------------------------------------

export function useApplicationDetail(applicationId: string | null) {
  return useQuery<Application>({
    queryKey: historyKeys.detail(applicationId!),
    queryFn: () => getApplication(applicationId!),
    enabled: !!applicationId,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Delete application mutation
// ---------------------------------------------------------------------------

export function useDeleteApplication(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (applicationId) => deleteApplication(applicationId),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: historyKeys.list(userId),
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Reference Engine — finite state machine
//
// Implements the exact 3-click flow from ui-guidelines.md §4:
//
//   idle ──[selectReference]──▸ viewing
//                                 │
//                     [activateBaseline]
//                                 │
//                                 ▾
//                             composing ──[submitClone]──▸ idle
//                                 │
//                              [reset] ──────────────────▸ idle
//
// "viewing"  = user clicked a past application card in the sidebar
// "composing"= user clicked "Use as Baseline for New Application"
// ---------------------------------------------------------------------------

export type ReferenceMode = "idle" | "viewing" | "composing";

export interface UseReferenceEngineReturn {
  /** Currently selected application id (null when idle). */
  referenceApplicationId: string | null;
  /** Current phase of the Reference Engine flow. */
  mode: ReferenceMode;
  /** Full detail of the selected reference application. */
  detail: ReturnType<typeof useApplicationDetail>;
  /** Underlying react-query mutation for the clone call. */
  cloneMutation: ReturnType<typeof useCloneMutation>;
  /** Click 1 — select a past application from the sidebar. */
  selectReference: (applicationId: string) => void;
  /** Click 2 — promote the viewed application to baseline. */
  activateBaseline: () => void;
  /** Select + activate in one step (bypasses "viewing" state). */
  selectAndActivateBaseline: (applicationId: string) => void;
  /** Click 3 — submit the clone with the new JD payload. */
  submitClone: (payload: CloneRequest) => Promise<CloneResponse>;
  /** Escape hatch — return to idle from any state. */
  reset: () => void;
  /** Pre-filled fields derived from the reference application (locked in UI). */
  baselineContext: BaselineContext | null;
}

export interface BaselineContext {
  sourceApplicationId: string;
  templateId: string | null;
  organization: string;
  jobTitle: string;
}

// ---------------------------------------------------------------------------
// Internal clone mutation (isolated so it can be tested independently)
// ---------------------------------------------------------------------------

function useCloneMutation(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<
    CloneResponse,
    Error,
    { sourceApplicationId: string } & CloneRequest
  >({
    mutationFn: ({ sourceApplicationId, ...payload }) =>
      cloneApplication(sourceApplicationId, payload),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: historyKeys.list(userId),
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export function useReferenceEngine(
  userId: string | null,
): UseReferenceEngineReturn {
  const [referenceApplicationId, setReferenceApplicationId] = useState<
    string | null
  >(null);
  const [mode, setMode] = useState<ReferenceMode>("idle");

  const detail = useApplicationDetail(referenceApplicationId);
  const cloneMutation = useCloneMutation(userId);

  const baselineContext = useMemo<BaselineContext | null>(() => {
    if (mode !== "composing" || !detail.data) return null;
    return {
      sourceApplicationId: detail.data.id,
      templateId: detail.data.template_id,
      organization: detail.data.organization,
      jobTitle: detail.data.job_title,
    };
  }, [mode, detail.data]);

  const selectReference = useCallback((applicationId: string) => {
    setReferenceApplicationId(applicationId);
    setMode("viewing");
  }, []);

  const activateBaseline = useCallback(() => {
    if (!referenceApplicationId) return;
    setMode("composing");
  }, [referenceApplicationId]);

  const selectAndActivateBaseline = useCallback((applicationId: string) => {
    setReferenceApplicationId(applicationId);
    setMode("composing");
  }, []);

  const reset = useCallback(() => {
    setReferenceApplicationId(null);
    setMode("idle");
  }, []);

  const submitClone = useCallback(
    async (payload: CloneRequest): Promise<CloneResponse> => {
      if (!referenceApplicationId) {
        throw new Error(
          "Cannot clone: no reference application selected",
        );
      }
      const result = await cloneMutation.mutateAsync({
        sourceApplicationId: referenceApplicationId,
        ...payload,
      });
      reset();
      return result;
    },
    [referenceApplicationId, cloneMutation, reset],
  );

  return {
    referenceApplicationId,
    mode,
    detail,
    cloneMutation,
    selectReference,
    activateBaseline,
    selectAndActivateBaseline,
    submitClone,
    reset,
    baselineContext,
  };
}
