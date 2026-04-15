import { useState, useEffect, type ReactNode } from "react";
import type { UserProfile } from "../types/api";
import { useAuth } from "../contexts/AuthContext";

export type PageView =
  | "compose"
  | "history"
  | "dashboard"
  | "io_jobs"
  | "preferences"
  | "profile";

interface HeaderProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
  user: UserProfile | undefined;
  isLoading: boolean;
}

const NAV_ITEMS: { id: PageView; label: string; icon: ReactNode }[] = [
  {
    id: "dashboard",
    label: "Matches",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    id: "io_jobs",
    label: "IO careers",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .53-.051 1.05-.147 1.553" />
      </svg>
    ),
  },
  {
    id: "compose",
    label: "New Application",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "preferences",
    label: "Search setup",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    id: "profile",
    label: "Profile",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
];

export default function Header({
  currentPage,
  onNavigate,
  user,
  isLoading,
}: HeaderProps) {
  const { logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-border-muted/70 bg-surface/75 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.12)] backdrop-blur-xl"
          : "border-transparent bg-surface/45 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex h-[3.65rem] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand — home is the command center (Matches) */}
        <button
          type="button"
          onClick={() => onNavigate("dashboard")}
          className="group flex min-w-0 items-center gap-2.5 rounded-xl py-1.5 text-left transition-opacity hover:opacity-90"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md shadow-brand/15 ring-1 ring-border-muted/60">
            <img
              src="/meridian-logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-cover"
            />
          </div>
          <span className="truncate text-[15px] font-semibold tracking-tight text-primary">
            Meridian
          </span>
        </button>

        {/* Navigation — segmented control (desktop) */}
        <nav
          className="hidden min-w-0 flex-1 justify-center sm:flex"
          aria-label="Main"
        >
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border-muted/60 bg-muted/50 p-1 shadow-inner shadow-black/3">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`
                    flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium
                    transition-all duration-200
                    ${isActive
                      ? "bg-surface text-primary shadow-sm ring-1 ring-black/6"
                      : "text-secondary hover:bg-surface/70 hover:text-primary"
                    }
                  `}
                >
                  <span className={isActive ? "text-brand" : "text-secondary"}>{item.icon}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Mobile navigation */}
        <nav className="flex min-w-0 flex-1 justify-end sm:hidden" aria-label="Main">
          <div className="flex max-w-[100vw] items-center gap-0.5 overflow-x-auto rounded-full border border-border-muted/60 bg-muted/50 p-1">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`
                    flex shrink-0 items-center justify-center rounded-full p-2.5
                    transition-all duration-200
                    ${isActive
                      ? "bg-surface text-brand shadow-sm ring-1 ring-black/6"
                      : "text-secondary hover:bg-surface/80 hover:text-primary"
                    }
                  `}
                  title={item.label}
                >
                  {item.icon}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User area */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {isLoading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-skeleton ring-2 ring-surface" />
          ) : user ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className="flex max-w-44 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted/90"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-700 to-slate-900 text-[11px] font-semibold text-white shadow-md ring-2 ring-white/90">
                  {user.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <span className="hidden min-w-0 truncate text-[13px] font-medium text-primary md:block">
                  {user.full_name}
                </span>
              </button>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                className="rounded-full p-2.5 text-secondary transition-colors hover:bg-muted hover:text-primary"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
