"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SelectTextOnFocus } from "@/components/SelectTextOnFocus";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

type NavItem = {
  href: string;
  label: string;
  /** Only this path (e.g. Create challan vs list). */
  exact?: boolean;
  /** Active for this path and subpaths (e.g. /customers/edit). */
  prefix?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    title: "Overview",
    items: [{ href: "/", label: "Home" }]
  },
  {
    title: "Inventory",
    items: [
      { href: "/stock", label: "View stock" },
      { href: "/stock-report", label: "Detail stock report" },
      { href: "/boxes", label: "View boxes" },
      { href: "/add-stock", label: "Add stock" }
    ]
  },
  {
    title: "Challans",
    items: [
      { href: "/challan", label: "Create challan", exact: true },
      { href: "/challan/list", label: "All challans" }
    ]
  },
  {
    title: "Customers & lots",
    items: [
      { href: "/customers", label: "View customers", prefix: true },
      { href: "/add-customer", label: "Add customer" },
      { href: "/add-item", label: "Add lot" }
    ]
  },
  {
    title: "Settings",
    items: [{ href: "/settings/company", label: "Company & GST" }]
  }
];

function linkActive(pathname: string, item: NavItem) {
  if (item.prefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  if (item.exact) return pathname === item.href;
  return pathname === item.href;
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading: authLoading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100/80 lg:flex-row">
      <SelectTextOnFocus />
      {/* Mobile menu bar */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm lg:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label="Open navigation menu"
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <Link href="/" className="font-semibold text-slate-900">
          ERPNext
        </Link>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[min(100vw-3rem,18rem)] flex-col border-r border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-200 ease-out lg:static lg:z-0 lg:max-w-none lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-slate-800/80 px-4 lg:h-16">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white"
            onClick={() => setMobileOpen(false)}
          >
            ERPNext
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = linkActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                            active
                              ? "bg-slate-100 text-slate-900"
                              : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                          }`}
                          onClick={() => setMobileOpen(false)}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="shrink-0 space-y-2 border-t border-slate-800/80 p-3">
          {authLoading ? (
            <p className="px-3 text-xs text-slate-500">Checking session…</p>
          ) : user && user !== "Guest" ? (
            <>
              <p className="px-3 text-xs text-slate-400">
                Signed in as{" "}
                <span className="font-medium text-slate-100">{user}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  void logout();
                  setMobileOpen(false);
                }}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-center text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/#dashboard-login"
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-center text-sm font-medium text-slate-200 transition hover:border-emerald-500/60 hover:bg-slate-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Log in
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppShellInner>{children}</AppShellInner>
    </AuthProvider>
  );
}
