"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  addToGradeBlock,
  buildReportRows,
  emptyGradeBlock,
  metricsFromBoxLine,
  REPORT_GRADE_HEADERS,
  totalBlock,
  type GradeBlock,
  type ReportDataRow,
  type ReportTableRow
} from "@/lib/detailStockReport";
import { fetchAppWarehouseName } from "@/lib/finishedGoodsWarehouse";
import { parseLotAttrsFromRemarks } from "@/lib/itemLotAttributes";
import { parseRemarkToken } from "@/lib/stockEntryRemarks";
import { UI_DENIER, UI_LOT_NO } from "@/lib/uiLabels";
import { WEIGHT_UNIT_LABEL } from "@/lib/units";

type StockEntryListResponse = {
  data: Array<{
    name: string;
    remarks?: string;
    posting_date?: string;
  }>;
};

type StockEntryDetailResponse = {
  data?: {
    company?: string;
    items?: Array<{
      item_code?: string;
      t_warehouse?: string;
      s_warehouse?: string;
      qty?: number;
      custom_cops?: number;
      custom_net_weight?: number;
      custom_grade?: string;
    }>;
  };
};

type ItemNameResponse = {
  data: Array<{
    name?: string;
    item_name?: string;
  }>;
};

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtQty(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUnit(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function StockReportPage() {
  const [asOnDate, setAsOnDate] = useState(todayLocalISODate);
  const [warehouse, setWarehouse] = useState("");
  const [companyTitle, setCompanyTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReportTableRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const wh = await fetchAppWarehouseName();
      setWarehouse(wh || "");

      let coName = "";
      try {
        const cRes = await api.get<{ data?: Array<{ company_name?: string; name?: string }> }>(
          "/api/resource/Company",
          {
            params: {
              fields: JSON.stringify(["name", "company_name"]),
              limit_page_length: 1
            }
          }
        );
        const first = cRes.data.data?.[0];
        coName = (first?.company_name || first?.name || "").trim();
      } catch {
        coName = "";
      }
      setCompanyTitle(coName);

      if (!wh) {
        setRows([]);
        setLoading(false);
        return;
      }

      const listRes = await api.get<StockEntryListResponse>("/api/resource/Stock Entry", {
        params: {
          fields: JSON.stringify(["name", "remarks", "posting_date"]),
          filters: JSON.stringify([
            ["stock_entry_type", "=", "Material Receipt"],
            ["docstatus", "=", 1],
            ["posting_date", "<=", asOnDate]
          ]),
          order_by: "posting_date desc, creation desc",
          limit_page_length: 500
        }
      });

      const entries = listRes.data.data ?? [];
      if (entries.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const details = await Promise.all(
        entries.map((e) => api.get<StockEntryDetailResponse>(`/api/resource/Stock Entry/${e.name}`))
      );

      const itemCodes = new Set<string>();
      for (let i = 0; i < entries.length; i++) {
        const firstItem = details[i].data.data?.items?.[0];
        const ic = firstItem?.item_code;
        const itemWh = firstItem?.t_warehouse || firstItem?.s_warehouse || "";
        if (ic && itemWh === wh) itemCodes.add(ic);
      }

      const itemNameMap: Record<string, string> = {};
      if (itemCodes.size > 0) {
        const itemsRes = await api.get<ItemNameResponse>("/api/resource/Item", {
          params: {
            fields: JSON.stringify(["name", "item_name"]),
            filters: JSON.stringify([["name", "in", [...itemCodes]]]),
            limit_page_length: 500
          }
        });
        for (const row of itemsRes.data.data ?? []) {
          if (row.name) itemNameMap[row.name] = row.item_name || row.name;
        }
      }

      type Agg = { denier: string; machineLabels: Set<string>; grades: GradeBlock };
      const byLot = new Map<string, Agg>();

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const detail = details[i].data.data;
        const firstItem = detail?.items?.[0];
        if (!firstItem?.item_code) continue;
        const itemWh = firstItem.t_warehouse || firstItem.s_warehouse || "";
        if (itemWh !== wh) continue;

        const itemCode = firstItem.item_code;
        const denier = itemNameMap[itemCode] || itemCode;
        const la = parseLotAttrsFromRemarks(entry.remarks);
        const machRaw =
          la.machineNo.trim() ||
          parseRemarkToken(entry.remarks, "MACH")?.trim() ||
          "";

        const netParsed = parseRemarkToken(entry.remarks, "NET");
        const netFromRemarks = netParsed !== undefined ? Number(netParsed) : NaN;
        const netQty =
          typeof firstItem.custom_net_weight === "number" ?
            firstItem.custom_net_weight
          : Number.isFinite(netFromRemarks) ?
            netFromRemarks
          : Number(firstItem.qty) || 0;

        const { grade, metrics } = metricsFromBoxLine({
          remarks: entry.remarks,
          customGrade: firstItem.custom_grade,
          customCops: firstItem.custom_cops,
          netQty
        });

        let agg = byLot.get(itemCode);
        if (!agg) {
          agg = { denier, machineLabels: new Set<string>(), grades: emptyGradeBlock() };
          byLot.set(itemCode, agg);
        }
        addToGradeBlock(agg.grades, grade, metrics);
        if (machRaw) agg.machineLabels.add(machRaw);
      }

      const dataRows: ReportDataRow[] = [...byLot.entries()].map(([lotNo, agg]) => {
        const machineNo =
          agg.machineLabels.size === 0 ? "—"
          : agg.machineLabels.size === 1 ? [...agg.machineLabels][0]
          : [...agg.machineLabels].sort().join(", ");
        return {
          kind: "data" as const,
          denier: agg.denier,
          lotNo,
          machineNo,
          grades: agg.grades
        };
      });

      setRows(buildReportRows(dataRows));
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load stock report."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [asOnDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const formattedDate = useMemo(() => {
    try {
      const [y, m, d] = asOnDate.split("-").map(Number);
      if (!y || !m || !d) return asOnDate;
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch {
      return asOnDate;
    }
  }, [asOnDate]);

  return (
    <section className="mx-auto w-full max-w-[100rem] rounded-xl bg-white p-6 shadow-sm print:shadow-none">
      <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Detail stock report</h1>
          <p className="mt-1 text-sm text-slate-600">
            One row per {UI_LOT_NO.toLowerCase()}: boxes, units, and qty are summed across all material
            receipts for that lot. Same denier can appear on multiple rows. Mach. no. from{" "}
            <span className="font-mono">MACH</span> / lot (comma-separated if several).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Stock as on</label>
            <input
              type="date"
              value={asOnDate}
              onChange={(e) => setAsOnDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Print
          </button>
        </div>
      </div>

      <div className="report-header mb-4 border-b border-slate-200 pb-4 text-center print:mb-2">
        <p className="text-lg font-bold uppercase tracking-wide text-slate-900">
          {companyTitle || "—"}
        </p>
        <p className="mt-1 text-base font-semibold text-slate-800">Detail stock report</p>
        <p className="mt-1 text-sm text-slate-600">
          Stock as on: <span className="font-semibold tabular-nums">{formattedDate}</span>
          {warehouse ?
            <>
              {" "}
              · Warehouse: <span className="font-semibold">{warehouse}</span>
            </>
          : null}
        </p>
      </div>

      {error ?
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      : null}

      {!loading && !error && !warehouse ?
        <p className="text-sm text-slate-600">No finished goods warehouse found.</p>
      : null}

      {loading ?
        <p className="text-slate-600">Loading report…</p>
      : !error && warehouse ?
        <div className="overflow-x-auto rounded-lg border border-slate-200 print:border-0">
          <table className="w-full min-w-[56rem] border-collapse text-left text-xs print:text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-800">
                <th
                  className="sticky left-0 z-10 bg-slate-100 px-2 py-2 font-semibold print:static"
                  rowSpan={2}
                >
                  {UI_DENIER}
                </th>
                <th className="bg-slate-100 px-2 py-2 font-semibold" rowSpan={2}>
                  {UI_LOT_NO}
                </th>
                <th className="px-2 py-2 font-semibold" rowSpan={2}>
                  Mach. no.
                </th>
                {REPORT_GRADE_HEADERS.map((g) => (
                  <th key={g} className="border-l border-slate-300 px-1 py-2 text-center font-semibold" colSpan={3}>
                    {g}
                  </th>
                ))}
                <th className="border-l-2 border-slate-400 px-1 py-2 text-center font-semibold" colSpan={3}>
                  Total
                </th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase text-slate-600 sm:text-xs">
                {REPORT_GRADE_HEADERS.map((g) => (
                  <Fragment key={`${g}-sub`}>
                    <th className="border-l border-slate-200 px-1 py-1.5 text-right">Box</th>
                    <th className="px-1 py-1.5 text-right">Unit</th>
                    <th className="px-1 py-1.5 text-right">Qty</th>
                  </Fragment>
                ))}
                <th className="border-l-2 border-slate-400 px-1 py-1.5 text-right">Box</th>
                <th className="px-1 py-1.5 text-right">Unit</th>
                <th className="px-1 py-1.5 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {rows.length === 0 ?
                <tr>
                  <td colSpan={18} className="px-3 py-8 text-center text-slate-500">
                    No material receipts in this warehouse on or before the selected date.
                  </td>
                </tr>
              : rows.map((row, idx) => (
                  <ReportBodyRow key={idx} row={row} />
                ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 print:hidden">
            Qty in {WEIGHT_UNIT_LABEL}. Unit = cops per box from stock entry.
          </p>
        </div>
      : null}
    </section>
  );
}

function ReportBodyRow({ row }: { row: ReportTableRow }) {
  if (row.kind === "data") {
    return (
      <tr className="border-b border-slate-100 hover:bg-slate-50/80">
        <td className="sticky left-0 bg-white px-2 py-1.5 font-medium print:static">{row.denier}</td>
        <td className="bg-white px-2 py-1.5 font-mono text-[11px]">{row.lotNo}</td>
        <td className="whitespace-nowrap px-2 py-1.5">{row.machineNo}</td>
        <GradeCells block={row.grades} />
      </tr>
    );
  }

  if (row.kind === "subtotal") {
    return (
      <tr className="border-t border-slate-300 bg-slate-100 font-semibold text-slate-900">
        <td colSpan={3} className="px-2 py-2">
          {row.label}
        </td>
        <GradeCells block={row.grades} strong />
      </tr>
    );
  }

  return (
    <tr className="border-t-2 border-slate-900 bg-slate-200 font-bold text-slate-950">
      <td colSpan={3} className="px-2 py-2.5 uppercase tracking-wide">
        Grand total
      </td>
      <GradeCells block={row.grades} strong />
    </tr>
  );
}

function GradeCells({ block, strong }: { block: GradeBlock; strong?: boolean }) {
  const total = totalBlock(block);
  const cls = strong ? "tabular-nums text-right font-semibold" : "tabular-nums text-right";

  return (
    <>
      {REPORT_GRADE_HEADERS.map((k) => {
        const g = block[k];
        return (
          <Fragment key={k}>
            <td className={`${cls} border-l border-slate-200 px-1 py-1.5`}>
              {g.boxes ? g.boxes : "—"}
            </td>
            <td className={`${cls} px-1 py-1.5`}>{g.units ? fmtUnit(g.units) : "—"}</td>
            <td className={`${cls} px-1 py-1.5`}>{g.quantity ? fmtQty(g.quantity) : "—"}</td>
          </Fragment>
        );
      })}
      <td className={`${cls} border-l-2 border-slate-400 px-1 py-1.5`}>
        {total.boxes ? total.boxes : "—"}
      </td>
      <td className={`${cls} px-1 py-1.5`}>{total.units ? fmtUnit(total.units) : "—"}</td>
      <td className={`${cls} px-1 py-1.5`}>{total.quantity ? fmtQty(total.quantity) : "—"}</td>
    </>
  );
}
