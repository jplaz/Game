"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Home,
  Plus,
  Search,
  Users,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/memories/new", label: "Add Memory", icon: Plus, primary: true },
  { href: "/chapters", label: "Chapters", icon: BookOpen },
  { href: "/family", label: "Family", icon: Users },
] as const;

/** Mobile bottom tab bar + desktop header nav. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      {/* desktop header */}
      <header className="hidden md:block sticky top-0 z-40 bg-cream-50/90 backdrop-blur border-b border-sand-100">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <Link href="/home" className="font-display text-xl text-ink-700">
            Little Chapters
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                    "primary" in tab && tab.primary
                      ? "bg-clay-600 text-cream-50 hover:bg-clay-700 ml-1"
                      : active
                        ? "bg-sand-100 text-ink-700"
                        : "text-ink-400 hover:text-ink-600"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
            <Link
              href="/search"
              aria-label="Search"
              className={cn(
                "p-2.5 rounded-full transition-colors",
                pathname.startsWith("/search")
                  ? "bg-sand-100 text-ink-700"
                  : "text-ink-400 hover:text-ink-600"
              )}
            >
              <Search className="h-4.5 w-4.5" size={18} />
            </Link>
          </nav>
        </div>
      </header>

      {/* mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-sand-100 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname.startsWith(tab.href);
            const primary = "primary" in tab && tab.primary;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-0.5"
              >
                <span
                  className={cn(
                    "grid place-items-center transition-colors",
                    primary
                      ? "h-11 w-11 -mt-5 rounded-full bg-clay-600 text-cream-50 shadow-lifted"
                      : cn("h-7 w-7 rounded-lg", active ? "text-clay-700" : "text-ink-300")
                  )}
                >
                  <Icon size={primary ? 22 : 21} strokeWidth={active || primary ? 2.2 : 1.8} />
                </span>
                {!primary ? (
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      active ? "text-clay-700" : "text-ink-300"
                    )}
                  >
                    {tab.label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
