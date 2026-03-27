"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TablePagination } from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
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
    gstin?: string;
    tax_id?: string;
  };
};

type AddressListResponse = {
  data: Array<{
    name?: string;
    address_title?: string;
  }>;
};

type CustomerRow = {
  erpName: string;
  customer: string;
  address: string;
  gst: string;
  pincode: string;
  primaryAddressName: string;
};

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingCustomer, setDeletingCustomer] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const { pageItems, page, setPage, totalPages, from, to, total } = useClientPagination(
    rows,
    pageSize,
    reloadToken
  );

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
        const addressByName: Record<string, { address_line1?: string; city?: string; pincode?: string; gstin?: string; tax_id?: string; name?: string }> = {};
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
          const gstFromParty = customerDoc?.gstin || customerDoc?.tax_id || "";
          const gstFromAddr = addr?.gstin || addr?.tax_id || "";
          const gst = gstFromAddr || gstFromParty || "-";
          return {
            erpName: key,
            customer: customer.customer_name || customer.name || "-",
            address: [addr?.address_line1, addr?.city].filter(Boolean).join(", ") || "-",
            gst,
            pincode: addr?.pincode || "-",
            primaryAddressName: addrName
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
  }, [reloadToken]);

  const deleteCustomer = async (row: CustomerRow) => {
    const confirmed = window.confirm(
      `Delete customer "${row.customer}"? This will remove the customer record.`
    );
    if (!confirmed) return;

    setDeletingCustomer(row.erpName);
    try {
      await api.delete(`/api/resource/Customer/${encodeURIComponent(row.erpName)}`);

      if (row.primaryAddressName) {
        try {
          await api.delete(`/api/resource/Address/${encodeURIComponent(row.primaryAddressName)}`);
        } catch {
          /* Address may be shared/linked elsewhere; customer deletion is the primary action. */
        }
      }

      setRows((prev) => prev.filter((r) => r.erpName !== row.erpName));
      setReloadToken((n) => n + 1);
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to delete customer."));
    } finally {
      setDeletingCustomer(null);
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <button
          type="button"
          onClick={() => setReloadToken((n) => n + 1)}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

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
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                pageItems.map((row, index) => (
                  <tr key={`${row.erpName}-${index}`} className="border-t">
                    <td className="px-4 py-3 text-slate-800">{row.customer}</td>
                    <td className="px-4 py-3 text-slate-800">{row.address}</td>
                    <td className="px-4 py-3 text-slate-800">{row.gst}</td>
                    <td className="px-4 py-3 text-slate-800">{row.pincode}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/customers/edit?name=${encodeURIComponent(row.erpName)}`}
                          className="text-sm font-semibold text-slate-900 underline"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => void deleteCustomer(row)}
                          disabled={deletingCustomer === row.erpName}
                          className="text-sm font-semibold text-red-700 underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingCustomer === row.erpName ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={5}>
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <TablePagination
            page={page}
            totalPages={totalPages}
            setPage={setPage}
            from={from}
            to={to}
            total={total}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </section>
  );
}
