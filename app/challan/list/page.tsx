"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TablePagination } from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, getApiErrorMessage } from "@/lib/api";
import { decodeChallanPayload, resolveChallanBoxLines, type ChallanBoxLine } from "@/lib/challanPayload";
import { buildChallanHtmlDocument } from "@/lib/challanDownloadHtml";
import { fetchCompanyPrintDetails, fetchCustomerPrintDetails } from "@/lib/challanPrintParties";

function printHtmlDocument(html: string): void {
  // Hidden iframe print on current tab/page (no popup / new tab).
  const iframe = document.createElement("iframe");
  iframe.title = "Challan print";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "8.5in",
    height: "11in",
    border: "0",
    margin: "0"
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const runPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 90_000);
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  iframe.addEventListener("load", () => {
    window.setTimeout(runPrint, 100);
  });

  document.body.appendChild(iframe);
  iframe.srcdoc = html;
}

type DeliveryNoteRow = {
  name: string;
  customer?: string;
  posting_date?: string;
  status?: string;
  docstatus?: number;
};

type DeliveryNoteListResponse = {
  data: DeliveryNoteRow[];
};

type DeliveryNoteDetail = {
  data?: {
    name?: string;
    customer?: string;
    /** Display name from ERPNext */
    customer_name?: string;
    posting_date?: string;
    company?: string;
    remarks?: string;
    items?: Array<{
      item_code?: string;
      qty?: number;
      warehouse?: string;
      description?: string;
      item_description?: string;
    }>;
  };
};

type ItemNameResponse = {
  data: Array<{
    name?: string;
    item_name?: string;
  }>;
};

function extractMetaFromItemDescriptions(
  items: Array<{ description?: string; item_description?: string }> | undefined
): { lr_no: string; vehicle_no: string; transport: string } {
  const lines = (items ?? [])
    .map((it) => it.description || it.item_description || "")
    .filter(Boolean);
  const read = (patterns: RegExp[]): string => {
    for (const text of lines) {
      for (const re of patterns) {
        const m = text.match(re);
        const v = m?.[1]?.trim();
        if (v) return v;
      }
    }
    return "";
  };
  return {
    lr_no: read([/LR_NO:\s*([^\s;]+)/i, /L\.?R\.?\s*NO:\s*([^\s;]+)/i]),
    vehicle_no: read([/VEHICLE_NO:\s*([^\s;]+)/i, /VEHICLE\s*NO:\s*([^\s;]+)/i]),
    transport: read([/TRANSPORT:\s*([^;]+?)(?:\s+STOCK_ENTRY:|$)/i])
  };
}

async function enrichBoxLinesWithItemNames(boxes: ChallanBoxLine[]): Promise<ChallanBoxLine[]> {
  const codes = [...new Set(boxes.map((b) => b.item_code).filter((c) => c && c !== "—"))];
  if (codes.length === 0) return boxes;
  if (!boxes.some((b) => !b.item_name || b.item_name === "—")) return boxes;
  try {
    const res = await api.get<ItemNameResponse>("/api/resource/Item", {
      params: {
        fields: JSON.stringify(["name", "item_name"]),
        filters: JSON.stringify([["name", "in", codes]]),
        limit_page_length: 500
      }
    });
    const map: Record<string, string> = {};
    for (const row of res.data.data ?? []) {
      if (row.name) map[row.name] = row.item_name || row.name;
    }
    return boxes.map((b) => ({
      ...b,
      item_name:
        b.item_name && b.item_name !== "—"
          ? b.item_name
          : (map[b.item_code] ?? b.item_name ?? "—")
    }));
  } catch {
    return boxes;
  }
}

