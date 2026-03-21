"use client";

import { FormEvent, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

export default function AddCustomerPage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [gstNo, setGstNo] = useState("");
  const [pincode, setPincode] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");

    try {
      const customerRes = await api.post("/api/resource/Customer", {
        customer_name: name,
        customer_type: "Company",
        customer_group: "All Customer Groups",
        territory: "All Territories"
      });

      const customerName = customerRes.data?.data?.name ?? name;

      const addressRes = await api.post("/api/resource/Address", {
        address_title: name,
        address_type: "Billing",
        address_line1: address,
        city: "NA",
        country: "India",
        pincode,
        gstin: gstNo,
        links: [
          {
            link_doctype: "Customer",
            link_name: customerName
          }
        ]
      });
      const addressName = addressRes.data?.data?.name;

      if (addressName) {
        await api.post("/api/method/frappe.client.set_value", {
          doctype: "Customer",
          name: customerName,
          fieldname: "customer_primary_address",
          value: addressName
        });
      }

      setSuccessMessage(`Customer created successfully: ${customerName}`);
      setName("");
      setAddress("");
      setGstNo("");
      setPincode("");
    } catch (error) {
      alert(
        getApiErrorMessage(
          error,
          "Failed to create customer. Please verify values and masters."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Add Customer</h1>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            rows={3}
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">GST No</label>
          <input
            value={gstNo}
            onChange={(e) => setGstNo(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Pincode</label>
          <input
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {loading ? "Saving..." : "Create Customer"}
        </button>
      </form>

      {successMessage && (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}
    </section>
  );
}
