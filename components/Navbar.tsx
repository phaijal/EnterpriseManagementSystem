"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/stock", label: "View Stock" },
  { href: "/customers", label: "View Customers" },
  { href: "/boxes", label: "View Boxes" },
  { href: "/add-stock", label: "Add Stock" },
  { href: "/challan", label: "Create Challan" },
  { href: "/add-customer", label: "Add Customer" },
  { href: "/add-item", label: "Add Item" }
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 w-full border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-800">
          ERPNext Frontend
        </Link>
        <div className="flex gap-2">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
