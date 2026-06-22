"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-5 py-3 bg-base/80 backdrop-blur-xl border-b border-border">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg"
      >
        <svg width="16" height="16" viewBox="0 0 58 58" fill="none" aria-hidden>
          <circle
            cx="29" cy="29" r="22"
            stroke="url(#liminaMarkHdr)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="104 34"
            transform="rotate(-90 29 29)"
          />
          <defs>
            <linearGradient id="liminaMarkHdr" x1="0" y1="0" x2="58" y2="58">
              <stop offset="0%" stopColor="#5b8def" />
              <stop offset="100%" stopColor="#7fc8c0" />
            </linearGradient>
          </defs>
        </svg>
        <span className="font-serif text-[15px] tracking-[0.05em] text-secondary">
          Spronova
        </span>
      </Link>

      <div className="flex items-center gap-1">
        <ThemeToggle />

        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            title="Esci da Spronova"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Esci</span>
            <span className="sr-only sm:hidden">Esci da Spronova</span>
          </button>
        </form>
      </div>
    </header>
  );
}
