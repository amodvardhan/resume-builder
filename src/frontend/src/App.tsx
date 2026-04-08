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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-8 w-8 animate-spin text-brand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-secondary">Loading...</p>
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
