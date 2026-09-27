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

export function Sidebar({
  isAdmin,
  className,
  onNavigate,
}: {
  isAdmin: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-card text-foreground shadow-[inset_2px_0_0_var(--color-caliper)]"
        : "text-muted hover:bg-card hover:text-foreground",
    );

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "flex h-full w-56 flex-col gap-6 border-r border-border bg-background px-3 py-5",
        className,
      )}
    >
      <div className="px-3 text-lg font-bold tracking-tight text-foreground">
        Rad<span className="text-caliper">Tempo</span>
      </div>
      <div className="flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            onClick={onNavigate}
            aria-current={pathname.startsWith("/admin") ? "page" : undefined}
            className={linkClass(pathname.startsWith("/admin"))}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            Admin
          </Link>
        )}
      </div>
    </nav>
  );
}
