import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUser,
  getUserResumes,
  tailorConfirm,
  tailorPreview,
  tailorResume,
  updateUser,
  uploadResume,
  uploadTemplate,
} from "../api/client";
import type {
  ResumeListItem,
  ResumeUploadResponse,
  TailorConfirmRequest,
  TailorConfirmResponse,
  TailorPreviewRequest,
  TailorPreviewResponse,
  TailorRequest,
  TailorResponse,
  TemplateUploadPayload,
  TemplateUploadResponse,
  UserProfile,
  UserUpdatePayload,
} from "../types/api";

// ---------------------------------------------------------------------------
// Query keys — centralised so invalidation stays consistent
// ---------------------------------------------------------------------------

export const resumeKeys = {
  user: (userId: string) => ["user", userId] as const,
  applications: (userId: string) => ["applications", userId] as const,
  resumes: (userId: string) => ["resumes", userId] as const,
};

// ---------------------------------------------------------------------------
// §3.1  User profile query
// ---------------------------------------------------------------------------

export function useUserProfile(userId: string | null) {
  return useQuery<UserProfile>({
    queryKey: resumeKeys.user(userId!),
    queryFn: () => getUser(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// §3.1  User profile update mutation
// ---------------------------------------------------------------------------

export function useUpdateUser(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<UserProfile, Error, UserUpdatePayload>({
    mutationFn: (payload) => updateUser(userId!, payload),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: resumeKeys.user(userId),
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// §3.2  Template upload mutation
// ---------------------------------------------------------------------------

export function useUploadTemplate() {
  return useMutation<TemplateUploadResponse, Error, TemplateUploadPayload>({
    mutationFn: uploadTemplate,
  });
}

// ---------------------------------------------------------------------------
// §3.3  Resume upload mutation
// ---------------------------------------------------------------------------

export function useUploadResume(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<ResumeUploadResponse, Error, File>({
    mutationFn: (file) => uploadResume(file, userId!),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: resumeKeys.resumes(userId),
        });
      }
    },
  });
}

export function useUserResumes(userId: string | null) {
  return useQuery<ResumeListItem[]>({
    queryKey: resumeKeys.resumes(userId!),
    queryFn: () => getUserResumes(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// §3.3  Tailoring engine mutation
//
// On success the applications list is invalidated so the history sidebar
// (REQ-004) automatically picks up the new entry.
// ---------------------------------------------------------------------------

export function useTailorResume() {
  const queryClient = useQueryClient();

  return useMutation<TailorResponse, Error, TailorRequest>({
    mutationFn: tailorResume,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: resumeKeys.applications(variables.user_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Human-in-the-loop: Preview → Review → Confirm
// ---------------------------------------------------------------------------

export function useTailorPreview() {
  return useMutation<TailorPreviewResponse, Error, TailorPreviewRequest>({
    mutationFn: tailorPreview,
  });
}

export function useTailorConfirm() {
  const queryClient = useQueryClient();

  return useMutation<TailorConfirmResponse, Error, TailorConfirmRequest>({
    mutationFn: tailorConfirm,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: resumeKeys.applications(variables.user_id),
      });
    },
  });
}
