"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TablePagination } from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, getApiErrorMessage } from "@/lib/api";
import { fetchSubmittedChallanLockMap } from "@/lib/challanLocks";
import { fetchAppWarehouseName } from "@/lib/finishedGoodsWarehouse";
import { UI_DENIER, UI_LOT_NO } from "@/lib/uiLabels";
import { weightLabel } from "@/lib/units";

type StockResponse = {
  data: Array<{
    item_code: string;
    actual_qty: number;
  }>;
};

type ItemNameResponse = {
  data: Array<{
    name?: string;
    item_name?: string;
  }>;
};

type ViewRow = {
  item_code: string;
  item_name: string;
  cops: string;
  tare_weight: string;
  gross_weight: string;
  net_weight: number;
};

type StockEntryListResponse = {
  data: Array<{
    name: string;
    remarks?: string;
  }>;
};

type StockEntryDetailResponse = {
  data?: {
    items?: Array<{
      item_code?: string;
      t_warehouse?: string;
      s_warehouse?: string;
      qty?: number;
      custom_cops?: number;
      custom_tare_weight?: number;
      custom_gross_weight?: number;
    }>;
  };
};

function parseRemarks(remarks?: string) {
  const text = remarks ?? "";
  const get = (key: string) => {
    const match = text.match(new RegExp(`${key}:(\\d+(?:\\.\\d+)?)`, "i"));
    return match ? Number(match[1]) : 0;
  };

  return {
    cops: get("COPS"),
    tare: get("TARE"),
    gross: get("GROSS")
  };
}

export default function StockPage() {
  const [stock, setStock] = useState<ViewRow[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(25);
  const { pageItems, page, setPage, totalPages, from, to, total } = useClientPagination(
    stock,
    pageSize,
    warehouse
  );

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const selectedWarehouse = await fetchAppWarehouseName();
        setWarehouse(selectedWarehouse);

        if (!selectedWarehouse) {
          setStock([]);
          return;
        }

        const stockEntriesResponse = await api.get<StockEntryListResponse>(
          "/api/resource/Stock Entry",
          {
            params: {
              fields: JSON.stringify(["name", "remarks"]),
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
        const lockMap = await fetchSubmittedChallanLockMap(api);
        const unlockedEntries = entries.filter((entry) => !lockMap.has(entry.name));

        const entryDetails = await Promise.all(
          unlockedEntries.map((entry) =>
            api.get<StockEntryDetailResponse>(`/api/resource/Stock Entry/${entry.name}`)
          )
        );

        const extrasByItem: Record<string, { cops: number; tare: number; gross: number; net: number }> = {};
        unlockedEntries.forEach((entry, index) => {
          const firstItem = entryDetails[index].data.data?.items?.[0];
          const itemCode = firstItem?.item_code;
          const itemWarehouse = firstItem?.t_warehouse || firstItem?.s_warehouse || "";
          if (itemWarehouse !== selectedWarehouse) return;
          if (!itemCode) return;
          const parsed = parseRemarks(entry.remarks);
          const cops = firstItem?.custom_cops ?? parsed.cops;
          const tare = firstItem?.custom_tare_weight ?? parsed.tare;
          const gross = firstItem?.custom_gross_weight ?? parsed.gross;
          const net = typeof firstItem?.qty === "number" ? firstItem.qty : 0;
          if (!extrasByItem[itemCode]) {
            extrasByItem[itemCode] = { cops: 0, tare: 0, gross: 0, net: 0 };
          }
          extrasByItem[itemCode].cops += cops;
          extrasByItem[itemCode].tare += tare;
          extrasByItem[itemCode].gross += gross;
          extrasByItem[itemCode].net += net;
        });

        const itemCodes = Object.keys(extrasByItem);
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

        const mappedRows: ViewRow[] = itemCodes.map((itemCode) => {
          const extras = extrasByItem[itemCode] || { cops: 0, tare: 0, gross: 0, net: 0 };
          return {
            item_code: itemCode,
            item_name: itemNameMap[itemCode] || itemCode,
            cops: extras.cops.toFixed(2),
            tare_weight: extras.tare.toFixed(2),
            gross_weight: extras.gross.toFixed(2),
            net_weight: extras.net
          };
        }).sort((a, b) => a.item_code.localeCompare(b.item_code));
        setStock(mappedRows);
      } catch (error) {
        alert(
          getApiErrorMessage(
            error,
            "Failed to fetch stock. Please check ERPNext session and server."
          )
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, []);

  return (
    <section className="mx-auto w-full max-w-3xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Current Stock</h1>
        <Link
          href="/add-stock"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Add stock
        </Link>
      </div>
      <p className="mb-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Finished goods warehouse:{" "}
        <span className="font-semibold">{warehouse || "Not found"}</span>
        <span className="text-slate-500"> (fixed)</span>
      </p>

      {loading ? (
        <p className="text-slate-600">Loading stock...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">{UI_LOT_NO}</th>
                <th className="px-4 py-3">{UI_DENIER}</th>
                <th className="px-4 py-3">Cops</th>
                <th className="px-4 py-3">{weightLabel("Tare weight")}</th>
                <th className="px-4 py-3">{weightLabel("Gross weight")}</th>
                <th className="px-4 py-3">{weightLabel("Net weight")}</th>
              </tr>
            </thead>
            <tbody>
              {stock.length > 0 ? (
                pageItems.map((row, index) => (
                  <tr key={`${row.item_code}-${index}`} className="border-t">
                    <td className="px-4 py-3 text-slate-800">{row.item_code}</td>
                    <td className="px-4 py-3 text-slate-800">{row.item_name}</td>
                    <td className="px-4 py-3 text-slate-800">{row.cops}</td>
                    <td className="px-4 py-3 text-slate-800">{row.tare_weight}</td>
                    <td className="px-4 py-3 text-slate-800">{row.gross_weight}</td>
                    <td className="px-4 py-3 text-slate-800">{row.net_weight}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={6}>
                    No stock records found.
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
