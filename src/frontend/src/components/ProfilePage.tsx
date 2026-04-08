import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeUploadResponse, UserProfile } from "../types/api";
import { extractErrorMessage } from "../api/client";
import {
  useActivateResume,
  useDeleteProfilePhoto,
  useDeleteResume,
  useProfilePhotoObjectUrl,
  useUploadProfilePhoto,
  useUploadResume,
  useUserResumes,
} from "../hooks/useResumeEngine";
import { MAX_STORED_RESUMES } from "../constants/resumeLimits";
import ResumeDrop from "./ResumeDrop";

interface ProfilePageProps {
  userId: string;
  profile: UserProfile;
  onSave: (updates: {
    full_name?: string;
    email?: string;
    core_skills?: string[];
  }) => Promise<void>;
  isSaving: boolean;
  error: unknown;
}

export default function ProfilePage({
  userId,
  profile,
  onSave,
  isSaving,
  error,
}: ProfilePageProps) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [email, setEmail] = useState(profile.email);
  const [skillsText, setSkillsText] = useState(profile.core_skills.join(", "));
  const [saved, setSaved] = useState(false);

  const resumeUploadMutation = useUploadResume(userId);
  const resumesQuery = useUserResumes(userId);
  const activateResumeMutation = useActivateResume(userId);
  const deleteResumeMutation = useDeleteResume(userId);
  const uploadPhotoMutation = useUploadProfilePhoto(userId);
  const deletePhotoMutation = useDeleteProfilePhoto(userId);
  const photoPreviewUrl = useProfilePhotoObjectUrl(
    userId,
    profile.has_profile_photo,
  );
  const photoInputRef = useRef<HTMLInputElement>(null);
  const activatingResumeId = activateResumeMutation.isPending
    ? activateResumeMutation.variables
    : undefined;
  const deletingResumeId = deleteResumeMutation.isPending
    ? deleteResumeMutation.variables
    : undefined;

  const resumeCount = resumesQuery.data?.length ?? 0;
  const storageFull = resumeCount >= MAX_STORED_RESUMES;

  const confirmDeleteResume = useCallback(
    (resumeId: string, filename: string, isActive: boolean) => {
      const msg = isActive
        ? `Delete “${filename}”? If you have other saved resumes, the most recent one will become active.`
        : `Delete “${filename}”? This cannot be undone.`;
      if (!window.confirm(msg)) return;
      deleteResumeMutation.mutate(resumeId);
    },
    [deleteResumeMutation],
  );

  const handleResumeUploaded = useCallback(
    (_res: ResumeUploadResponse) => {
      void resumesQuery.refetch();
    },
    [resumesQuery],
  );

  useEffect(() => {
    setFullName(profile.full_name);
    setEmail(profile.email);
    setSkillsText(profile.core_skills.join(", "));
  }, [profile]);

  const handleSave = useCallback(async () => {
    const coreSkills = skillsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    await onSave({ full_name: fullName, email, core_skills: coreSkills });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [fullName, email, skillsText, onSave]);

  const skills = skillsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="page-enter mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Your Profile
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Manage your personal details and core skills used across all applications.
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile card */}
        <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
          <div className="border-b border-border-light px-6 py-4 sm:px-8">
            <h2 className="text-sm font-semibold text-primary">Personal Information</h2>
          </div>
          <div className="space-y-5 p-6 sm:p-8">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-secondary">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary/50 transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary/50 transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Professional photo — embedded in tailored resume exports */}
        <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
          <div className="border-b border-border-light px-6 py-4 sm:px-8">
            <h2 className="text-sm font-semibold text-primary">Professional photo</h2>
            <p className="mt-0.5 text-xs text-secondary">
              Optional headshot for resume previews and included in PDF and Word downloads. JPEG or PNG, up to a few MB.
            </p>
          </div>
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-muted bg-background">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="px-2 text-center text-xs text-secondary">No photo</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhotoMutation.mutate(file);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadPhotoMutation.isPending}
                  className="rounded-lg border border-border-muted bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-40"
                >
                  {uploadPhotoMutation.isPending ? "Uploading…" : "Upload photo"}
                </button>
                {profile.has_profile_photo ? (
                  <button
                    type="button"
                    onClick={() => deletePhotoMutation.mutate()}
                    disabled={deletePhotoMutation.isPending}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-danger/90 transition-colors hover:bg-danger-light hover:text-danger disabled:opacity-40"
                  >
                    {deletePhotoMutation.isPending ? "Removing…" : "Remove photo"}
                  </button>
                ) : null}
              </div>
              {(uploadPhotoMutation.isError || deletePhotoMutation.isError) && (
                <p className="text-xs text-danger">
                  {extractErrorMessage(
                    uploadPhotoMutation.error ?? deletePhotoMutation.error,
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Resume */}
        <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
          <div className="border-b border-border-light px-6 py-4 sm:px-8">
            <h2 className="text-sm font-semibold text-primary">Resume</h2>
            <p className="mt-0.5 text-xs text-secondary">
              You can save up to {MAX_STORED_RESUMES} resumes; exactly one is active at
              a time for AI tailoring and job scoring. Upload .docx or .pdf, switch the
              active file, or remove an older version.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <ResumeDrop
              onUploaded={handleResumeUploaded}
              uploadMutation={resumeUploadMutation}
              uploadBlocked={storageFull}
              uploadBlockedMessage={`You have ${MAX_STORED_RESUMES} saved resumes. Remove one below before uploading another.`}
            />
            {resumesQuery.data && resumesQuery.data.length > 0 && (
              <>
                <p className="mt-4 text-xs font-medium text-secondary">
                  Saved resumes ({resumeCount} / {MAX_STORED_RESUMES})
                </p>
                <ul className="mt-2 space-y-2 border-t border-border-muted pt-3">
                  {resumesQuery.data.map((r) => (
                    <li
                      key={r.resume_id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm text-primary sm:flex-nowrap"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {r.original_filename}
                      </span>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {r.is_active ? (
                          <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand">
                            Active
                          </span>
                        ) : (
                          <>
                            <span className="text-xs text-secondary/80">
                              Archived
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                activateResumeMutation.mutate(r.resume_id)
                              }
                              disabled={activateResumeMutation.isPending}
                              className="rounded-lg border border-border-muted bg-surface px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-40"
                            >
                              {activatingResumeId === r.resume_id
                                ? "Updating…"
                                : "Set as active"}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            confirmDeleteResume(
                              r.resume_id,
                              r.original_filename,
                              r.is_active,
                            )
                          }
                          disabled={
                            deleteResumeMutation.isPending ||
                            activateResumeMutation.isPending
                          }
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger/90 transition-colors hover:bg-danger-light hover:text-danger disabled:opacity-40"
                        >
                          {deletingResumeId === r.resume_id
                            ? "Removing…"
                            : "Remove"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(activateResumeMutation.isError || deleteResumeMutation.isError) && (
              <p className="mt-2 text-xs text-danger">
                {extractErrorMessage(
                  activateResumeMutation.error ?? deleteResumeMutation.error,
                )}
              </p>
            )}
          </div>
        </div>

        {/* Skills card */}
        <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
          <div className="border-b border-border-light px-6 py-4 sm:px-8">
            <h2 className="text-sm font-semibold text-primary">Core Skills</h2>
            <p className="mt-0.5 text-xs text-secondary">
              These skills are used by the AI to tailor your resume content.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <textarea
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              rows={3}
              placeholder="e.g. Project Management, Data Analysis, Python, Stakeholder Engagement"
              className="w-full resize-y rounded-lg border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary/50 transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
            />

            {skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {skills.map((skill, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-brand-subtle px-3 py-1 text-xs font-medium text-brand"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-brand px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-success">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Profile saved
            </div>
          )}
          {error != null && (
            <span className="text-sm text-danger">
              {extractErrorMessage(error)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
