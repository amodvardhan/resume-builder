import { useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { extractErrorMessage } from "../api/client";

interface LoginPageProps {
  onSwitchToRegister?: () => void;
}

export default function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const auth = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await auth.login(email, password);
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
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand to-indigo-600 shadow-lg shadow-brand/25 ring-1 ring-white/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-primary">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-secondary">
            Sign in to your Meridian account
          </p>
        </div>

        {/* Card */}
        <div className="meridian-card-solid animate-scale-in overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
            {/* Error */}
            {error && (
              <div className="rounded-lg bg-danger-light px-4 py-3 animate-fade-in-up">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            {/* Email */}
            <div className="animate-fade-in-up stagger-1">
              <label htmlFor="login-email" className="ui-label">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="ui-input mt-1.5"
              />
            </div>

            {/* Password */}
            <div className="animate-fade-in-up stagger-2">
              <label htmlFor="login-password" className="ui-label">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="ui-input mt-1.5"
              />
            </div>

            {/* Remember me */}
            <div className="animate-fade-in-up stagger-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={rememberMe}
                  aria-label="Remember this device"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="ui-switch"
                />
                <span
                  className="cursor-pointer select-none text-sm text-secondary hover:text-primary"
                  onClick={() => setRememberMe(!rememberMe)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setRememberMe(!rememberMe);
                    }
                  }}
                  role="presentation"
                >
                  Remember this device
                </span>
              </div>
            </div>

            {/* Submit */}
            <div className="animate-fade-in-up stagger-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="ui-btn-primary w-full py-3.5 text-[15px]"
              >
                {isSubmitting ? (
                  <>
                    <Spinner />
                    Signing in…
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </div>
          </form>

          {/* Footer link */}
          <div className="border-t border-border-muted/60 bg-surface-raised/90 px-6 py-5 text-center sm:px-8">
            <p className="text-sm text-secondary">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="font-medium text-brand transition-colors hover:text-brand-dark"
              >
                Sign up
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
