import { useCallback, useRef, useState, type DragEvent } from "react";
import { useUploadTemplate } from "../hooks/useResumeEngine";
import { extractErrorMessage } from "../api/client";
import type { TemplateUploadResponse } from "../types/api";

interface MagicDropProps {
  onUploaded: (response: TemplateUploadResponse) => void;
}

export default function MagicDrop({ onUploaded }: MagicDropProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadTemplate();

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".docx")) return;
      uploadMutation.mutate(
        { file, name: file.name, is_master: true },
        { onSuccess: onUploaded },
      );
    },
    [uploadMutation, onUploaded],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragOver(false), []);

  const onClickArea = useCallback(() => fileInputRef.current?.click(), []);

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
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-secondary">
          Resume Template
        </label>
        <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-light px-4 py-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
            {uploadMutation.data.name}
          </span>
          <button
            onClick={onClickArea}
            className="shrink-0 rounded-lg p-1.5 text-secondary transition-colors hover:bg-white hover:text-primary"
            title="Replace template"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept=".docx" className="hidden" onChange={onFileChange} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-secondary">
        Resume Template
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
          relative flex cursor-pointer flex-col items-center justify-center
          rounded-xl px-6 py-8 transition-all duration-200
          ${
            isDragOver
              ? "border-2 border-solid border-border-hover bg-skeleton/30"
              : "border-2 border-dashed border-border-muted bg-muted hover:border-border-hover hover:bg-border-light"
          }
          ${isLoading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        {isLoading ? (
          <div className="space-y-3 w-full">
            <div className="mx-auto h-3 w-3/4 animate-pulse rounded bg-skeleton" />
            <div className="mx-auto h-3 w-1/2 animate-pulse rounded bg-skeleton" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-border-muted/50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-primary">
              Drop your .docx template here
            </p>
            <p className="mt-1 text-xs text-secondary">
              or click to browse
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
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
