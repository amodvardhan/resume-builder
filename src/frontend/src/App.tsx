import { useCallback, useState } from "react";
import Header from "./components/Header";
import type { PageView } from "./components/Header";
import HistoryPage from "./components/HistoryPage";
import ProfilePage from "./components/ProfilePage";
import MagicDrop from "./components/MagicDrop";
import ResumeDrop from "./components/ResumeDrop";
import RichEditor from "./components/RichEditor";
import SentimentSlider from "./components/SentimentSlider";
import DraftReview from "./components/DraftReview";
import type { SentimentValue } from "./components/SentimentSlider";
import {
  useUserProfile,
  useTailorPreview,
  useTailorConfirm,
  useUpdateUser,
  useUploadResume,
} from "./hooks/useResumeEngine";
import { useReferenceEngine } from "./hooks/useHistory";
import { extractErrorMessage, getFileDownloadUrl } from "./api/client";
import type {
  TemplateUploadResponse,
  ResumeUploadResponse,
  TailorPreviewResponse,
  TailorConfirmResponse,
} from "./types/api";

type ComposePhase = "input" | "review" | "done";

const USER_ID = import.meta.env.VITE_USER_ID ?? "default-user";

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageView>("compose");
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobDescriptionHtml, setJobDescriptionHtml] = useState("");
  const [sentiment, setSentiment] = useState<SentimentValue>("formal");

  const [composePhase, setComposePhase] = useState<ComposePhase>("input");
  const [draft, setDraft] = useState<TailorPreviewResponse | null>(null);
  const [result, setResult] = useState<TailorConfirmResponse | null>(null);

  const userProfile = useUserProfile(USER_ID);
  const updateUserMutation = useUpdateUser(USER_ID);
  const previewMutation = useTailorPreview();
  const confirmMutation = useTailorConfirm();
  const resumeUploadMutation = useUploadResume(USER_ID);

  const refEngine = useReferenceEngine(USER_ID);
  const { mode, baselineContext } = refEngine;

  const handleResumeUploaded = useCallback(
    (res: ResumeUploadResponse) => setResumeId(res.resume_id),
    [],
  );

  const handleTemplateUploaded = useCallback(
    (res: TemplateUploadResponse) => setTemplateId(res.template_id),
    [],
  );

  const handlePreview = useCallback(() => {
    if (!templateId || !resumeId) return;
    previewMutation.mutate(
      {
        user_id: USER_ID,
        resume_id: resumeId,
        template_id: templateId,
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
  }, [resumeId, templateId, jobTitle, organization, jobDescriptionHtml, sentiment, previewMutation]);

  const handleConfirm = useCallback(
    (edited: TailorPreviewResponse) => {
      if (!templateId || !resumeId) return;
      confirmMutation.mutate(
        {
          user_id: USER_ID,
          resume_id: resumeId,
          template_id: templateId,
          job_title: jobTitle,
          organization,
          job_description_html: jobDescriptionHtml,
          cover_letter_sentiment: sentiment,
          ...edited,
        },
        {
          onSuccess: (data) => {
            setResult(data);
            setComposePhase("done");
            setDraft(null);
          },
        },
      );
    },
    [resumeId, templateId, jobTitle, organization, jobDescriptionHtml, sentiment, confirmMutation],
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
  }, []);

  const handleActivateBaseline = useCallback((applicationId: string) => {
    refEngine.selectReference(applicationId);
    setTimeout(() => {
      refEngine.activateBaseline();
      setJobTitle("");
      setOrganization("");
      setJobDescriptionHtml("");
      setResult(null);
      setDraft(null);
      setComposePhase("input");
      setCurrentPage("compose");
    }, 100);
  }, [refEngine]);

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
        });
        setComposePhase("done");
      });
  }, [baselineContext, refEngine, jobTitle, organization, jobDescriptionHtml]);

  const isComposing = mode === "composing";
  const isPreviewing = previewMutation.isPending;
  const isCloning = refEngine.cloneMutation.isPending;
  const canSubmitTailor =
    resumeId && templateId && jobTitle && organization && jobDescriptionHtml && !isPreviewing;
  const canSubmitClone =
    isComposing && jobTitle && organization && jobDescriptionHtml && !isCloning;

  const tailorDisabledReason = !resumeId
    ? "Upload your resume first"
    : !templateId
    ? "Upload a resume template"
    : !jobTitle || !organization || !jobDescriptionHtml
    ? "Fill in all job details"
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        user={userProfile.data}
        isLoading={userProfile.isLoading}
      />

      <div className="flex flex-1 flex-col min-h-0">
        {/* ── History page ────────────────────────────────────────── */}
        {currentPage === "history" && (
          <HistoryPage
            userId={USER_ID}
            onUseAsBaseline={handleActivateBaseline}
          />
        )}

        {/* ── Profile page ───────────────────────────────────────── */}
        {currentPage === "profile" && userProfile.data && (
          <ProfilePage
            profile={userProfile.data}
            onSave={(updates) => updateUserMutation.mutateAsync(updates).then(() => {})}
            isSaving={updateUserMutation.isPending}
            error={updateUserMutation.isError ? updateUserMutation.error : null}
          />
        )}

        {/* ── Compose: REVIEW (full-width document studio) ───────── */}
        {currentPage === "compose" && composePhase === "review" && draft && (
          <DraftReview
            draft={draft}
            onConfirm={handleConfirm}
            onBack={handleBackToEditor}
            isConfirming={confirmMutation.isPending}
            error={confirmMutation.isError ? extractErrorMessage(confirmMutation.error) : null}
          />
        )}

        {/* ── Compose: INPUT + DONE (narrow centered layout) ─────── */}
        {currentPage === "compose" && composePhase !== "review" && (
          <div className="page-enter mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">

            {/* ──── Phase: INPUT ──────────────────────────────────── */}
            {composePhase === "input" && (
              <>
                {/* Page title */}
                <div className="mb-8">
                  <h1 className="text-2xl font-semibold tracking-tight text-primary">
                    {isComposing ? "New Application from Baseline" : "Create New Application"}
                  </h1>
                  <p className="mt-1 text-sm text-secondary">
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
                        Resume and template will be carried over from the baseline.
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
                    <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
                      <div className="border-b border-border-light px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                            1
                          </span>
                          <h2 className="text-sm font-semibold text-primary">Upload Documents</h2>
                        </div>
                        <p className="mt-1 ml-9 text-xs text-secondary">
                          Your resume will be analysed by AI and tailored to match the job description.
                        </p>
                      </div>
                      <div className="space-y-5 p-6">
                        <ResumeDrop
                          onUploaded={handleResumeUploaded}
                          uploadMutation={resumeUploadMutation}
                        />
                        <MagicDrop onUploaded={handleTemplateUploaded} />
                      </div>
                    </div>
                  )}

                  {/* Step 2: Job details */}
                  <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
                    <div className="border-b border-border-light px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                          {isComposing ? "1" : "2"}
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

                  {/* Step 3: Tone (only for fresh tailor) */}
                  {!isComposing && (
                    <div className="rounded-2xl border border-border-light bg-surface shadow-sm">
                      <div className="border-b border-border-light px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                            3
                          </span>
                          <h2 className="text-sm font-semibold text-primary">Cover Letter Tone</h2>
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
                      className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
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
                        className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
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
              </>
            )}

            {/* ──── Phase: DONE ──────────────────────────────────── */}
            {composePhase === "done" && result && (
              <div className="page-enter">
                {/* Progress indicator */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 text-xs font-medium text-secondary">
                    <span className="text-brand">Input</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-border-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-brand">Review Draft</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-border-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="rounded-full bg-success px-2 py-0.5 text-white">Complete</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-success/20 bg-success-light shadow-sm">
                  <div className="border-b border-success/10 px-6 py-4 sm:px-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-primary">Application Ready</h3>
                      </div>
                      {result.tailored_resume_url && (
                        <a
                          href={getFileDownloadUrl(result.tailored_resume_url)}
                          download
                          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow-md"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          Download .docx
                        </a>
                      )}
                    </div>
                  </div>

                  {result.cover_letter_text && (
                    <div className="p-6 sm:p-8">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                        Cover Letter
                      </h4>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary/80">
                        {result.cover_letter_text}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleNewApplication}
                  className="mt-6 w-full rounded-xl border border-border-muted bg-surface py-3.5 text-sm font-semibold text-primary shadow-sm transition-all hover:border-brand hover:text-brand"
                >
                  Create Another Application
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — hidden during document review to give full canvas space */}
      {!(currentPage === "compose" && composePhase === "review") && (
        <footer className="mt-auto border-t border-border-light bg-surface/50">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <p className="text-xs text-secondary">
              Meridian &middot; AI-powered resume tailoring
            </p>
            <p className="text-xs text-secondary/60">
              Built with care
            </p>
          </div>
        </footer>
      )}
    </div>
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
      <label className="block text-xs font-medium text-secondary">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-border-muted bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary/50 transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
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
