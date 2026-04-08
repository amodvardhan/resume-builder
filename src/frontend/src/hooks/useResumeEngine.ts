import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteProfilePhoto,
  fetchProfilePhotoBlob,
  getUser,
  getUserResumes,
  regenerateSectionApi,
  tailorConfirm,
  tailorPreview,
  tailorResume,
  updateUser,
  uploadProfilePhoto,
  activateResume,
  deleteResume,
  uploadResume,
  uploadTemplate,
} from "../api/client";
import type {
  RegenerateSectionRequest,
  RegenerateSectionResponse,
  ResumeActivateResponse,
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

/** Fetches the authenticated user’s headshot as a blob URL for `<img src>`. Revokes on change/unmount. */
export function useProfilePhotoObjectUrl(
  userId: string | null,
  hasPhoto: boolean | undefined,
): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !hasPhoto) {
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let cancelled = false;

    fetchProfilePhotoBlob(userId)
      .then((blob) => {
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setObjectUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      });

    return () => {
      cancelled = true;
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [userId, hasPhoto]);

  return objectUrl;
}

export function useUploadProfilePhoto(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<UserProfile, Error, File>({
    mutationFn: (file) => uploadProfilePhoto(userId!, file),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: resumeKeys.user(userId),
        });
      }
    },
  });
}

export function useDeleteProfilePhoto(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<UserProfile, Error, void>({
    mutationFn: () => deleteProfilePhoto(userId!),
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

export function useActivateResume(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<ResumeActivateResponse, Error, string>({
    mutationFn: (resumeId) => activateResume(resumeId),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: resumeKeys.resumes(userId),
        });
      }
    },
  });
}

export function useDeleteResume(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (resumeId) => deleteResume(resumeId),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: resumeKeys.resumes(userId),
        });
      }
    },
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

export function useRegenerateSection() {
  return useMutation<RegenerateSectionResponse, Error, RegenerateSectionRequest>({
    mutationFn: regenerateSectionApi,
  });
}
