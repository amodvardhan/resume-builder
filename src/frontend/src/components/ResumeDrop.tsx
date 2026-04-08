import { useCallback, useRef, useState, type DragEvent } from "react";
import { extractErrorMessage } from "../api/client";
import type { ResumeUploadResponse } from "../types/api";

interface ResumeDropProps {
  onUploaded: (response: ResumeUploadResponse) => void;
  uploadMutation: {
    mutate: (file: File, options: { onSuccess: (data: ResumeUploadResponse) => void }) => void;
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: Error | null;
    data?: ResumeUploadResponse;
  };
  /** When true, new uploads are blocked (e.g. stored resume limit reached). */
  uploadBlocked?: boolean;
  uploadBlockedMessage?: string;
}

export default function ResumeDrop({
  onUploaded,
  uploadMutation,
  uploadBlocked = false,
  uploadBlockedMessage = "Remove a saved resume on your profile before uploading another.",
}: ResumeDropProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (uploadBlocked) return;
      const name = file.name.toLowerCase();
      if (!name.endsWith(".docx") && !name.endsWith(".pdf")) return;
      uploadMutation.mutate(file, { onSuccess: onUploaded });
    },
    [uploadMutation, onUploaded, uploadBlocked],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (uploadBlocked) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, uploadBlocked],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragOver(false), []);
  const onClickArea = useCallback(() => {
    if (uploadBlocked) return;
    fileInputRef.current?.click();
  }, [uploadBlocked]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const isLoading = uploadMutation.isPending;
  const isUploaded = uploadMutation.isSuccess && uploadMutation.data;

  if (isUploaded && uploadMutation.data) {
    const data = uploadMutation.data;
    return (
      <div className="space-y-2">
        <label className="ui-label">
          Your Resume
        </label>
        <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-light px-4 py-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-primary">{data.original_filename}</span>
            {uploadBlocked && (
              <span className="mt-1 block text-[10px] text-secondary">
                {uploadBlockedMessage}
              </span>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary shadow-sm">
            {data.file_type}
          </span>
          <button
            type="button"
            onClick={onClickArea}
            disabled={uploadBlocked}
            className="shrink-0 rounded-lg p-1.5 text-secondary transition-colors hover:bg-white hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            title={uploadBlocked ? "Storage limit reached" : "Replace resume"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept=".docx,.pdf" className="hidden" onChange={onFileChange} />
        </div>
      </div>
    );
  }

  if (uploadBlocked) {
    return (
      <div className="space-y-2">
        <label className="ui-label">
          Your Resume
        </label>
        <div className="rounded-xl border border-border-muted bg-muted/40 px-4 py-6 text-center">
          <p className="text-sm font-medium text-primary">Resume storage is full</p>
          <p className="mt-1 text-xs text-secondary">{uploadBlockedMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="ui-label">
        Your Resume
      </label>

      <div
        role="button"
        tabIndex={0}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onClickArea}
        onKeyDown={(e) => e.key === "Enter" && onClickArea()}
        className={`
          ui-dropzone relative flex cursor-pointer flex-col items-center justify-center px-6 py-8
          ${isDragOver ? "ui-dropzone--active" : ""}
          ${isLoading ? "ui-dropzone--disabled pointer-events-none opacity-60" : ""}
        `}
      >
        {isLoading ? (
          <div className="space-y-3 w-full">
            <div className="mx-auto h-3 w-3/4 animate-pulse rounded bg-brand-light" />
            <div className="mx-auto h-3 w-1/2 animate-pulse rounded bg-brand-light" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-brand"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-primary">
              Drop your latest resume here
            </p>
            <p className="mt-1 text-xs text-secondary">
              or click to browse &middot; Supports .docx and .pdf
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {uploadMutation.isError && (
        <div className="rounded-lg bg-danger-light p-2.5">
          <p className="text-xs text-danger">
            {extractErrorMessage(uploadMutation.error)}
          </p>
        </div>
      )}
    </div>
  );
}
