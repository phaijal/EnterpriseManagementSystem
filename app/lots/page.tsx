"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import { lotAttrsFromItemDoc } from "@/lib/itemLotAttributes";
import { UI_DENIER, UI_LOT_NO } from "@/lib/uiLabels";

type ItemListRow = {
  name?: string;
  item_code?: string;
  item_name?: string;
  description?: string;
  disabled?: number;
};

type LotRow = {
  itemCode: string;
  itemName: string;
  twist: string;
  shade: string;
  quality: string;
  machineNo: string;
};

export default function LotsPage() {
  const [rows, setRows] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ data?: ItemListRow[] }>("/api/resource/Item", {
          params: {
            fields: JSON.stringify(["name", "item_code", "item_name", "description", "disabled"]),
            filters: JSON.stringify([["is_stock_item", "=", 1], ["disabled", "=", 0]]),
            order_by: "item_code asc",
            limit_page_length: 1000
          }
        });

        const mapped = (res.data?.data ?? [])
          .map((row) => {
            const itemCode = (row.item_code || row.name || "").trim();
            if (!itemCode) return null;
            const attrs = lotAttrsFromItemDoc({
              description: row.description ?? ""
            });
            return {
              itemCode,
              itemName: (row.item_name || itemCode).trim(),
              twist: attrs.twist || "—",
              shade: attrs.shade || "—",
              quality: attrs.quality || "—",
              machineNo: attrs.machineNo || "—"
            } as LotRow;
          })
          .filter((row): row is LotRow => Boolean(row));

        setRows(mapped);
      } catch (error) {
        alert(getApiErrorMessage(error, `Failed to fetch ${UI_LOT_NO.toLowerCase()} list.`));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.itemCode, row.itemName, row.twist, row.shade, row.quality, row.machineNo]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  return (
    <section className="mx-auto w-full max-w-6xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">View lots</h1>
        <Link
          href="/add-item"
          className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Add lot
        </Link>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Search by {UI_LOT_NO}, {UI_DENIER}, or attributes
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          placeholder="Type to filter lots..."
        />
      </div>

      {loading ? (
        <p className="text-slate-600">Loading lots...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-[980px] w-full text-left">
            <thead className="bg-slate-100 text-sm font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">{UI_LOT_NO}</th>
                <th className="px-4 py-3">{UI_DENIER}</th>
                <th className="px-4 py-3">Twist</th>
                <th className="px-4 py-3">Shade</th>
                <th className="px-4 py-3">Quality</th>
                <th className="px-4 py-3">Machine no.</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr key={row.itemCode} className="border-t">
                    <td className="px-4 py-3 text-slate-800">{row.itemCode}</td>
                    <td className="px-4 py-3 text-slate-800">{row.itemName}</td>
                    <td className="px-4 py-3 text-slate-800">{row.twist}</td>
                    <td className="px-4 py-3 text-slate-800">{row.shade}</td>
                    <td className="px-4 py-3 text-slate-800">{row.quality}</td>
                    <td className="px-4 py-3 text-slate-800">{row.machineNo}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/edit-item?name=${encodeURIComponent(row.itemCode)}`}
                        className="text-sm font-semibold text-slate-900 underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={7}>
                    No lots found.
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
