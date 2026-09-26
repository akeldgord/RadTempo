"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  History,
  ListChecks,
  Trophy,
  Settings,
  ShieldCheck,
  Play,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Start", icon: Play },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/studies", label: "Studies", icon: ListChecks },
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="flex h-full w-56 flex-col gap-1 border-r border-border bg-card px-3 py-4"
    >
      <div className="px-3 pb-4 text-lg font-semibold text-foreground">
        RadTempo
      </div>
      {navItems.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-primary"
                : "text-foreground hover:bg-muted-bg",
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          aria-current={pathname.startsWith("/admin") ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/admin")
              ? "bg-accent text-primary"
              : "text-foreground hover:bg-muted-bg",
          )}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Admin
        </Link>
      )}
    </nav>
  );
}
