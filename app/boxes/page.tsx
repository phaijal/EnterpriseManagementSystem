"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TablePagination } from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, getApiErrorMessage } from "@/lib/api";
import { fetchAppWarehouseName } from "@/lib/finishedGoodsWarehouse";
import { fetchDoctypeFieldNames } from "@/lib/frappeMeta";
import { weightLabel } from "@/lib/units";
import { fetchSubmittedChallanLockMap } from "@/lib/challanLocks";
import { printSingleBoxSlip } from "@/lib/boxSlipPrint";
import {
  buildLotAttrsRemarkSuffix,
  parseLotAttrsFromRemarks
} from "@/lib/itemLotAttributes";
import { GRADE_OPTIONS, parseRemarkToken, sanitizeLotForRemarks } from "@/lib/stockEntryRemarks";
import { UI_DENIER, UI_LOT_NO } from "@/lib/uiLabels";

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
      custom_box_no?: number;
      custom_cops?: number;
      custom_tare_weight?: number;
      custom_gross_weight?: number;
      custom_net_weight?: number;
      custom_grade?: string;
      custom_lot_no?: string;
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
  grade: string;
  lot: string;
  twist: string;
  shade: string;
  quality: string;
  machine_no: string;
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
  grade: string;
};

const CUSTOM_FIELDS = {
  box: "custom_box_no",
  cops: "custom_cops",
  tare: "custom_tare_weight",
  gross: "custom_gross_weight",
  net: "custom_net_weight",
  grade: "custom_grade",
  lot: "custom_lot_no"
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
  /** Stock Entry name → submitted Delivery Note name */
  const [challanByStockEntry, setChallanByStockEntry] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [challanFilter, setChallanFilter] = useState<"available" | "all" | "on_challan">("available");
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [slipPrinting, setSlipPrinting] = useState<string | null>(null);
  const [useCustomFields, setUseCustomFields] = useState(false);
  const [useGradeLotCustom, setUseGradeLotCustom] = useState(false);

  useEffect(() => {
    const detectCustomFields = async () => {
      try {
        const names = await fetchDoctypeFieldNames("Stock Entry Detail");
        const available =
          names.has(CUSTOM_FIELDS.box) &&
          names.has(CUSTOM_FIELDS.cops) &&
          names.has(CUSTOM_FIELDS.tare) &&
          names.has(CUSTOM_FIELDS.gross) &&
          names.has(CUSTOM_FIELDS.net);
        setUseCustomFields(available);
        setUseGradeLotCustom(
          names.has(CUSTOM_FIELDS.grade) && names.has(CUSTOM_FIELDS.lot)
        );
      } catch {
        setUseCustomFields(false);
        setUseGradeLotCustom(false);
      }
    };
    detectCustomFields();
  }, []);

  useEffect(() => {
    const fetchBoxes = async () => {
      try {
        const selectedWarehouse = await fetchAppWarehouseName();
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
            const boxNumber = firstItem?.custom_box_no;
            const cops = firstItem?.custom_cops;
            const tare = firstItem?.custom_tare_weight;
            const gross = firstItem?.custom_gross_weight;
            const net = firstItem?.custom_net_weight;
            const grade =
              firstItem?.custom_grade?.trim() ||
              parseRemarkToken(entry.remarks, "GRADE") ||
              "—";
            const lot =
              firstItem?.custom_lot_no?.trim() ||
              parseRemarkToken(entry.remarks, "LOT") ||
              "—";
            const la = parseLotAttrsFromRemarks(entry.remarks);

            return {
              box: boxNumber ? `Box ${boxNumber}` : parsed.box,
              item_code: itemCode,
              item_name: itemNameMap[itemCode] || itemCode,
              grade,
              lot,
              twist: la.twist || "—",
              shade: la.shade || "—",
              quality: la.quality || "—",
              machine_no: la.machineNo || "—",
              cops: cops ?? parsed.cops ?? "-",
              tare_weight: tare ?? parsed.tare ?? "-",
              gross_weight: gross ?? parsed.gross ?? "-",
              net_weight: net ?? parsed.net ?? firstItem?.qty ?? 0,
              stock_entry: entry.name
            };
          })
          .filter((row): row is BoxRow => Boolean(row));

        const lockMap = await fetchSubmittedChallanLockMap(api);
        setChallanByStockEntry(Object.fromEntries(lockMap));
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
      const selectedWarehouse = await fetchAppWarehouseName();
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
          const boxNumber = firstItem?.custom_box_no;
          const cops = firstItem?.custom_cops;
          const tare = firstItem?.custom_tare_weight;
          const gross = firstItem?.custom_gross_weight;
          const net = firstItem?.custom_net_weight;
          const grade =
            firstItem?.custom_grade?.trim() ||
            parseRemarkToken(entry.remarks, "GRADE") ||
            "—";
          const lot =
            firstItem?.custom_lot_no?.trim() ||
            parseRemarkToken(entry.remarks, "LOT") ||
            "—";
          const la = parseLotAttrsFromRemarks(entry.remarks);

          return {
            box: boxNumber ? `Box ${boxNumber}` : parsed.box,
            item_code: itemCode,
            item_name: itemNameMap[itemCode] || itemCode,
            grade,
            lot,
            twist: la.twist || "—",
            shade: la.shade || "—",
            quality: la.quality || "—",
            machine_no: la.machineNo || "—",
            cops: cops ?? parsed.cops ?? "-",
            tare_weight: tare ?? parsed.tare ?? "-",
            gross_weight: gross ?? parsed.gross ?? "-",
            net_weight: net ?? parsed.net ?? firstItem?.qty ?? 0,
            stock_entry: entry.name
          };
        })
        .filter((row): row is BoxRow => Boolean(row));

      const lockMap = await fetchSubmittedChallanLockMap(api);
      setChallanByStockEntry(Object.fromEntries(lockMap));
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
      gross_weight: typeof row.gross_weight === "number" ? row.gross_weight : 0,
      grade: row.grade !== "—" ? row.grade : "1ST"
    });
  };

  const saveEdit = async (row: BoxRow) => {
    if (!draft) return;
    const net = Math.max(0, draft.gross_weight - draft.tare_weight);
    setSaving(true);
    try {
      // ERPNext blocks editing submitted remarks.
      // Replace workflow: cancel old submitted entry, recreate with edited values, submit.
      const existingResponse = await api.get(`/api/resource/Stock Entry/${row.stock_entry}`);
      const existingDoc = existingResponse.data?.data;
      const firstItem = existingDoc?.items?.[0];

      if (!existingDoc || !firstItem) {
        throw new Error("Unable to load existing Stock Entry details.");
      }

      const lotClean = sanitizeLotForRemarks(firstItem.item_code || "");
      if (!lotClean) {
        alert(`${UI_LOT_NO} is missing on this stock line.`);
        return;
      }

      const copw = parseRemarkToken(existingDoc.remarks, "COPW");
      let remarks = `BOX:${draft.box};COPS:${draft.cops};GROSS:${draft.gross_weight};TARE:${draft.tare_weight};NET:${net}`;
      if (copw !== undefined && copw !== "") remarks += `;COPW:${copw}`;
      remarks += `;GRADE:${draft.grade};LOT:${lotClean}`;
      remarks += buildLotAttrsRemarkSuffix(parseLotAttrsFromRemarks(existingDoc.remarks));

      await api.post("/api/method/frappe.client.cancel", {
        doctype: "Stock Entry",
        name: row.stock_entry
      });

      const recreatedResponse = await api.post("/api/resource/Stock Entry", {
        stock_entry_type: existingDoc.stock_entry_type || "Material Receipt",
        company: existingDoc.company,
        posting_date: existingDoc.posting_date,
        posting_time: existingDoc.posting_time,
        remarks,
        items: [
          {
            item_code: firstItem.item_code,
            qty: net,
            t_warehouse: firstItem.t_warehouse,
            s_warehouse: firstItem.s_warehouse,
            allow_zero_valuation_rate: firstItem.allow_zero_valuation_rate ?? 1,
            basic_rate: firstItem.basic_rate ?? 0,
            ...(useCustomFields
              ? {
                  [CUSTOM_FIELDS.box]: Number(draft.box || 0),
                  [CUSTOM_FIELDS.cops]: draft.cops,
                  [CUSTOM_FIELDS.tare]: draft.tare_weight,
                  [CUSTOM_FIELDS.gross]: draft.gross_weight,
                  [CUSTOM_FIELDS.net]: net
                }
              : {}),
            ...(useGradeLotCustom
              ? {
                  [CUSTOM_FIELDS.grade]: draft.grade,
                  [CUSTOM_FIELDS.lot]: lotClean
                }
              : {})
          }
        ]
      });

      const recreatedDoc = recreatedResponse.data?.data;
      if (!recreatedDoc) {
        throw new Error("Failed to create replacement Stock Entry.");
      }

      await api.post("/api/method/frappe.client.submit", {
        doc: JSON.stringify(recreatedDoc)
      });

      setEditingEntry(null);
      setDraft(null);
      await refreshBoxes();
      alert("Box updated successfully by replacing the original stock entry.");
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

  const handlePrintSlip = useCallback(async (row: BoxRow) => {
    setSlipPrinting(row.stock_entry);
    try {
      const res = await api.get<{ data?: { remarks?: string } }>(
        `/api/resource/Stock Entry/${encodeURIComponent(row.stock_entry)}`
      );
      const remarks = res.data?.data?.remarks;
      printSingleBoxSlip({ row, stockEntryRemarks: remarks });
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to load stock entry for slip."));
    } finally {
      setSlipPrinting(null);
    }
  }, []);

  const filteredRows = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return rows.filter((row) => {
      const onChallan = Boolean(challanByStockEntry[row.stock_entry]);
      if (challanFilter === "available" && onChallan) return false;
      if (challanFilter === "on_challan" && !onChallan) return false;

      if (!term) return true;
      const blob = [
        row.item_code,
        row.item_name,
        row.twist,
        row.shade,
        row.quality,
        row.machine_no
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(term);
    });
  }, [rows, filter, challanByStockEntry, challanFilter]);

  const { pageItems, page, setPage, totalPages, from, to, total } = useClientPagination(
    filteredRows,
    pageSize,
    `${filter}|${challanFilter}`
  );

  return (
    <section className="mx-auto w-full max-w-5xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Boxes</h1>
      <p className="mb-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Finished goods warehouse:{" "}
        <span className="font-semibold">{warehouse || "Not found"}</span> (fixed). Use{" "}
        <span className="font-semibold">Print slip</span> on any row for a single-box print (same layout as
        Add stock). Boxes on a submitted challan cannot be edited; cancel the challan (All Challans) to
        release them.
      </p>

      <div className="mb-4">
        <p className="mb-2 block text-sm font-medium text-slate-700">Box visibility</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setChallanFilter("available")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              challanFilter === "available" ?
                "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            Available only
          </button>
          <button
            type="button"
            onClick={() => setChallanFilter("all")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              challanFilter === "all" ?
                "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setChallanFilter("on_challan")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              challanFilter === "on_challan" ?
                "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            On challan
          </button>
        </div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Filter by {UI_LOT_NO} or {UI_DENIER}
        </label>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Type ${UI_LOT_NO.toLowerCase()} or denier…`}
          className="w-full max-w-sm rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
        />
      </div>

      {loading ? (
        <p className="text-slate-600">Loading boxes...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-[1200px] w-full text-left">
            <thead className="bg-slate-100 text-sm font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">Box</th>
                <th className="px-4 py-3">{UI_LOT_NO}</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Cops</th>
                <th className="px-4 py-3">{weightLabel("Tare weight")}</th>
                <th className="px-4 py-3">{weightLabel("Gross weight")}</th>
                <th className="px-4 py-3">{weightLabel("Net weight")}</th>
                <th className="px-4 py-3">Challan</th>
                <th className="px-4 py-3">Slip</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                pageItems.map((row, index) => (
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
                    <td className="px-4 py-3 text-slate-800">
                      <div className="space-y-1 text-xs leading-5">
                        <p className="truncate" title={row.item_name}>
                          <span className="font-medium">{UI_DENIER}:</span> {row.item_name}
                        </p>
                        <p className="truncate" title={row.twist}>
                          <span className="font-medium">Twist:</span> {row.twist}
                        </p>
                        <p className="truncate" title={row.shade}>
                          <span className="font-medium">Shade:</span> {row.shade}
                        </p>
                        <p className="truncate" title={row.quality}>
                          <span className="font-medium">Quality:</span> {row.quality}
                        </p>
                        <p className="truncate" title={row.machine_no}>
                          <span className="font-medium">Mach.:</span> {row.machine_no}
                        </p>
                        <div className="pt-0.5">
                          <span className="mr-2 font-medium">Grade:</span>
                          {editingEntry === row.stock_entry && draft ? (
                            <select
                              value={draft.grade}
                              onChange={(e) =>
                                setDraft((prev) => (prev ? { ...prev, grade: e.target.value } : prev))
                              }
                              className="min-w-[5rem] rounded border px-1 py-0.5 text-xs"
                            >
                              {GRADE_OPTIONS.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>{row.grade}</span>
                          )}
                        </div>
                      </div>
                    </td>
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
                      {challanByStockEntry[row.stock_entry] ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          {challanByStockEntry[row.stock_entry]}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <button
                        type="button"
                        disabled={loading || slipPrinting === row.stock_entry}
                        onClick={() => void handlePrintSlip(row)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {slipPrinting === row.stock_entry ? "…" : "Print slip"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {challanByStockEntry[row.stock_entry] ? (
                        <span className="text-xs text-slate-500">On challan</span>
                      ) : editingEntry === row.stock_entry ? (
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
                  <td className="px-4 py-5 text-slate-500" colSpan={10}>
                    No box records found.
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
