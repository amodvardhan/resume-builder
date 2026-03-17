import axios, { AxiosError } from "axios";
import type {
  ApiError,
  Application,
  CloneRequest,
  CloneResponse,
  RegenerateSectionRequest,
  RegenerateSectionResponse,
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
  UserCreatePayload,
  UserProfile,
  UserUpdatePayload,
} from "../types/api";

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// Error normalizer — unwraps FastAPI's {detail: string} envelope
// ---------------------------------------------------------------------------

export function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiError | undefined;
    return data?.detail ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}

// ---------------------------------------------------------------------------
// §3.1  User & Profile
// ---------------------------------------------------------------------------

export async function createUser(
  payload: UserCreatePayload,
): Promise<UserProfile> {
  const { data } = await api.post<UserProfile>("/api/v1/users", payload);
  return data;
}

export async function getUser(userId: string): Promise<UserProfile> {
  const { data } = await api.get<UserProfile>(`/api/v1/users/${userId}`);
  return data;
}

export async function updateUser(
  userId: string,
  payload: UserUpdatePayload,
): Promise<UserProfile> {
  const { data } = await api.patch<UserProfile>(
    `/api/v1/users/${userId}`,
    payload,
  );
  return data;
}

// ---------------------------------------------------------------------------
// §3.2  Template Management
// ---------------------------------------------------------------------------

export async function uploadTemplate(
  payload: TemplateUploadPayload,
): Promise<TemplateUploadResponse> {
  const form = new FormData();
  form.append("file", payload.file);
  form.append("name", payload.name);
  form.append("is_master", String(payload.is_master));

  const { data } = await api.post<TemplateUploadResponse>(
    "/api/v1/templates/upload",
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

// ---------------------------------------------------------------------------
// §3.3  Resume Upload & Parsing
// ---------------------------------------------------------------------------

export async function uploadResume(
  file: File,
  userId: string,
): Promise<ResumeUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("user_id", userId);

  const { data } = await api.post<ResumeUploadResponse>(
    "/api/v1/resumes/upload",
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function getUserResumes(
  userId: string,
): Promise<ResumeListItem[]> {
  const { data } = await api.get<ResumeListItem[]>(
    `/api/v1/users/${userId}/resumes`,
  );
  return data;
}

export async function deleteResume(resumeId: string): Promise<void> {
  await api.delete(`/api/v1/resumes/${resumeId}`);
}

// ---------------------------------------------------------------------------
// §3.4  The Tailoring Engine
// ---------------------------------------------------------------------------

export async function tailorResume(
  payload: TailorRequest,
): Promise<TailorResponse> {
  const { data } = await api.post<TailorResponse>(
    "/api/v1/applications/tailor",
    payload,
  );
  return data;
}

// ---------------------------------------------------------------------------
// §3.4b  Human-in-the-Loop: Preview → Review → Confirm
// ---------------------------------------------------------------------------

export async function tailorPreview(
  payload: TailorPreviewRequest,
): Promise<TailorPreviewResponse> {
  const { data } = await api.post<TailorPreviewResponse>(
    "/api/v1/applications/tailor/preview",
    payload,
  );
  return data;
}

export async function tailorConfirm(
  payload: TailorConfirmRequest,
): Promise<TailorConfirmResponse> {
  const { data } = await api.post<TailorConfirmResponse>(
    "/api/v1/applications/tailor/confirm",
    payload,
  );
  return data;
}

export async function regenerateSectionApi(
  payload: RegenerateSectionRequest,
): Promise<RegenerateSectionResponse> {
  const { data } = await api.post<RegenerateSectionResponse>(
    "/api/v1/applications/tailor/regenerate-section",
    payload,
  );
  return data;
}

// ---------------------------------------------------------------------------
// §3.4c  The Reference Engine (History Cloning)
// ---------------------------------------------------------------------------

export async function cloneApplication(
  sourceApplicationId: string,
  payload: CloneRequest,
): Promise<CloneResponse> {
  const { data } = await api.post<CloneResponse>(
    `/api/v1/applications/${sourceApplicationId}/clone`,
    payload,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Application history (needed by sidebar — REQ-004)
// ---------------------------------------------------------------------------

export async function getUserApplications(
  userId: string,
): Promise<Application[]> {
  const { data } = await api.get<Application[]>(
    `/api/v1/users/${userId}/applications`,
  );
  return data;
}

export async function getApplication(
  applicationId: string,
): Promise<Application> {
  const { data } = await api.get<Application>(
    `/api/v1/applications/${applicationId}`,
  );
  return data;
}

export async function deleteApplication(
  applicationId: string,
): Promise<void> {
  await api.delete(`/api/v1/applications/${applicationId}`);
}

// ---------------------------------------------------------------------------
// File download (utility endpoint)
// ---------------------------------------------------------------------------

export function getFileDownloadUrl(fileName: string, format: "pdf" | "docx" = "pdf"): string {
  const base =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  return `${base}/api/v1/files/${encodeURIComponent(fileName)}?format=${format}`;
}
