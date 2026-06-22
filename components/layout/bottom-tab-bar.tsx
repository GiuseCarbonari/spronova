"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Settings, SquareUser, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { label: "Oggi", href: "/dashboard", icon: Sparkles, tourId: undefined },
  { label: "Piano", href: "/plan", icon: CalendarDays, tourId: "tour-tab-plan" },
  { label: "Profilo", href: "/profile", icon: SquareUser, tourId: "tour-tab-profile" },
  { label: "Impostazioni", href: "/settings/profile", icon: Settings, tourId: undefined },
] as const;

/**
 * Tab bar fissa in basso (design CurveLoad): sostituisce la nav in header
 * sulle schermate già ridisegnate. Le altre rotte restano su AppHeader
 * finché non vengono ridisegnate a loro volta.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-base/90 backdrop-blur-xl"
    >
      <div
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
        className="mx-auto flex max-w-[640px] items-center justify-around px-2 pt-2.5"
      >
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              id={tab.tourId}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-[10px] font-semibold transition-colors",
                active ? "text-brand" : "text-muted hover:text-secondary"
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
