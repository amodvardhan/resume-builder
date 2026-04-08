import { useState, useMemo, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { extractErrorMessage } from "../api/client";

interface RegisterPageProps {
  onSwitchToLogin?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const auth = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const strengthLabel =
    passwordStrength <= 1
      ? "Weak"
      : passwordStrength === 2
        ? "Fair"
        : passwordStrength === 3
          ? "Good"
          : "Strong";

  const strengthBarColor =
    passwordStrength <= 1
      ? "bg-red-500"
      : passwordStrength === 2
        ? "bg-amber-500"
        : "bg-emerald-500";

  const strengthTextColor =
    passwordStrength <= 1
      ? "text-red-500"
      : passwordStrength === 2
        ? "text-amber-500"
        : "text-emerald-500";

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!EMAIL_RE.test(email)) errs.email = "Enter a valid email address";
    if (password.length < 8) errs.password = "Password must be at least 8 characters";
    if (password !== confirmPassword) errs.confirmPassword = "Passwords do not match";

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await auth.register(fullName.trim(), email.trim(), password);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center animate-fade-in-up">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-brand/15 ring-1 ring-border-muted/60">
            <img
              src="/meridian-logo.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 object-cover"
            />
          </div>
          <h1 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-primary">
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-secondary">
            Get started with Meridian
          </p>
        </div>

        {/* Card */}
        <div className="meridian-card-solid animate-scale-in overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
            {/* Server error */}
            {error && (
              <div className="rounded-lg bg-danger-light px-4 py-3 animate-fade-in-up">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            {/* Full Name */}
            <div className="animate-fade-in-up stagger-1">
              <label htmlFor="reg-name" className="ui-label">
                Full name
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="ui-input mt-1.5"
              />
              {fieldErrors.fullName && (
                <p className="mt-1 text-xs text-danger">{fieldErrors.fullName}</p>
              )}
            </div>

            {/* Email */}
            <div className="animate-fade-in-up stagger-2">
              <label htmlFor="reg-email" className="ui-label">
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="ui-input mt-1.5"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="animate-fade-in-up stagger-3">
              <label htmlFor="reg-password" className="ui-label">
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="ui-input mt-1.5"
              />
              {password && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i <= passwordStrength ? strengthBarColor : "bg-border-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-[11px] font-medium ${strengthTextColor}`}>
                    {strengthLabel}
                  </p>
                </div>
              )}
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-danger">{fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="animate-fade-in-up stagger-4">
              <label htmlFor="reg-confirm" className="ui-label">
                Confirm password
              </label>
              <input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="ui-input mt-1.5"
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-danger">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            {/* Submit */}
            <div className="animate-fade-in-up stagger-5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="ui-btn-primary w-full py-3.5 text-[15px]"
              >
                {isSubmitting ? (
                  <>
                    <Spinner />
                    Creating account…
                  </>
                ) : (
                  "Create Account"
                )}
              </button>
            </div>
          </form>

          {/* Footer link */}
          <div className="border-t border-border-muted/60 bg-surface-raised/90 px-6 py-5 text-center sm:px-8">
            <p className="text-sm text-secondary">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="font-medium text-brand transition-colors hover:text-brand-dark"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
