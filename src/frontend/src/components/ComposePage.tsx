import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import ResumeDrop from "./ResumeDrop";
import ResumeIdentityPanel from "./ResumeIdentityPanel";
import RichEditor from "./RichEditor";
import SentimentSlider from "./SentimentSlider";
import DraftReview from "./DraftReview";
import TemplateGallery from "./TemplateGallery";
import type { SentimentValue } from "./SentimentSlider";
import {
  useTailorPreview,
  useTailorConfirm,
  useRegenerateSection,
  useActivateResume,
  useUserResumes,
  useUserProfile,
  useProfilePhotoObjectUrl,
  resumeKeys,
} from "../hooks/useResumeEngine";
import { uploadResume } from "../api/client";
import { MAX_STORED_RESUMES } from "../constants/resumeLimits";
import type { TemplateStyle } from "../constants/templateStyles";
import { getTemplatePreviewHeader } from "../constants/templateStyles";
import { useReferenceEngine } from "../hooks/useHistory";
import { downloadGeneratedFile, extractErrorMessage } from "../api/client";
import {
  pickResumeContact,
  type ComposeJobPrefill,
  type ResumeUploadResponse,
  type ResumeListItem,
  type TailorPreviewResponse,
  type TailorConfirmResponse,
} from "../types/api";

export type ComposePhase = "input" | "review" | "done";

type ResumeUploadWithPrior = ResumeUploadResponse & {
  prevActive: string | null;
};

type ReferenceEngine = ReturnType<typeof useReferenceEngine>;

interface ComposePageProps {
  userId: string;
  refEngine: ReferenceEngine;
  onPhaseChange: (phase: ComposePhase) => void;
  hidden: boolean;
  resetSignal: number;
  /** Job fields from dashboard / matches; parent clears when leaving compose (see App). */
  jobPrefill: ComposeJobPrefill | null;
}

