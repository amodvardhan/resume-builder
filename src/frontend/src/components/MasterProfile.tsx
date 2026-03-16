import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "../types/api";
import { extractErrorMessage } from "../api/client";

interface MasterProfileProps {
  profile: UserProfile;
  onSave: (updates: {
    full_name?: string;
    email?: string;
    core_skills?: string[];
  }) => Promise<void>;
  isSaving: boolean;
  error: unknown;
}

export default function MasterProfile({
  profile,
  onSave,
  isSaving,
  error,
}: MasterProfileProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fullName, setFullName] = useState(profile.full_name);
  const [email, setEmail] = useState(profile.email);
  const [skillsText, setSkillsText] = useState(profile.core_skills.join(", "));
  const [saved, setSaved] = useState(false);

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

    await onSave({
      full_name: fullName,
      email,
      core_skills: coreSkills,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [fullName, email, skillsText, onSave]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-xs font-medium text-secondary transition-colors duration-200 ease-in-out hover:text-primary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
        Edit Profile
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-border-light bg-surface p-6 shadow-sm transition-all duration-200 ease-in-out">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">
          Master Profile
        </h2>
        <button
          onClick={() => setIsOpen(false)}
          className="text-xs text-secondary hover:text-primary transition-colors duration-200 ease-in-out"
        >
          Close
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-border-muted bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-secondary/50 transition-colors duration-200 ease-in-out focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-border-muted bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-secondary/50 transition-colors duration-200 ease-in-out focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
            Core Skills
          </label>
          <p className="mt-0.5 text-[11px] text-secondary">
            Comma-separated list of your key skills
          </p>
          <textarea
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            rows={3}
            placeholder="e.g. Project Management, Data Analysis, Python, Stakeholder Engagement"
            className="mt-1.5 w-full resize-y rounded-md border border-border-muted bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-secondary/50 transition-colors duration-200 ease-in-out focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity duration-200 ease-in-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? "Saving…" : "Save Profile"}
          </button>
          {saved && (
            <span className="text-xs text-green-600 transition-opacity duration-200 ease-in-out">
              Saved
            </span>
          )}
          {error != null && (
            <span className="text-xs text-red-600">
              {extractErrorMessage(error)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
