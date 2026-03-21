"use client";

import { useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

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

type WarehouseResponse = {
  data: Array<{
    name?: string;
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

  useEffect(() => {
    const fetchStock = async () => {
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
          setStock([]);
          return;
        }

        const response = await api.get<StockResponse>("/api/resource/Bin", {
          params: {
            fields: JSON.stringify(["item_code", "actual_qty"]),
            filters: JSON.stringify([
              ["warehouse", "=", selectedWarehouse],
              ["actual_qty", ">", 0]
            ]),
            order_by: "item_code asc",
            limit_page_length: 200
          }
        });

        const rows = response.data.data ?? [];
        const itemCodes = Array.from(new Set(rows.map((row) => row.item_code).filter(Boolean)));

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
        const entryDetails = await Promise.all(
          entries.map((entry) =>
            api.get<StockEntryDetailResponse>(`/api/resource/Stock Entry/${entry.name}`)
          )
        );

        const extrasByItem: Record<string, { cops: number; tare: number; gross: number }> = {};
        entries.forEach((entry, index) => {
          const firstItem = entryDetails[index].data.data?.items?.[0];
          const itemCode = firstItem?.item_code;
          const itemWarehouse = firstItem?.t_warehouse || firstItem?.s_warehouse || "";
          if (itemWarehouse !== selectedWarehouse) return;
          if (!itemCode) return;
          const parsed = parseRemarks(entry.remarks);
          if (!extrasByItem[itemCode]) {
            extrasByItem[itemCode] = { cops: 0, tare: 0, gross: 0 };
          }
          extrasByItem[itemCode].cops += parsed.cops;
          extrasByItem[itemCode].tare += parsed.tare;
          extrasByItem[itemCode].gross += parsed.gross;
        });

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

        const mappedRows: ViewRow[] = rows.map((row) => {
          const itemCode = row.item_code;
          const extras = extrasByItem[itemCode] || { cops: 0, tare: 0, gross: 0 };
          return {
            item_code: itemCode,
            item_name: itemNameMap[itemCode] || itemCode,
            cops: extras.cops.toFixed(2),
            tare_weight: extras.tare.toFixed(2),
            gross_weight: extras.gross.toFixed(2),
            net_weight: row.actual_qty
          };
        });
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
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Current Stock</h1>
      <p className="mb-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Viewing warehouse: <span className="font-semibold">{warehouse || "Not found"}</span>
      </p>

      {loading ? (
        <p className="text-slate-600">Loading stock...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">Item Code</th>
                <th className="px-4 py-3">Stock Name</th>
                <th className="px-4 py-3">Cops</th>
                <th className="px-4 py-3">Tare Weight</th>
                <th className="px-4 py-3">Gross Weight</th>
                <th className="px-4 py-3">Net Weight</th>
              </tr>
            </thead>
            <tbody>
              {stock.length > 0 ? (
                stock.map((row, index) => (
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
        </div>
      )}
    </section>
  );
}
