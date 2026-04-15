import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type {
  ApiError,
  Application,
  AuthUser,
  CloneRequest,
  CloneResponse,
  LoginResponse,
  RefreshResponse,
  RegenerateSectionRequest,
  RegenerateSectionResponse,
  RegisterResponse,
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
  UserCreatePayload,
  UserProfile,
  UserUpdatePayload,
  MatchDetail,
  IoJobFamily,
  IoJobListResponse,
} from "../types/api";

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// Custom event emitted when a token refresh fails — lets AuthContext react
// without coupling the interceptor to React state.
// ---------------------------------------------------------------------------

export const AUTH_FORCE_LOGOUT_EVENT = "meridian:force-logout";

// ---------------------------------------------------------------------------
// Request interceptor — attach Bearer token
// ---------------------------------------------------------------------------

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("access_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor — silent token refresh on 401
// ---------------------------------------------------------------------------

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const url = originalRequest.url ?? "";
    if (url.includes("/auth/refresh") || url.includes("/auth/login") || url.includes("/auth/register")) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshTokenValue = localStorage.getItem("refresh_token");
    if (!refreshTokenValue) {
      isRefreshing = false;
      processQueue(error);
      localStorage.removeItem("access_token");
      window.dispatchEvent(new CustomEvent(AUTH_FORCE_LOGOUT_EVENT));
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post<RefreshResponse>(
        `${BASE_URL}/api/v1/auth/refresh`,
        { refresh_token: refreshTokenValue },
      );
      localStorage.setItem("access_token", data.access_token);
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      processQueue(null, data.access_token);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.dispatchEvent(new CustomEvent(AUTH_FORCE_LOGOUT_EVENT));
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;

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

export async function uploadProfilePhoto(
  userId: string,
  file: File,
): Promise<UserProfile> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UserProfile>(
    `/api/v1/users/${userId}/profile-photo`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function deleteProfilePhoto(userId: string): Promise<UserProfile> {
  const { data } = await api.delete<UserProfile>(
    `/api/v1/users/${userId}/profile-photo`,
  );
  return data;
}

export async function fetchProfilePhotoBlob(userId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(
    `/api/v1/users/${userId}/profile-photo`,
    { responseType: "blob" },
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

export async function activateResume(
  resumeId: string,
): Promise<ResumeActivateResponse> {
  const { data } = await api.patch<ResumeActivateResponse>(
    `/api/v1/resumes/${resumeId}/activate`,
  );
  return data;
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

/** Rebuild resume PDF from stored export snapshot (History parity with tailor confirm). */
export async function regenerateApplicationResumePdf(
  applicationId: string,
): Promise<{ resume_pdf_url: string }> {
  const { data } = await api.post<{ resume_pdf_url: string }>(
    `/api/v1/applications/${applicationId}/exports/resume-pdf`,
  );
  return data;
}

/** Rebuild cover letter PDF from stored export snapshot. */
export async function regenerateApplicationCoverLetterPdf(
  applicationId: string,
): Promise<{ cover_letter_pdf_url: string }> {
  const { data } = await api.post<{ cover_letter_pdf_url: string }>(
    `/api/v1/applications/${applicationId}/exports/cover-letter-pdf`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Dashboard — on-demand compatibility for a job listing
// ---------------------------------------------------------------------------

export async function scoreListingCompatibility(
  listingId: string,
): Promise<MatchDetail> {
  const { data } = await api.post<MatchDetail>(
    `/api/v1/dashboard/listings/${listingId}/compatibility`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// File download (utility endpoint)
// ---------------------------------------------------------------------------

/** Public URL for display only — browser navigation does not send `Authorization`. */
export function getFileDownloadUrl(fileName: string): string {
  return `${BASE_URL}/api/v1/files/${encodeURIComponent(fileName)}`;
}

async function _blobResponseErrorMessage(blob: Blob): Promise<string> {
  try {
    const t = await blob.text();
    const j = JSON.parse(t) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
  } catch {
    /* ignore */
  }
  return "Download failed";
}

/**
 * Fetches `/api/v1/files/...` with the Bearer token and triggers a file save.
 * Use this instead of `<a href={getFileDownloadUrl(...)}>` so the request is authenticated.
 */
export async function downloadGeneratedFile(fileName: string): Promise<void> {
  const path = `/api/v1/files/${encodeURIComponent(fileName)}`;
  const safeName = fileName.replace(/^.*[\\/]/, "") || "download";

  try {
    const res = await api.get<Blob>(path, { responseType: "blob" });
    const ct = (res.headers["content-type"] || "").toLowerCase();
    const blob = res.data;
    if (ct.includes("application/json")) {
      const text = await blob.text();
      const j = JSON.parse(text) as { detail?: string };
      throw new Error(typeof j.detail === "string" ? j.detail : "Download failed");
    }
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    if (err instanceof AxiosError && err.response?.data instanceof Blob) {
      const msg = await _blobResponseErrorMessage(err.response.data);
      throw new Error(msg);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// International organization jobs (standalone module — /api/v1/io-jobs)
// ---------------------------------------------------------------------------

export async function fetchIoJobListings(params: {
  page?: number;
  page_size?: number;
  family?: IoJobFamily | "";
  q?: string;
}): Promise<IoJobListResponse> {
  const { data } = await api.get<IoJobListResponse>("/api/v1/io-jobs", {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      ...(params.family ? { family: params.family } : {}),
      ...(params.q?.trim() ? { q: params.q.trim() } : {}),
    },
  });
  return data;
}

// ---------------------------------------------------------------------------
// §4  Authentication
// ---------------------------------------------------------------------------

export async function authRegister(data: {
  full_name: string;
  email: string;
  password: string;
}): Promise<RegisterResponse> {
  const { data: res } = await api.post<RegisterResponse>(
    "/api/v1/auth/register",
    data,
  );
  return res;
}

export async function authLogin(data: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  const { data: res } = await api.post<LoginResponse>(
    "/api/v1/auth/login",
    data,
  );
  return res;
}

export async function authRefresh(data: {
  refresh_token: string;
}): Promise<RefreshResponse> {
  const { data: res } = await api.post<RefreshResponse>(
    "/api/v1/auth/refresh",
    data,
  );
  return res;
}

export async function authMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>("/api/v1/auth/me");
  return data;
}
