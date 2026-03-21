"use client";

import { useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type CustomerResponse = {
  data: Array<{
    name?: string;
    customer_name?: string;
  }>;
};

type CustomerDocResponse = {
  data?: {
    name?: string;
    customer_name?: string;
    customer_primary_address?: string;
    primary_address?: string;
  };
};

type AddressListResponse = {
  data: Array<{
    name?: string;
    address_title?: string;
  }>;
};

type CustomerRow = {
  customer: string;
  address: string;
  gst: string;
  pincode: string;
};

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const customerRes = await api.get<CustomerResponse>(
          '/api/resource/Customer?fields=["name","customer_name"]&limit_page_length=500'
        );
        const customerList = customerRes.data.data ?? [];
        const addressListRes = await api.get<AddressListResponse>(
          '/api/resource/Address?fields=["name","address_title"]&limit_page_length=1000'
        );

        const customerDocs = await Promise.all(
          customerList
            .map((customer) => customer.name)
            .filter(Boolean)
            .map((name) =>
              api.get<CustomerDocResponse>(`/api/resource/Customer/${encodeURIComponent(name as string)}`)
            )
        );

        const customerDocByName: Record<string, CustomerDocResponse["data"]> = {};
        customerDocs.forEach((doc) => {
          const data = doc.data?.data;
          if (data?.name) customerDocByName[data.name] = data;
        });

        const addressByTitle: Record<string, string> = {};
        (addressListRes.data.data ?? []).forEach((addr) => {
          if (addr.address_title && addr.name && !addressByTitle[addr.address_title]) {
            addressByTitle[addr.address_title] = addr.name;
          }
        });

        const addressNames = Array.from(
          new Set(
            customerDocs
              .map(
                (doc) =>
                  doc.data?.data?.customer_primary_address || doc.data?.data?.primary_address || ""
              )
              .filter(Boolean)
          )
        );
        const addressDocs = await Promise.all(
          addressNames.map((name) => api.get(`/api/resource/Address/${encodeURIComponent(name)}`))
        );
        const addressByName: Record<string, any> = {};
        addressDocs.forEach((doc) => {
          const data = doc.data?.data;
          if (data?.name) addressByName[data.name] = data;
        });

        const mapped: CustomerRow[] = customerList.map((customer) => {
          const key = customer.name || "";
          const customerDoc = customerDocByName[key];
          const addrName =
            customerDoc?.customer_primary_address ||
            customerDoc?.primary_address ||
            addressByTitle[customer.customer_name || customer.name || ""] ||
            "";
          const addr = addrName ? addressByName[addrName] : undefined;
          return {
            customer: customer.customer_name || customer.name || "-",
            address: [addr?.address_line1, addr?.city].filter(Boolean).join(", ") || "-",
            gst: addr?.gstin || "-",
            pincode: addr?.pincode || "-"
          };
        });

        setRows(mapped);
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to fetch customers."));
      } finally {
        setLoading(false);
      }
    };

    loadCustomers();
  }, []);

  return (
    <section className="mx-auto w-full max-w-5xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Customers</h1>

      {loading ? (
        <p className="text-slate-600">Loading customers...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">GST No</th>
                <th className="px-4 py-3">Pincode</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row, index) => (
                  <tr key={`${row.customer}-${index}`} className="border-t">
                    <td className="px-4 py-3 text-slate-800">{row.customer}</td>
                    <td className="px-4 py-3 text-slate-800">{row.address}</td>
                    <td className="px-4 py-3 text-slate-800">{row.gst}</td>
                    <td className="px-4 py-3 text-slate-800">{row.pincode}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={4}>
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
