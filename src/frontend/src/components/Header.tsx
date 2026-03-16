import type { ReactNode } from "react";
import type { UserProfile } from "../types/api";

export type PageView = "compose" | "history" | "profile";

interface HeaderProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
  user: UserProfile | undefined;
  isLoading: boolean;
}

const NAV_ITEMS: { id: PageView; label: string; icon: ReactNode }[] = [
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
    id: "profile",
    label: "Profile",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
];

export default function Header({ currentPage, onNavigate, user, isLoading }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border-muted bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <button
          onClick={() => onNavigate("compose")}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-primary">
            Meridian
          </span>
        </button>

        {/* Navigation */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`
                  flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium
                  transition-all duration-150
                  ${isActive
                    ? "bg-brand-subtle text-brand"
                    : "text-secondary hover:bg-muted hover:text-primary"
                  }
                `}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile navigation */}
        <nav className="flex sm:hidden items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`
                  flex items-center justify-center rounded-lg p-2.5 text-sm
                  transition-all duration-150
                  ${isActive
                    ? "bg-brand-subtle text-brand"
                    : "text-secondary hover:bg-muted hover:text-primary"
                  }
                `}
                title={item.label}
              >
                {item.icon}
              </button>
            );
          })}
        </nav>

        {/* User area */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-skeleton" />
          ) : user ? (
            <button
              onClick={() => onNavigate("profile")}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand">
                {user.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <span className="hidden md:block text-sm font-medium text-primary">
                {user.full_name}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
