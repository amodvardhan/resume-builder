import { useCallback, useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import Header from "./components/Header";
import type { PageView } from "./components/Header";
import HistoryPage from "./components/HistoryPage";
import ProfilePage from "./components/ProfilePage";
import Dashboard from "./components/Dashboard";
import PreferencesPage from "./components/PreferencesPage";
import ComposePage from "./components/ComposePage";
import { IoJobsPage } from "./io-jobs";
import type { ComposePhase } from "./components/ComposePage";
import type { ComposeJobPrefill } from "./types/api";
import { useUserProfile, useUpdateUser } from "./hooks/useResumeEngine";
import { useReferenceEngine } from "./hooks/useHistory";

type AuthView = "login" | "register";

export default function App() {
  const auth = useAuth();
  const [authView, setAuthView] = useState<AuthView>("login");

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="meridian-card-solid flex flex-col items-center gap-4 px-10 py-8">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-brand/10 blur-xl" aria-hidden />
            <svg className="relative h-9 w-9 animate-spin text-brand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-primary">Loading Meridian</p>
            <p className="mt-0.5 text-xs text-secondary">Preparing your workspace</p>
          </div>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    if (authView === "register") {
      return <RegisterPage onSwitchToLogin={() => setAuthView("login")} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthView("register")} />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const auth = useAuth();
  const USER_ID = auth.user!.id;

  const [currentPage, setCurrentPage] = useState<PageView>("dashboard");
  const [composePhase, setComposePhase] = useState<ComposePhase>("input");
  const [composeResetSignal, setComposeResetSignal] = useState(0);
  const [composeJobPrefill, setComposeJobPrefill] =
    useState<ComposeJobPrefill | null>(null);

  const userProfile = useUserProfile(USER_ID);
  const updateUserMutation = useUpdateUser(USER_ID);
  const refEngine = useReferenceEngine(USER_ID);

  const handleNavigate = useCallback(
    (page: PageView) => {
      if (currentPage === "compose" && page !== "compose") {
        setComposeJobPrefill(null);
      }
      if (page === "compose" && currentPage !== "compose") {
        setComposeResetSignal((s) => s + 1);
        setComposePhase("input");
        setComposeJobPrefill(null);
      }
      setCurrentPage(page);
    },
    [currentPage],
  );

  const handleActivateBaseline = useCallback(
    (applicationId: string) => {
      refEngine.selectReference(applicationId);
      setTimeout(() => {
        refEngine.activateBaseline();
        setComposeJobPrefill(null);
        setComposeResetSignal((s) => s + 1);
        setComposePhase("input");
        setCurrentPage("compose");
      }, 100);
    },
    [refEngine],
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        currentPage={currentPage}
        onNavigate={handleNavigate}
        user={userProfile.data}
        isLoading={userProfile.isLoading}
      />

      <div className="flex flex-1 flex-col min-h-0">
        {/* ── Dashboard page ─────────────────────────────────────── */}
        {currentPage === "dashboard" && (
          <Dashboard
            userId={USER_ID}
            onNavigatePreferences={() => setCurrentPage("preferences")}
            onNavigateProfile={() => setCurrentPage("profile")}
            onComposeWithJobPrefill={(prefill) => {
              setComposeJobPrefill(prefill);
              setCurrentPage("compose");
            }}
          />
        )}

        {currentPage === "io_jobs" && <IoJobsPage />}

        {/* ── Preferences page ─────────────────────────────────── */}
        {currentPage === "preferences" && <PreferencesPage />}

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
            userId={USER_ID}
            profile={userProfile.data}
            onSave={(updates) => updateUserMutation.mutateAsync(updates).then(() => {})}
            isSaving={updateUserMutation.isPending}
            error={updateUserMutation.isError ? updateUserMutation.error : null}
          />
        )}

        {/* ── Compose page ───────────────────────────────────────── */}
        <ComposePage
          userId={USER_ID}
          refEngine={refEngine}
          onPhaseChange={setComposePhase}
          hidden={currentPage !== "compose"}
          resetSignal={composeResetSignal}
          jobPrefill={composeJobPrefill}
        />
      </div>

      {/* Footer — hidden during review/done phases to give full canvas space */}
      {!(currentPage === "compose" && (composePhase === "review" || composePhase === "done")) && (
        <footer className="mt-auto border-t border-border-muted bg-surface/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p className="text-[11px] font-medium text-secondary">
              Meridian — AI-powered resume tailoring
            </p>
            <p className="text-[11px] text-secondary/70">
              Crafted for clarity and control
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
