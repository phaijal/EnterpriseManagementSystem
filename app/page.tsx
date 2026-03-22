import Link from "next/link";

const actions = [
  { href: "/stock", label: "View Stock" },
  { href: "/customers", label: "View Customers" },
  { href: "/boxes", label: "View Boxes" },
  { href: "/add-stock", label: "Add Stock" },
  { href: "/challan", label: "Create Challan" },
  { href: "/challan/list", label: "All Challans" },
  { href: "/add-customer", label: "Add Customer" },
  { href: "/add-item", label: "Add Item" },
  { href: "/settings/company", label: "Company & GST" }
];

export default function DashboardPage() {
  return (
    <section className="flex min-h-[65vh] flex-col items-center justify-center">
      <h1 className="mb-8 text-center text-3xl font-bold text-slate-900">
        ERPNext Dashboard
      </h1>
      <div className="grid w-full max-w-md gap-4">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-xl bg-slate-900 px-6 py-4 text-center text-lg font-semibold text-white shadow transition hover:bg-slate-800"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