export default function ChallanListPage() {
  const [rows, setRows] = useState<DeliveryNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionName, setActionName] = useState<string | null>(null);
  const [printingName, setPrintingName] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<DeliveryNoteListResponse>("/api/resource/Delivery Note", {
        params: {
          fields: JSON.stringify(["name", "customer", "posting_date", "status", "docstatus"]),
          order_by: "creation desc",
          limit_page_length: 500
        }
      });
      setRows(response.data.data ?? []);
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to load delivery notes (challans)."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const extractMetaFromRemarks = (
    remarks: string | undefined,
    decoded: { lr_no?: string; vehicle_no?: string; transport?: string } | null
  ) => {
    const pickByPatterns = (patterns: RegExp[]): string => {
      if (!remarks) return "";
      for (const re of patterns) {
        const m = remarks.match(re);
        const v = m?.[1]?.trim();
        if (v) return v;
      }
      return "";
    };
    return {
      lr_no:
        (decoded?.lr_no || "").trim() ||
        pickByPatterns([
          /(?:^|;)\s*LR_NO\s*:\s*([^;]+)/i,
          /(?:^|;)\s*L\.?R\.?\s*NO\s*:\s*([^;]+)/i
        ]),
      vehicle_no:
        (decoded?.vehicle_no || "").trim() ||
        pickByPatterns([
          /(?:^|;)\s*VEHICLE_NO\s*:\s*([^;]+)/i,
          /(?:^|;)\s*VEHICLE\s*NO\s*:\s*([^;]+)/i
        ]),
      transport:
        (decoded?.transport || "").trim() ||
        pickByPatterns([/(?:^|;)\s*TRANSPORT\s*:\s*([^;]+)/i])
    };
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.customer || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const { pageItems, page, setPage, totalPages, from, to, total } = useClientPagination(
    filtered,
    pageSize,
    search
  );

  const docstatusLabel = (d?: number) => {
    if (d === 0) return "Draft";
    if (d === 1) return "Submitted";
    if (d === 2) return "Cancelled";
    return "—";
  };

  const handlePrint = async (name: string) => {
    setPrintingName(name);
    try {
      const response = await api.get<DeliveryNoteDetail>(
        `/api/resource/Delivery Note/${encodeURIComponent(name)}`
      );
      const doc = response.data?.data;
      if (!doc) {
        alert("Could not load challan details.");
        return;
      }

      let boxes = resolveChallanBoxLines(doc.remarks, doc.items ?? []);
      boxes = await enrichBoxLinesWithItemNames(boxes);
      const decoded = decodeChallanPayload(doc.remarks);
      const meta = extractMetaFromRemarks(doc.remarks, decoded);
      const lineMeta = extractMetaFromItemDescriptions(doc.items);

      const companyId = (doc.company || "").trim();
      const customerId = (doc.customer || "").trim();
      const [companyParty, customerParty] = await Promise.all([
        companyId ? fetchCompanyPrintDetails(companyId) : Promise.resolve(undefined),
        customerId ? fetchCustomerPrintDetails(customerId) : Promise.resolve(undefined)
      ]);

      const html = buildChallanHtmlDocument({
        name: doc.name || name,
        customer: doc.customer_name || doc.customer,
        posting_date: doc.posting_date,
        company: doc.company,
        remarks: doc.remarks,
        lr_no: meta.lr_no || lineMeta.lr_no || undefined,
        vehicle_no: meta.vehicle_no || lineMeta.vehicle_no || undefined,
        transport: meta.transport || lineMeta.transport || undefined,
        boxes,
        companyParty,
        customerParty
      });

      printHtmlDocument(html);
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to print challan."));
    } finally {
      setPrintingName(null);
    }
  };

  const handleDeleteOrCancel = async (row: DeliveryNoteRow) => {
    const ds = row.docstatus ?? 0;

    if (ds === 0) {
      if (!confirm(`Delete draft ${row.name}? This cannot be undone.`)) return;
      setActionName(row.name);
      try {
        await api.delete(`/api/resource/Delivery Note/${encodeURIComponent(row.name)}`);
        await refresh();
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to delete draft delivery note."));
      } finally {
        setActionName(null);
      }
      return;
    }

    if (ds === 1) {
      if (
        !confirm(
          `Cancel ${row.name}? Stock will be returned to the warehouse. The document will stay as cancelled unless you remove it.`
        )
      ) {
        return;
      }
      setActionName(row.name);
      try {
        await api.post("/api/method/frappe.client.cancel", {
          doctype: "Delivery Note",
          name: row.name
        });
        await refresh();
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to cancel delivery note."));
      } finally {
        setActionName(null);
      }
      return;
    }

    if (ds === 2) {
      if (!confirm(`Permanently remove cancelled document ${row.name}?`)) return;
      setActionName(row.name);
      try {
        await api.delete(`/api/resource/Delivery Note/${encodeURIComponent(row.name)}`);
        await refresh();
      } catch (error) {
        alert(
          getApiErrorMessage(
            error,
            "Failed to delete cancelled delivery note. It may be linked to other documents."
          )
        );
      } finally {
        setActionName(null);
      }
    }
  };

  const actionLabel = (row: DeliveryNoteRow) => {
    const ds = row.docstatus ?? 0;
    if (ds === 0) return "Delete";
    if (ds === 1) return "Cancel (restore stock)";
    if (ds === 2) return "Remove";
    return "—";
  };

  const canAct = (row: DeliveryNoteRow) => {
    const ds = row.docstatus ?? 0;
    return ds === 0 || ds === 1 || ds === 2;
  };

  const busy = actionName !== null || printingName !== null;

  return (
    <section className="mx-auto w-full max-w-5xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">All Challans</h1>
        <p className="text-sm text-slate-600">
          Delivery Notes listed newest first ({rows.length} loaded; use pagination below for long lists).
          Print opens the browser print dialog. New challans include full per-box weights; older ones may
          show net only.
        </p>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Search by name, customer, or status
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter…"
          className="w-full max-w-md rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
        />
      </div>

      {loading ? (
        <p className="text-slate-600">Loading challans…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Posting date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Doc</th>
                <th className="px-4 py-3 text-right">Print</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                pageItems.map((row) => (
                  <tr key={row.name} className="border-t text-slate-800">
                    <td className="px-4 py-3 font-mono text-xs">{row.name}</td>
                    <td className="px-4 py-3">{row.customer || "—"}</td>
                    <td className="px-4 py-3">{row.posting_date || "—"}</td>
                    <td className="px-4 py-3">{row.status || "—"}</td>
                    <td className="px-4 py-3">{docstatusLabel(row.docstatus)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handlePrint(row.name)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {printingName === row.name ? "…" : "Print"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canAct(row) ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDeleteOrCancel(row)}
                          className={`rounded px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                            row.docstatus === 1
                              ? "bg-amber-700 hover:bg-amber-800"
                              : "bg-slate-800 hover:bg-slate-900"
                          }`}
                        >
                          {actionName === row.name ? "…" : actionLabel(row)}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    No delivery notes match your filter.
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
