"use client";

import { useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type WarehouseResponse = {
  data: Array<{ name?: string }>;
};

type StockEntryListResponse = {
  data: Array<{
    name: string;
    remarks?: string;
    creation?: string;
  }>;
};

type StockEntryDetailResponse = {
  data?: {
    items?: Array<{
      item_code?: string;
      t_warehouse?: string;
      s_warehouse?: string;
      qty?: number;
    }>;
  };
};

type ItemNameResponse = {
  data: Array<{
    name?: string;
    item_name?: string;
  }>;
};

type BoxRow = {
  box: string;
  item_code: string;
  item_name: string;
  cops: number | "-";
  tare_weight: number | "-";
  gross_weight: number | "-";
  net_weight: number;
  stock_entry: string;
};

type EditDraft = {
  box: string;
  cops: number;
  tare_weight: number;
  gross_weight: number;
};

function parseRemarks(remarks?: string) {
  const text = remarks ?? "";
  const get = (key: string) => {
    const match = text.match(new RegExp(`${key}:(\\d+(?:\\.\\d+)?)`, "i"));
    return match ? Number(match[1]) : undefined;
  };
  const boxMatch = text.match(/BOX:(\d+)/i);

  return {
    box: boxMatch ? `Box ${boxMatch[1]}` : "-",
    cops: get("COPS"),
    tare: get("TARE"),
    gross: get("GROSS"),
    net: get("NET")
  };
}

export default function BoxesPage() {
  const [warehouse, setWarehouse] = useState("");
  const [rows, setRows] = useState<BoxRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchBoxes = async () => {
      try {
        const warehouseResponse = await api.get<WarehouseResponse>(
          '/api/resource/Warehouse?fields=["name"]&filters=[["disabled","=",0],["is_group","=",0]]&limit_page_length=500'
        );
        const names = (warehouseResponse.data.data ?? [])
          .map((row) => row.name || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        const selectedWarehouse = names[0] ?? "";
        setWarehouse(selectedWarehouse);

        if (!selectedWarehouse) {
          setRows([]);
          return;
        }

        const stockEntriesResponse = await api.get<StockEntryListResponse>(
          "/api/resource/Stock Entry",
          {
            params: {
              fields: JSON.stringify(["name", "remarks", "creation"]),
              filters: JSON.stringify([
                ["stock_entry_type", "=", "Material Receipt"],
                ["docstatus", "=", 1]
              ]),
              order_by: "creation desc",
              limit_page_length: 300
            }
          }
        );
        const entries = stockEntriesResponse.data.data ?? [];
        const entryDetails = await Promise.all(
          entries.map((entry) =>
            api.get<StockEntryDetailResponse>(`/api/resource/Stock Entry/${entry.name}`)
          )
        );

        const itemCodes = Array.from(
          new Set(
            entryDetails
              .map((detail) => detail.data.data?.items?.[0]?.item_code || "")
              .filter(Boolean)
          )
        );
        const itemNameMap: Record<string, string> = {};
        if (itemCodes.length > 0) {
          const itemsResponse = await api.get<ItemNameResponse>("/api/resource/Item", {
            params: {
              fields: JSON.stringify(["name", "item_name"]),
              filters: JSON.stringify([["name", "in", itemCodes]]),
              limit_page_length: 500
            }
          });
          for (const row of itemsResponse.data.data ?? []) {
            if (row.name) itemNameMap[row.name] = row.item_name || row.name;
          }
        }

        const mappedRows: BoxRow[] = entries
          .map((entry, index) => {
            const detail = entryDetails[index].data.data;
            const firstItem = detail?.items?.[0];
            const itemWarehouse = firstItem?.t_warehouse || firstItem?.s_warehouse || "";
            if (itemWarehouse !== selectedWarehouse) return null;
            const itemCode = firstItem?.item_code || "-";
            const parsed = parseRemarks(entry.remarks);

            return {
              box: parsed.box,
              item_code: itemCode,
              item_name: itemNameMap[itemCode] || itemCode,
              cops: parsed.cops ?? "-",
              tare_weight: parsed.tare ?? "-",
              gross_weight: parsed.gross ?? "-",
              net_weight: parsed.net ?? firstItem?.qty ?? 0,
              stock_entry: entry.name
            };
          })
          .filter((row): row is BoxRow => Boolean(row));

        setRows(mappedRows);
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to fetch boxes data."));
      } finally {
        setLoading(false);
      }
    };

    fetchBoxes();
  }, []);

  const refreshBoxes = async () => {
    setLoading(true);
    try {
      const warehouseResponse = await api.get<WarehouseResponse>(
        '/api/resource/Warehouse?fields=["name"]&filters=[["disabled","=",0],["is_group","=",0]]&limit_page_length=500'
      );
      const names = (warehouseResponse.data.data ?? [])
        .map((row) => row.name || "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      const selectedWarehouse = names[0] ?? "";
      setWarehouse(selectedWarehouse);

      if (!selectedWarehouse) {
        setRows([]);
        return;
      }

      const stockEntriesResponse = await api.get<StockEntryListResponse>(
        "/api/resource/Stock Entry",
        {
          params: {
            fields: JSON.stringify(["name", "remarks", "creation"]),
            filters: JSON.stringify([
              ["stock_entry_type", "=", "Material Receipt"],
              ["docstatus", "=", 1]
            ]),
            order_by: "creation desc",
            limit_page_length: 300
          }
        }
      );
      const entries = stockEntriesResponse.data.data ?? [];
      const entryDetails = await Promise.all(
        entries.map((entry) =>
          api.get<StockEntryDetailResponse>(`/api/resource/Stock Entry/${entry.name}`)
        )
      );

      const itemCodes = Array.from(
        new Set(
          entryDetails
            .map((detail) => detail.data.data?.items?.[0]?.item_code || "")
            .filter(Boolean)
        )
      );
      const itemNameMap: Record<string, string> = {};
      if (itemCodes.length > 0) {
        const itemsResponse = await api.get<ItemNameResponse>("/api/resource/Item", {
          params: {
            fields: JSON.stringify(["name", "item_name"]),
            filters: JSON.stringify([["name", "in", itemCodes]]),
            limit_page_length: 500
          }
        });
        for (const row of itemsResponse.data.data ?? []) {
          if (row.name) itemNameMap[row.name] = row.item_name || row.name;
        }
      }

      const mappedRows: BoxRow[] = entries
        .map((entry, index) => {
          const detail = entryDetails[index].data.data;
          const firstItem = detail?.items?.[0];
          const itemWarehouse = firstItem?.t_warehouse || firstItem?.s_warehouse || "";
          if (itemWarehouse !== selectedWarehouse) return null;
          const itemCode = firstItem?.item_code || "-";
          const parsed = parseRemarks(entry.remarks);

          return {
            box: parsed.box,
            item_code: itemCode,
            item_name: itemNameMap[itemCode] || itemCode,
            cops: parsed.cops ?? "-",
            tare_weight: parsed.tare ?? "-",
            gross_weight: parsed.gross ?? "-",
            net_weight: parsed.net ?? firstItem?.qty ?? 0,
            stock_entry: entry.name
          };
        })
        .filter((row): row is BoxRow => Boolean(row));

      setRows(mappedRows);
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to refresh boxes data."));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (row: BoxRow) => {
    const boxMatch = row.box.match(/(\d+)/);
    setEditingEntry(row.stock_entry);
    setDraft({
      box: boxMatch ? boxMatch[1] : "",
      cops: typeof row.cops === "number" ? row.cops : 0,
      tare_weight: typeof row.tare_weight === "number" ? row.tare_weight : 0,
      gross_weight: typeof row.gross_weight === "number" ? row.gross_weight : 0
    });
  };

  const saveEdit = async (row: BoxRow) => {
    if (!draft) return;
    const net = Math.max(0, draft.gross_weight - draft.tare_weight);
    const remarks = `BOX:${draft.box};COPS:${draft.cops};TARE:${draft.tare_weight};GROSS:${draft.gross_weight};NET:${net}`;
    setSaving(true);
    try {
      await api.post("/api/method/frappe.client.set_value", {
        doctype: "Stock Entry",
        name: row.stock_entry,
        fieldname: "remarks",
        value: remarks
      });
      setEditingEntry(null);
      setDraft(null);
      await refreshBoxes();
      alert("Box updated successfully.");
    } catch (error) {
      alert(
        getApiErrorMessage(
          error,
          "Failed to update box. ERPNext may restrict editing submitted entries."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const filteredRows = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.item_code.toLowerCase().includes(term));
  }, [rows, filter]);

  return (
    <section className="mx-auto w-full max-w-5xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Boxes</h1>
      <p className="mb-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Viewing warehouse: <span className="font-semibold">{warehouse || "Not found"}</span>
      </p>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Filter by Item Code
        </label>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Type item code..."
          className="w-full max-w-sm rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
        />
      </div>

      {loading ? (
        <p className="text-slate-600">Loading boxes...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">Box</th>
                <th className="px-4 py-3">Item Code</th>
                <th className="px-4 py-3">Stock Name</th>
                <th className="px-4 py-3">Cops</th>
                <th className="px-4 py-3">Tare Weight</th>
                <th className="px-4 py-3">Gross Weight</th>
                <th className="px-4 py-3">Net Weight</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row, index) => (
                  <tr key={`${row.stock_entry}-${index}`} className="border-t">
                    <td className="px-4 py-3 text-slate-800">
                      {editingEntry === row.stock_entry && draft ? (
                        <input
                          type="number"
                          min="1"
                          value={draft.box}
                          onChange={(e) =>
                            setDraft((prev) => (prev ? { ...prev, box: e.target.value } : prev))
                          }
                          className="w-24 rounded border px-2 py-1"
                        />
                      ) : (
                        row.box
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{row.item_code}</td>
                    <td className="px-4 py-3 text-slate-800">{row.item_name}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {editingEntry === row.stock_entry && draft ? (
                        <input
                          type="number"
                          min="0"
                          value={draft.cops}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev ? { ...prev, cops: Number(e.target.value) } : prev
                            )
                          }
                          className="w-24 rounded border px-2 py-1"
                        />
                      ) : (
                        row.cops
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {editingEntry === row.stock_entry && draft ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.tare_weight}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev ? { ...prev, tare_weight: Number(e.target.value) } : prev
                            )
                          }
                          className="w-24 rounded border px-2 py-1"
                        />
                      ) : (
                        row.tare_weight
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {editingEntry === row.stock_entry && draft ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.gross_weight}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev ? { ...prev, gross_weight: Number(e.target.value) } : prev
                            )
                          }
                          className="w-24 rounded border px-2 py-1"
                        />
                      ) : (
                        row.gross_weight
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {editingEntry === row.stock_entry && draft
                        ? Math.max(0, draft.gross_weight - draft.tare_weight).toFixed(2)
                        : row.net_weight}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {editingEntry === row.stock_entry ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => saveEdit(row)}
                            className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:bg-slate-500"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              setEditingEntry(null);
                              setDraft(null);
                            }}
                            className="rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={8}>
                    No box records found.
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