export default function ComposePage({
  userId,
  refEngine,
  onPhaseChange,
  hidden,
  resetSignal,
  jobPrefill,
}: ComposePageProps) {
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobDescriptionHtml, setJobDescriptionHtml] = useState("");
  const [sentiment, setSentiment] = useState<SentimentValue>("formal");

  const [composePhase, setComposePhase] = useState<ComposePhase>("input");
  const [draft, setDraft] = useState<TailorPreviewResponse | null>(null);
  const [result, setResult] = useState<TailorConfirmResponse | null>(null);
  const [templateStyle, setTemplateStyle] = useState<string>("classic");
  const [resumeSwapPrompt, setResumeSwapPrompt] = useState<{
    newId: string;
    prevId: string;
    newFilename: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const previewMutation = useTailorPreview();
  const confirmMutation = useTailorConfirm();
  const sectionRegenMutation = useRegenerateSection();
  const activateResumeMutation = useActivateResume(userId);
  const resumeUploadMutation = useMutation({
    mutationFn: async (file: File): Promise<ResumeUploadWithPrior> => {
      const list = queryClient.getQueryData<ResumeListItem[]>(
        resumeKeys.resumes(userId),
      );
      const prevActive =
        list?.find((r) => r.is_active)?.resume_id ?? null;
      const data = await uploadResume(file, userId);
      return { ...data, prevActive };
    },
    onSuccess: (payload) => {
      void queryClient.invalidateQueries({
        queryKey: resumeKeys.resumes(userId),
      });
      if (payload.prevActive && payload.prevActive !== payload.resume_id) {
        setResumeSwapPrompt({
          newId: payload.resume_id,
          prevId: payload.prevActive,
          newFilename: payload.original_filename,
        });
      } else {
        setResumeId(payload.resume_id);
      }
    },
  });
  const resumesQuery = useUserResumes(userId);
  const userProfileQuery = useUserProfile(userId);
  const profilePhotoSrc = useProfilePhotoObjectUrl(
    userId,
    userProfileQuery.data?.has_profile_photo,
  );
  const resumeContact = useMemo(
    () => pickResumeContact(userProfileQuery.data),
    [userProfileQuery.data],
  );

  const { mode, baselineContext } = refEngine;

  useEffect(() => {
    if (resumeId) return;
    const active = resumesQuery.data?.find((r) => r.is_active);
    if (active) setResumeId(active.resume_id);
  }, [resumesQuery.data, resumeId]);

  useEffect(() => {
    if (!jobPrefill) return;
    setJobTitle(jobPrefill.job_title);
    setOrganization(jobPrefill.organization);
    setJobDescriptionHtml(jobPrefill.job_description_html);
    setComposePhase("input");
    setDraft(null);
    setResult(null);
  }, [jobPrefill]);

  // Sync phase changes to parent for footer visibility
  useEffect(() => {
    onPhaseChange(composePhase);
  }, [composePhase, onPhaseChange]);

  // Reset form state when the parent signals a fresh navigation to compose
  const [prevResetSignal, setPrevResetSignal] = useState(resetSignal);
  if (resetSignal !== prevResetSignal) {
    setPrevResetSignal(resetSignal);
    setComposePhase("input");
    setDraft(null);
    setResult(null);
    setJobTitle("");
    setOrganization("");
    setJobDescriptionHtml("");
  }

  const handleResumeUploaded = useCallback((_res: ResumeUploadResponse) => {
    /* choice handled in resumeUploadMutation.onSuccess */
  }, []);

  const handlePreview = useCallback(() => {
    if (!resumeId) return;
    previewMutation.mutate(
      {
        user_id: userId,
        resume_id: resumeId,
        template_style: templateStyle,
        job_title: jobTitle,
        organization,
        job_description_html: jobDescriptionHtml,
        cover_letter_sentiment: sentiment,
      },
      {
        onSuccess: (data) => {
          setDraft(data);
          setComposePhase("review");
        },
      },
    );
  }, [resumeId, templateStyle, jobTitle, organization, jobDescriptionHtml, sentiment, previewMutation, userId]);

  const handleConfirm = useCallback(
    (edited: TailorPreviewResponse) => {
      if (!resumeId) return;
      const { original_resume_text: _, ...contentFields } = edited;
      confirmMutation.mutate(
        {
          user_id: userId,
          resume_id: resumeId,
          template_style: templateStyle,
          job_title: jobTitle,
          organization,
          job_description_html: jobDescriptionHtml,
          cover_letter_sentiment: sentiment,
          ...contentFields,
        },
        {
          onSuccess: (data) => {
            setResult(data);
            setComposePhase("done");
          },
        },
      );
    },
    [resumeId, templateStyle, jobTitle, organization, jobDescriptionHtml, sentiment, confirmMutation, userId],
  );

  const handleRegenerate = useCallback(() => {
    if (!resumeId) return;
    previewMutation.mutate(
      {
        user_id: userId,
        resume_id: resumeId,
        template_style: templateStyle,
        job_title: jobTitle,
        organization,
        job_description_html: jobDescriptionHtml,
        cover_letter_sentiment: sentiment,
      },
      {
        onSuccess: (data) => {
          setDraft(data);
        },
      },
    );
  }, [resumeId, templateStyle, jobTitle, organization, jobDescriptionHtml, sentiment, previewMutation, userId]);

  const handleRegenerateSection = useCallback(
    (sectionId: string, currentContent: string, userInstruction?: string): Promise<string> => {
      if (!resumeId) return Promise.reject(new Error("No resume"));
      return new Promise((resolve, reject) => {
        sectionRegenMutation.mutate(
          {
            user_id: userId,
            resume_id: resumeId,
            section_id: sectionId,
            current_content: currentContent,
            job_title: jobTitle,
            organization,
            job_description_html: jobDescriptionHtml,
            cover_letter_sentiment: sentiment,
            user_instruction: userInstruction,
          },
          {
            onSuccess: (data) => resolve(data.content),
            onError: (err) => reject(err),
          },
        );
      });
    },
    [resumeId, jobTitle, organization, jobDescriptionHtml, sentiment, sectionRegenMutation, userId],
  );

  const handleBackToEditor = useCallback(() => {
    setComposePhase("input");
  }, []);

  const handleNewApplication = useCallback(() => {
    setComposePhase("input");
    setDraft(null);
    setResult(null);
    setJobTitle("");
    setOrganization("");
    setJobDescriptionHtml("");
    setResumeSwapPrompt(null);
  }, []);

  const handleChooseNewResume = useCallback(() => {
    if (!resumeSwapPrompt) return;
    setResumeId(resumeSwapPrompt.newId);
    setResumeSwapPrompt(null);
  }, [resumeSwapPrompt]);

  const handleKeepPreviousResume = useCallback(() => {
    if (!resumeSwapPrompt) return;
    activateResumeMutation.mutate(resumeSwapPrompt.prevId, {
      onSuccess: () => {
        setResumeId(resumeSwapPrompt.prevId);
        setResumeSwapPrompt(null);
      },
    });
  }, [resumeSwapPrompt, activateResumeMutation]);

  const handleClone = useCallback(() => {
    if (!baselineContext) return;
    refEngine
      .submitClone({
        new_job_title: jobTitle,
        new_organization: organization,
        new_job_description_html: jobDescriptionHtml,
      })
      .then((res) => {
        setResult({
          application_id: res.new_application_id,
          tailored_resume_url: res.tailored_resume_url,
          cover_letter_text: res.cover_letter_text,
          cover_letter_url: res.cover_letter_url ?? "",
          resume_pdf_url: res.resume_pdf_url ?? "",
          cover_letter_pdf_url: res.cover_letter_pdf_url ?? "",
        });
        setComposePhase("done");
      });
  }, [baselineContext, refEngine, jobTitle, organization, jobDescriptionHtml]);

  const isComposing = mode === "composing";
  const isPreviewing = previewMutation.isPending;
  const isCloning = refEngine.cloneMutation.isPending;
  const canSubmitTailor =
    resumeId && jobTitle && organization && jobDescriptionHtml && !isPreviewing;
  const canSubmitClone =
    isComposing && jobTitle && organization && jobDescriptionHtml && !isCloning;

  const resumeStorageFull =
    (resumesQuery.data?.length ?? 0) >= MAX_STORED_RESUMES;

  const tailorDisabledReason = !resumeId
    ? resumeStorageFull
      ? "Resume storage full — open Profile to remove a saved file, or pick an existing active resume"
      : "Upload your resume first"
    : !jobTitle || !organization || !jobDescriptionHtml
    ? "Fill in all job details"
    : null;

  if (hidden) return null;

  return (
    <>
      {/* ── Compose: REVIEW (full-width document studio) ───────── */}
      {composePhase === "review" && draft && (
        <DraftReview
          draft={draft}
          templateStyle={templateStyle as TemplateStyle}
          profilePhotoSrc={profilePhotoSrc}
          resumeContact={resumeContact}
          onConfirm={handleConfirm}
          onBack={handleBackToEditor}
          onRegenerate={handleRegenerate}
          onRegenerateSection={handleRegenerateSection}
          isConfirming={confirmMutation.isPending}
          isRegenerating={previewMutation.isPending}
          error={confirmMutation.isError ? extractErrorMessage(confirmMutation.error) : null}
        />
      )}

      {/* ── Compose: INPUT (narrow centered layout) ───────────── */}
      {composePhase === "input" && (
        <div className="page-enter page-shell">
          <div className="mx-auto w-full max-w-3xl">
          {/* Page title */}
          <div className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
              {isComposing ? "Baseline flow" : "Document studio"}
            </p>
            <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-primary sm:text-[1.65rem]">
              {isComposing ? "New application from baseline" : "Create a new application"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
              {isComposing
                ? "Provide new job details to generate a tailored application based on your previous one."
                : "Upload your resume, paste the job description, and let AI analyse and tailor your application."}
            </p>
          </div>

          {/* Baseline indicator */}
          {isComposing && baselineContext && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-subtle p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">
                  Based on: {baselineContext.organization} — {baselineContext.jobTitle}
                </p>
                <p className="text-xs text-secondary">
                  Resume content and format from the baseline will be used for the new application.
                </p>
              </div>
              <button
                onClick={refEngine.reset}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-white hover:text-primary"
              >
                Clear
              </button>
            </div>
          )}

          <div className="space-y-6">
            {/* Step 1: Documents */}
            {!isComposing && (
              <div className="meridian-card-solid">
                <div className="border-b border-border-muted/60 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                      1
                    </span>
                    <h2 className="text-sm font-semibold text-primary">Your resume</h2>
                  </div>
                  <p className="mt-1 ml-9 text-xs text-secondary">
                    Upload a .docx or .pdf, or use your active saved resume. Add a professional headshot anytime in Profile — it appears in tailored exports.
                  </p>
                </div>
                <div className="space-y-5 p-6">
                  <ResumeDrop
                    onUploaded={handleResumeUploaded}
                    uploadMutation={resumeUploadMutation}
                    uploadBlocked={resumeStorageFull}
                    uploadBlockedMessage={`You have ${MAX_STORED_RESUMES} saved resumes. Open Profile to remove one, or use your active resume below.`}
                  />
                  {resumeSwapPrompt && (
                    <div className="rounded-xl border border-brand/25 bg-brand-subtle/80 p-4">
                      <p className="text-sm font-medium text-primary">
                        You uploaded a new file ({resumeSwapPrompt.newFilename}).
                      </p>
                      <p className="mt-1 text-xs text-secondary">
                        Use it for this application, or keep your previous resume
                        as the active one for scoring and tailoring.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleChooseNewResume}
                          disabled={activateResumeMutation.isPending}
                          className="ui-btn-primary px-4 py-2 text-xs"
                        >
                          Use new upload
                        </button>
                        <button
                          type="button"
                          onClick={handleKeepPreviousResume}
                          disabled={activateResumeMutation.isPending}
                          className="ui-btn-secondary px-4 py-2 text-xs"
                        >
                          {activateResumeMutation.isPending
                            ? "Updating…"
                            : "Keep previous resume active"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Resume Template Style */}
            {!isComposing && (
              <div className="meridian-card-solid">
                <div className="border-b border-border-muted/60 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                      2
                    </span>
                    <h2 className="text-sm font-semibold text-primary">Resume Format</h2>
                  </div>
                  <p className="mt-1 ml-9 text-xs text-secondary">
                    Select a resume format that fits your target region and industry.
                  </p>
                </div>
                <div className="p-6">
                  <TemplateGallery
                    selectedId={templateStyle}
                    onSelect={setTemplateStyle}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Job details */}
            <div className="meridian-card-solid">
              <div className="border-b border-border-muted/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                    {isComposing ? "1" : "3"}
                  </span>
                  <h2 className="text-sm font-semibold text-primary">Job Details</h2>
                </div>
              </div>
              <div className="space-y-5 p-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field
                    label="Job Title"
                    value={jobTitle}
                    onChange={setJobTitle}
                    placeholder="e.g. Programme Officer P3"
                  />
                  <Field
                    label="Organization"
                    value={organization}
                    onChange={setOrganization}
                    placeholder="e.g. UNHCR"
                  />
                </div>
                <RichEditor
                  value={jobDescriptionHtml}
                  onChange={setJobDescriptionHtml}
                />
              </div>
            </div>

            {/* Step 4: Tone (only for fresh tailor) */}
            {!isComposing && (
              <div className="meridian-card-solid">
                <div className="border-b border-border-muted/60 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                      4
                    </span>
                    <h2 className="text-sm font-semibold text-primary">Cover letter tone</h2>
                  </div>
                </div>
                <div className="p-6">
                  <SentimentSlider value={sentiment} onChange={setSentiment} />
                </div>
              </div>
            )}

            {/* Submit */}
            {isComposing ? (
              <button
                onClick={handleClone}
                disabled={!canSubmitClone}
                className="ui-btn-primary w-full py-3.5 text-[15px]"
              >
                {isCloning ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Generating...
                  </span>
                ) : (
                  "Generate from Baseline"
                )}
              </button>
            ) : (
              <div className="relative group">
                <button
                  onClick={handlePreview}
                  disabled={!canSubmitTailor}
                  className="ui-btn-primary w-full py-3.5 text-[15px]"
                >
                  {isPreviewing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      Analysing Resume & Generating Draft...
                    </span>
                  ) : (
                    "Analyse & Generate Draft"
                  )}
                </button>
                {tailorDisabledReason && !canSubmitTailor && (
                  <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {tailorDisabledReason}
                  </span>
                )}
              </div>
            )}

            {/* Errors */}
            {previewMutation.isError && (
              <div className="rounded-lg bg-danger-light p-3">
                <p className="text-sm text-danger">
                  {extractErrorMessage(previewMutation.error)}
                </p>
              </div>
            )}
            {refEngine.cloneMutation.isError && (
              <div className="rounded-lg bg-danger-light p-3">
                <p className="text-sm text-danger">
                  {extractErrorMessage(refEngine.cloneMutation.error)}
                </p>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* ── Compose: DONE (wider layout for styled preview) ──── */}
      {composePhase === "done" && result && (
        <div className="page-enter flex-1 overflow-y-auto bg-[#eaecf0]">
          <div className="page-shell !pb-10">
            <div className="mx-auto w-full max-w-[860px]">
            {/* Success banner + download buttons */}
            <div className="mb-6 rounded-2xl border border-success/30 bg-white shadow-sm">
              <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-primary">Application Ready</h3>
                    <p className="text-xs text-secondary">Your tailored documents are ready for download</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {result.resume_pdf_url && (
                    <button
                      type="button"
                      onClick={() => {
                        void downloadGeneratedFile(result.resume_pdf_url!).catch((e) => {
                          window.alert(extractErrorMessage(e));
                        });
                      }}
                      className="ui-btn-primary inline-flex cursor-pointer gap-2 px-4 py-2.5 text-xs"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Resume PDF
                    </button>
                  )}
                  {result.tailored_resume_url && (
                    <button
                      type="button"
                      title="Download as Word document"
                      onClick={() => {
                        void downloadGeneratedFile(result.tailored_resume_url!).catch((e) => {
                          window.alert(extractErrorMessage(e));
                        });
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-muted bg-surface px-3 py-2.5 text-[10px] font-semibold text-secondary shadow-sm transition-all hover:border-brand/40 hover:text-brand"
                    >
                      .docx
                    </button>
                  )}
                  {result.cover_letter_pdf_url && (
                    <button
                      type="button"
                      onClick={() => {
                        void downloadGeneratedFile(result.cover_letter_pdf_url!).catch((e) => {
                          window.alert(extractErrorMessage(e));
                        });
                      }}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2.5 text-xs font-semibold text-brand shadow-sm transition-all hover:bg-brand/10 hover:shadow-md"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Cover Letter PDF
                    </button>
                  )}
                  {result.cover_letter_url && (
                    <button
                      type="button"
                      title="Download as Word document"
                      onClick={() => {
                        void downloadGeneratedFile(result.cover_letter_url!).catch((e) => {
                          window.alert(extractErrorMessage(e));
                        });
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-muted bg-surface px-3 py-2.5 text-[10px] font-semibold text-secondary shadow-sm transition-all hover:border-brand/40 hover:text-brand"
                    >
                      .docx
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Styled preview of final documents — mirrors DraftReview template layout */}
            {draft ? (
              <>
                {/* Resume page */}
                <div className={`doc-page rounded bg-surface shadow-sm tpl-${templateStyle}`}>
                  {templateStyle === "modern" ? (
                    <div className="tpl-grid">
                      <div className="tpl-sidebar space-y-5">
                        {profilePhotoSrc ? (
                          <div className="flex justify-center pb-1">
                            <img
                              src={profilePhotoSrc}
                              alt=""
                              className="h-[7.25rem] w-[7.25rem] rounded-full border-2 border-[rgba(51,107,135,0.25)] object-cover shadow-sm"
                            />
                          </div>
                        ) : null}
                        <ResumeIdentityPanel contact={resumeContact} variant="modern" />
                        {draft.skills && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider mb-2">Skills</h3>
                            <div className="skill-pills">
                              {draft.skills.split(",").map((s, i) => {
                                const trimmed = s.trim();
                                return trimmed ? <span key={i} className="skill-pill">{trimmed}</span> : null;
                              })}
                            </div>
                          </div>
                        )}
                        {draft.education && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider mb-2">Education</h3>
                            <div className="edu-entries">
                              {draft.education.split(/[;\n]/).filter((l: string) => l.trim()).map((entry: string, i: number) => (
                                <div key={i} className="edu-entry">
                                  <p className="text-sm leading-relaxed text-primary/85">{entry.trim()}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {draft.certifications && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider mb-2">Certifications</h3>
                            <div className="cert-entries">
                              {draft.certifications.split(/[;\n]/).filter((l: string) => l.trim()).map((entry: string, i: number) => (
                                <div key={i} className="cert-entry">
                                  <svg className="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    <path d="M9 12l2 2 4-4" />
                                  </svg>
                                  <span className="text-sm leading-relaxed text-primary/85">{entry.trim()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="tpl-main space-y-5">
                        {draft.summary && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider mb-2">Professional Summary</h3>
                            <p className="text-sm leading-relaxed text-primary/85">{draft.summary}</p>
                          </div>
                        )}
                        {draft.experiences?.length > 0 && draft.experiences.map((exp, i) => (
                          <div key={i}>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider mb-2">
                              Experience {draft.experiences.length > 1 ? i + 1 : ""}
                            </h3>
                            <div className="text-sm leading-relaxed text-primary/85 whitespace-pre-wrap">{exp}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="px-12 py-10 sm:px-16 sm:py-12">
                      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <ResumeIdentityPanel contact={resumeContact} variant="strip" />
                        </div>
                        {profilePhotoSrc ? (
                          <div className="flex shrink-0 justify-end sm:pt-0">
                            <img
                              src={profilePhotoSrc}
                              alt=""
                              className="h-[7.25rem] w-[7.25rem] rounded-full border-2 border-border-muted object-cover shadow-sm"
                            />
                          </div>
                        ) : null}
                      </div>
                      {getTemplatePreviewHeader(templateStyle) && (
                        <div className="tpl-header">
                          <div
                            className={
                              templateStyle === "executive" ||
                              templateStyle === "creative" ||
                              templateStyle === "nova"
                                ? "text-[10px] font-medium uppercase tracking-widest text-white/90"
                                : "text-[10px] font-medium uppercase tracking-widest text-secondary/75"
                            }
                          >
                            {getTemplatePreviewHeader(templateStyle)}
                          </div>
                        </div>
                      )}
                      <div className="space-y-5">
                        {draft.summary && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider text-secondary mb-2">Professional Summary</h3>
                            <p className="text-sm leading-relaxed text-primary/85">{draft.summary}</p>
                          </div>
                        )}
                        {draft.experiences?.length > 0 && draft.experiences.map((exp, i) => (
                          <div key={i}>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider text-secondary mb-2">
                              Experience {draft.experiences.length > 1 ? i + 1 : ""}
                            </h3>
                            <div className="text-sm leading-relaxed text-primary/85 whitespace-pre-wrap">{exp}</div>
                          </div>
                        ))}
                        {draft.skills && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider text-secondary mb-2">Skills</h3>
                            <div className="skill-pills">
                              {draft.skills.split(",").map((s: string, i: number) => {
                                const trimmed = s.trim();
                                return trimmed ? <span key={i} className="skill-pill">{trimmed}</span> : null;
                              })}
                            </div>
                          </div>
                        )}
                        {draft.education && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider text-secondary mb-2">Education</h3>
                            <div className="edu-entries">
                              {draft.education.split(/[;\n]/).filter((l: string) => l.trim()).map((entry: string, i: number) => (
                                <div key={i} className="edu-entry">
                                  <p className="text-sm leading-relaxed text-primary/85">{entry.trim()}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {draft.certifications && (
                          <div>
                            <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider text-secondary mb-2">Certifications</h3>
                            <div className="cert-entries">
                              {draft.certifications.split(/[;\n]/).filter((l: string) => l.trim()).map((entry: string, i: number) => (
                                <div key={i} className="cert-entry">
                                  <svg className="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    <path d="M9 12l2 2 4-4" />
                                  </svg>
                                  <span className="text-sm leading-relaxed text-primary/85">{entry.trim()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Page break indicator */}
                <div className="my-5 flex items-center justify-center">
                  <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-secondary/40">
                    <div className="h-px w-10 bg-secondary/20" />
                    Cover Letter
                    <div className="h-px w-10 bg-secondary/20" />
                  </div>
                </div>

                {/* Cover letter page — same template style */}
                <div className={`doc-page rounded bg-surface shadow-sm tpl-${templateStyle}`}>
                  <div className="px-12 py-10 sm:px-16 sm:py-12">
                    <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider text-secondary mb-4">Cover Letter</h3>
                    <div className="text-sm leading-relaxed text-primary/85 whitespace-pre-wrap">
                      {result.cover_letter_text}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* Fallback: no draft available (clone flow) — plain card */
              result.cover_letter_text && (
                <div className={`doc-page rounded bg-surface shadow-sm tpl-${templateStyle}`}>
                  <div className="px-12 py-10 sm:px-16 sm:py-12">
                    <h3 className="tpl-section-heading text-xs font-bold uppercase tracking-wider text-secondary mb-4">Cover Letter</h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary/80">
                      {result.cover_letter_text}
                    </p>
                  </div>
                </div>
              )
            )}

            <button
              onClick={handleNewApplication}
              className="ui-btn-secondary mt-6 w-full py-3.5 text-sm font-semibold"
            >
              Create Another Application
            </button>
            <div className="h-8" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="ui-label">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ui-input mt-1.5"
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
