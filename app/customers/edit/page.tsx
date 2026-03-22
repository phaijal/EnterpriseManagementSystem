"use client";

import Link from "next/link";
import { Suspense, FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, getApiErrorMessage } from "@/lib/api";

type CustomerDoc = {
  name?: string;
  customer_name?: string;
  customer_primary_address?: string;
};

type AddressDoc = {
  name?: string;
  address_line1?: string;
  city?: string;
  pincode?: string;
  gstin?: string;
};

function EditCustomerForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const customerId = searchParams.get("name") || "";

  const [customerName, setCustomerName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("NA");
  const [pincode, setPincode] = useState("");
  const [gstNo, setGstNo] = useState("");
  const [addressName, setAddressName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const custRes = await api.get<{ data: CustomerDoc }>(
          `/api/resource/Customer/${encodeURIComponent(customerId)}`
        );
        const c = custRes.data?.data;
        setCustomerName(c?.customer_name || c?.name || "");

        const addrKey = c?.customer_primary_address;
        if (addrKey) {
          setAddressName(addrKey);
          const addrRes = await api.get<{ data: AddressDoc }>(
            `/api/resource/Address/${encodeURIComponent(addrKey)}`
          );
          const a = addrRes.data?.data;
          setAddressLine(a?.address_line1 || "");
          setCity(a?.city || "NA");
          setPincode(a?.pincode || "");
          setGstNo(a?.gstin || "");
        } else {
          setAddressName(null);
        }
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to load customer."));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [customerId]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!customerId) return;
    setSaving(true);
    setSuccessMessage("");
    try {
      const custRes = await api.get<{ data: CustomerDoc }>(
        `/api/resource/Customer/${encodeURIComponent(customerId)}`
      );
      const c = custRes.data?.data;
      if (!c?.name) throw new Error("Customer not found.");

      // Full-document PUT often fails (read-only / nested fields from GET). Use set_value like ERPNext desk.
      await api.post("/api/method/frappe.client.set_value", {
        doctype: "Customer",
        name: customerId,
        fieldname: "customer_name",
        value: customerName.trim()
      });

      if (addressName) {
        const fields: Array<[string, string]> = [
          ["address_line1", addressLine.trim()],
          ["city", city.trim() || "NA"],
          ["pincode", pincode.trim()],
          ["gstin", gstNo.trim()]
        ];
        for (const [fieldname, value] of fields) {
          await api.post("/api/method/frappe.client.set_value", {
            doctype: "Address",
            name: addressName,
            fieldname,
            value
          });
        }
      }

      setSuccessMessage("Customer updated.");
      router.refresh();
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to save customer."));
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) {
    return (
      <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
        <p className="text-slate-600">Missing customer. Open this page from View customers.</p>
        <Link href="/customers" className="mt-4 inline-block text-sm underline">
          Back to customers
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Edit customer</h1>
        <Link href="/customers" className="text-sm font-medium text-slate-700 underline">
          Back
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-600">Loading…</p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
            <textarea
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              required={Boolean(addressName)}
              rows={3}
              disabled={!addressName}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
            />
            {!addressName && (
              <p className="mt-1 text-xs text-amber-800">
                No primary address on file; name-only update. Add a billing address in ERPNext if needed.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={!addressName}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">GST No</label>
            <input
              value={gstNo}
              onChange={(e) => setGstNo(e.target.value)}
              disabled={!addressName}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Pincode</label>
            <input
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              required={Boolean(addressName)}
              disabled={!addressName}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}

      {successMessage && (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}
    </section>
  );
}

export default function EditCustomerPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
          <p className="text-slate-600">Loading…</p>
        </section>
      }
    >
      <EditCustomerForm />
    </Suspense>
  );
}
