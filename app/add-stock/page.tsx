"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import { fetchDoctypeFieldNames } from "@/lib/frappeMeta";
import { fetchAppWarehouseName } from "@/lib/finishedGoodsWarehouse";
import {
  buildLotAttrsRemarkSuffix,
  EMPTY_LOT_ATTRS,
  LOT_ATTR_LABELS,
  lotAttrsFromItemDoc,
  type LotAttrs
} from "@/lib/itemLotAttributes";
import {
  GRADE_OPTIONS,
  type GradeValue,
  sanitizeLotForRemarks
} from "@/lib/stockEntryRemarks";
import { buildBoxSlipsHtmlDocument, printBoxSlipsHtml } from "@/lib/boxSlipPrint";
import { UI_LOT_NO } from "@/lib/uiLabels";
import { WEIGHT_UNIT_LABEL, weightLabel } from "@/lib/units";

type ItemRow = {
  item_code?: string;
  name?: string;
};

type ItemResponse = {
  data: ItemRow[];
};

type StockEntryListResponse = {
  data: Array<{
    remarks?: string;
  }>;
};

type CompanyResponse = {
  data: Array<{
    name?: string;
  }>;
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

function extractBoxNumber(remarks?: string) {
  if (!remarks) return 0;
  const match = remarks.match(/BOX:(\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function fetchMaxBoxNumber(): Promise<number> {
  try {
    const response = await api.get<StockEntryListResponse>(
      '/api/resource/Stock Entry?fields=["remarks"]&filters=[["stock_entry_type","=","Material Receipt"]]&order_by=creation desc&limit_page_length=200'
    );
    return (response.data.data ?? []).reduce((max, row) => {
      return Math.max(max, extractBoxNumber(row.remarks));
    }, 0);
  } catch {
    return 0;
  }
}

type QueuedBox = {
  tempId: string;
  numCops: number;
  boxWeight: number;
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  grade: GradeValue;
};

export default function AddStockPage() {
  const [itemCode, setItemCode] = useState("");
  const [copWeight, setCopWeight] = useState<number>(0);
  const [warehouse, setWarehouse] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [useCustomFields, setUseCustomFields] = useState(false);
  const [useGradeLotCustom, setUseGradeLotCustom] = useState(false);
  const [nextBoxHint, setNextBoxHint] = useState(1);

  const [draftCops, setDraftCops] = useState<number>(1);
  const [draftBoxWeight, setDraftBoxWeight] = useState<number>(0);
  const [draftGross, setDraftGross] = useState<number>(0);
  const [draftGrade, setDraftGrade] = useState<GradeValue>("1ST");
  const [lotAttrs, setLotAttrs] = useState<LotAttrs>({ ...EMPTY_LOT_ATTRS });
  const [loadingItemAttrs, setLoadingItemAttrs] = useState(false);

  const [queue, setQueue] = useState<QueuedBox[]>([]);
  const [printSlipsOnSubmit, setPrintSlipsOnSubmit] = useState(true);
  /** Last generated slips HTML — used for “Print again” if the post-submit print was blocked or cancelled. */
  const [slipsHtmlForPrint, setSlipsHtmlForPrint] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");

  const sessionLocked = queue.length > 0;

  const draftTare = draftCops * copWeight + draftBoxWeight;
  const draftNet = Math.max(0, draftGross - draftTare);

  useEffect(() => {
    const fetchStockItems = async () => {
      try {
        const response = await api.get<ItemResponse>(
          '/api/resource/Item?fields=["name","item_code"]&filters=[["is_stock_item","=",1],["disabled","=",0]]&limit_page_length=500'
        );
        const uniqueItems = Array.from(
          new Set(
            (response.data.data ?? [])
              .map((row) => row.item_code || row.name || "")
              .filter((value) => Boolean(value))
          )
        ).sort((a, b) => a.localeCompare(b));

        setItemOptions(uniqueItems);
        if (!itemCode && uniqueItems.length > 0) {
          setItemCode(uniqueItems[0]);
        }
      } catch (error) {
        alert(
          getApiErrorMessage(
            error,
            `Failed to fetch ${UI_LOT_NO.toLowerCase()} list.`
          )
        );
      } finally {
        setLoadingItems(false);
      }
    };

    fetchStockItems();
  }, []);

  useEffect(() => {
    if (!itemCode || sessionLocked) return;
    let cancelled = false;
    setLoadingItemAttrs(true);
    const load = async () => {
      try {
        const res = await api.get<{ data?: Record<string, unknown> }>(
          `/api/resource/Item/${encodeURIComponent(itemCode)}`
        );
        if (!cancelled) {
          setLotAttrs(lotAttrsFromItemDoc(res.data?.data));
        }
      } catch {
        if (!cancelled) setLotAttrs({ ...EMPTY_LOT_ATTRS });
      } finally {
        if (!cancelled) setLoadingItemAttrs(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [itemCode, sessionLocked]);

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
    const fetchWarehouses = async () => {
      try {
        const picked = await fetchAppWarehouseName();
        if (picked) {
          setWarehouse(picked);
        }
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to fetch finished goods warehouse."));
      } finally {
        setLoadingWarehouses(false);
      }
    };

    fetchWarehouses();
  }, []);

  useEffect(() => {
    const fetchCompanyName = async () => {
      try {
        const response = await api.get<CompanyResponse>(
          '/api/resource/Company?fields=["name"]&limit_page_length=1'
        );
        setCompanyName(response.data.data?.[0]?.name || "");
      } catch {
        setCompanyName("");
      }
    };
    void fetchCompanyName();
  }, []);

  const refreshNextBoxHint = useCallback(async () => {
    const maxBox = await fetchMaxBoxNumber();
    setNextBoxHint(maxBox + 1);
  }, []);

  useEffect(() => {
    refreshNextBoxHint();
  }, [refreshNextBoxHint]);

  const addToQueue = (e: FormEvent) => {
    e.preventDefault();

    if (!itemCode) {
      alert(`Choose a ${UI_LOT_NO.toLowerCase()}.`);
      return;
    }
    if (copWeight < 0 || Number.isNaN(copWeight)) {
      alert("Cop weight must be zero or positive.");
      return;
    }
    if (draftCops < 1 || !Number.isInteger(draftCops)) {
      alert("Number of cops must be a whole number ≥ 1.");
      return;
    }
    if (draftBoxWeight < 0 || Number.isNaN(draftBoxWeight)) {
      alert("Box weight must be zero or positive.");
      return;
    }
    if (draftGross <= 0) {
      alert("Enter gross weight (scale reading).");
      return;
    }
    const lotToken = sanitizeLotForRemarks(itemCode);
    if (!lotToken) {
      alert(`Choose a valid ${UI_LOT_NO.toLowerCase()}.`);
      return;
    }
    const tare = draftCops * copWeight + draftBoxWeight;
    const net = draftGross - tare;
    if (net <= 0) {
      alert(
        `Net weight must be positive. Gross (${draftGross}) must be greater than tare (${tare.toFixed(2)}).`
      );
      return;
    }

    setQueue((q) => [
      ...q,
      {
        tempId: crypto.randomUUID(),
        numCops: draftCops,
        boxWeight: draftBoxWeight,
        grossWeight: draftGross,
        tareWeight: tare,
        netWeight: net,
        grade: draftGrade
      }
    ]);
    setDraftCops(1);
    setDraftBoxWeight(0);
    setDraftGross(0);
  };

  const removeQueued = (tempId: string) => {
    setQueue((q) => q.filter((row) => row.tempId !== tempId));
  };

  const submitAll = async () => {
    if (queue.length === 0) return;
    setLoading(true);
    setSlipsHtmlForPrint(null);

    const startBox = (await fetchMaxBoxNumber()) + 1;
    const snapshot = [...queue];
    const lotToken = sanitizeLotForRemarks(itemCode);

    for (let i = 0; i < snapshot.length; i++) {
      const row = snapshot[i];
      const boxNo = startBox + i;
      const remarks =
        `BOX:${boxNo};COPS:${row.numCops};GROSS:${row.grossWeight};TARE:${row.tareWeight};NET:${row.netWeight};COPW:${copWeight};GRADE:${row.grade};LOT:${lotToken}` +
        buildLotAttrsRemarkSuffix(lotAttrs);

      try {
        const createResponse = await api.post("/api/resource/Stock Entry", {
          stock_entry_type: "Material Receipt",
          remarks,
          items: [
            {
              item_code: itemCode,
              qty: row.netWeight,
              t_warehouse: warehouse,
              allow_zero_valuation_rate: 1,
              basic_rate: 0,
              ...(useCustomFields
                ? {
                    [CUSTOM_FIELDS.box]: boxNo,
                    [CUSTOM_FIELDS.cops]: row.numCops,
                    [CUSTOM_FIELDS.tare]: row.tareWeight,
                    [CUSTOM_FIELDS.gross]: row.grossWeight,
                    [CUSTOM_FIELDS.net]: row.netWeight
                  }
                : {}),
              ...(useGradeLotCustom
                ? {
                    [CUSTOM_FIELDS.grade]: row.grade,
                    [CUSTOM_FIELDS.lot]: lotToken
                  }
                : {})
            }
          ]
        });
        const createdDoc = createResponse.data?.data;
        const stockEntryName = createdDoc?.name;

        if (stockEntryName) {
          await api.post("/api/method/frappe.client.submit", {
            doc: JSON.stringify(createdDoc)
          });
        }
      } catch (error) {
        alert(
          getApiErrorMessage(
            error,
            `Stopped at box ${boxNo} (${i + 1} of ${snapshot.length}). Earlier boxes were submitted. Remaining rows are still in your queue — fix or remove, then submit again.`
          )
        );
        setQueue(snapshot.slice(i));
        await refreshNextBoxHint();
        setLoading(false);
        return;
      }
    }

    setQueue([]);
    await refreshNextBoxHint();
    setLoading(false);

    if (printSlipsOnSubmit) {
      const html = buildBoxSlipsHtmlDocument({
        itemCode,
        organizationName: companyName || undefined,
        printedAt: new Date().toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        }),
        slips: snapshot.map((row, i) => ({
          boxNumber: startBox + i,
          numCops: row.numCops,
          boxWeight: row.boxWeight,
          copWeight,
          tareWeight: row.tareWeight,
          grossWeight: row.grossWeight,
          netWeight: row.netWeight,
          grade: row.grade,
          twist: lotAttrs.twist || undefined,
          shade: lotAttrs.shade || undefined,
          quality: lotAttrs.quality || undefined,
          machineNo: lotAttrs.machineNo || undefined
        }))
      });
      setSlipsHtmlForPrint(html);
      printBoxSlipsHtml(html);
    }
  };

  return (
    <section className="mx-auto w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Add stock</h1>

      <div className="mb-4 flex flex-wrap gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <span>
          Next box no. (after last in ERP):{" "}
          <span className="font-semibold tabular-nums">{nextBoxHint}</span>
        </span>
        <span className="text-slate-400">|</span>
        <span>
          Finished goods warehouse:{" "}
          <span className="font-semibold">
            {loadingWarehouses ? "Loading…" : warehouse || "Not found"}
          </span>
          <span className="ml-1 text-slate-500">(fixed)</span>
        </span>
      </div>

      <div className="mb-6 space-y-4 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Session ({UI_LOT_NO.toLowerCase()}, attributes &amp; cop weight)
        </h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{UI_LOT_NO}</label>
          <select
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            required
            disabled={loadingItems || sessionLocked}
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
          >
            {loadingItems ? (
              <option value="">Loading…</option>
            ) : itemOptions.length > 0 ? (
              itemOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))
            ) : (
              <option value="">No lots found.</option>
            )}
          </select>
          {sessionLocked && (
            <p className="mt-1 text-xs text-slate-500">
              Clear the queue below to change {UI_LOT_NO.toLowerCase()}, attributes, or cop weight.
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(LOT_ATTR_LABELS) as (keyof LotAttrs)[]).map((key) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {LOT_ATTR_LABELS[key]}
              </label>
              <input
                type="text"
                value={lotAttrs[key]}
                readOnly
                disabled
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                autoComplete="off"
                placeholder={loadingItemAttrs ? "Loading…" : ""}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Lot attributes are read from the selected lot and cannot be edited while adding stock.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Cop weight ({WEIGHT_UNIT_LABEL})
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={copWeight}
            onChange={(e) => setCopWeight(Number(e.target.value))}
            disabled={sessionLocked}
            className="w-full max-w-xs rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
          />
          <p className="mt-1 text-xs text-slate-500">
            Weight per cop (packaging / tray per unit). Tare includes{" "}
            <span className="font-medium">number of cops × this value</span>.
          </p>
        </div>
      </div>

      <form className="mb-6 space-y-4 rounded-lg border border-slate-200 p-4" onSubmit={addToQueue}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a box</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">No. of cops</label>
            <input
              type="number"
              min="1"
              step="1"
              value={draftCops}
              onChange={(e) => setDraftCops(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Box weight ({WEIGHT_UNIT_LABEL})
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draftBoxWeight}
              onChange={(e) => setDraftBoxWeight(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
            <p className="mt-1 text-xs text-slate-500">Outer box / extra fixed tare</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {weightLabel("Gross")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draftGross}
              onChange={(e) => setDraftGross(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Grade</label>
          <select
            value={draftGrade}
            onChange={(e) => setDraftGrade(e.target.value as GradeValue)}
            className="w-full max-w-xs rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span>
            Tare (auto):{" "}
            <strong className="tabular-nums text-slate-900">{draftTare.toFixed(2)}</strong>{" "}
            {WEIGHT_UNIT_LABEL}
          </span>
          <span className="text-slate-300">|</span>
          <span>
            Net (gross − tare):{" "}
            <strong className="tabular-nums text-slate-900">{draftNet.toFixed(2)}</strong>{" "}
            {WEIGHT_UNIT_LABEL}
          </span>
        </div>
        <button
          type="submit"
          disabled={loadingItems || !itemCode || loading}
          className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add box to queue
        </button>
      </form>

      {queue.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-lg border">
          <div className="border-b bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
            Queue ({queue.length} box{queue.length === 1 ? "" : "es"}) — {UI_LOT_NO} {itemCode}, cop
            weight {copWeight.toFixed(3)} {WEIGHT_UNIT_LABEL}, grades{" "}
            {Array.from(new Set(queue.map((row) => row.grade))).join(", ")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Cops</th>
                  <th className="px-3 py-2">Box wt</th>
                  <th className="px-3 py-2">Tare</th>
                  <th className="px-3 py-2">Gross</th>
                  <th className="px-3 py-2">Net</th>
                  <th className="px-3 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr key={row.tempId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{row.grade}</td>
                    <td className="px-3 py-2 tabular-nums">{row.numCops}</td>
                    <td className="px-3 py-2 tabular-nums">{row.boxWeight.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums">{row.tareWeight.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums">{row.grossWeight.toFixed(2)}</td>
                    <td className="px-3 py-2 font-medium tabular-nums text-slate-900">
                      {row.netWeight.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => removeQueued(row.tempId)}
                        className="text-xs font-semibold text-red-700 underline hover:text-red-900"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={printSlipsOnSubmit}
          onChange={(e) => setPrintSlipsOnSubmit(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span>Print box slips</span>
      </label>

      <button
        type="button"
        onClick={() => void submitAll()}
        disabled={
          loading ||
          loadingItems ||
          loadingWarehouses ||
          itemOptions.length === 0 ||
          !warehouse ||
          queue.length === 0
        }
        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {loading ?
          "Submitting…"
        : queue.length === 0 ?
          "Submit (add boxes to queue first)"
        : `Submit ${queue.length} material receipt${queue.length === 1 ? "" : "s"}`}
      </button>

      <div className="mt-4">
        <Link
          href="/add-item"
          className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
        >
          Missing a {UI_LOT_NO.toLowerCase()}? Create one
        </Link>
      </div>

      {slipsHtmlForPrint ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => printBoxSlipsHtml(slipsHtmlForPrint)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Print again
          </button>
        </div>
      ) : null}
    </section>
  );
}
