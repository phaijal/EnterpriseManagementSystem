"use client";

import type { AxiosInstance } from "axios";
import { FormEvent, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  buildItemDescriptionLotAttrs,
  LOT_ATTR_LABELS,
  type LotAttrs
} from "@/lib/itemLotAttributes";
import { UI_DENIER, UI_LOT_NO } from "@/lib/uiLabels";

type UomResponse = {
  data: Array<{
    name?: string;
    uom_name?: string;
  }>;
};

const FIXED_ITEM_GROUP = "Products";
const EMPTY_LOT_ATTRS: LotAttrs = {
  twist: "",
  shade: "",
  quality: "",
  machineNo: ""
};

function pickDefaultStockUom(uoms: string[]): string {
  const preferred = ["Kg", "Kgs", "kg", "kgs", "KG"];
  for (const p of preferred) {
    const hit = uoms.find((u) => u.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return uoms[0] ?? "";
}

async function ensureUom(client: AxiosInstance, label: string): Promise<void> {
  try {
    await client.post("/api/resource/UOM", { uom_name: label });
  } catch {
    /* exists or not permitted */
  }
}

const LOT_ATTR_KEYS = ["twist", "shade", "quality", "machineNo"] as const;

export default function AddItemPage() {
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [stockUom, setStockUom] = useState("Kg");
  const [uomOptions, setUomOptions] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [lotAttrs, setLotAttrs] = useState<LotAttrs>({ ...EMPTY_LOT_ATTRS });

  useEffect(() => {
    const fetchFormMeta = async () => {
      try {
        await ensureUom(api, "Kgs");
        await ensureUom(api, "Kg");

        const uomRes = await api.get<UomResponse>(
          '/api/resource/UOM?fields=["name","uom_name"]&limit_page_length=500'
        );

        const uoms = Array.from(
          new Set(
            (uomRes.data.data ?? [])
              .map((row) => row.uom_name || row.name || "")
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));

        setUomOptions(uoms);
        const def = pickDefaultStockUom(uoms);
        if (def) setStockUom(def);
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to fetch form options."));
      } finally {
        setLoadingMeta(false);
      }
    };

    fetchFormMeta();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");

    try {
      const attrBlock = buildItemDescriptionLotAttrs(lotAttrs);
      const finalStockUom = stockUom.trim() || "Kg";
      const payload: Record<string, unknown> = {
        item_code: itemCode,
        item_name: itemName,
        is_stock_item: 1,
        item_group: FIXED_ITEM_GROUP,
        stock_uom: finalStockUom
      };
      if (attrBlock) payload.description = attrBlock;

      const response = await api.post("/api/resource/Item", payload);

      const createdName = response.data?.data?.name ?? itemCode;
      setSuccessMessage(`Saved: ${UI_LOT_NO} ${createdName}`);
      setItemCode("");
      setItemName("");
      setLotAttrs({ ...EMPTY_LOT_ATTRS });
    } catch (error) {
      alert(
        getApiErrorMessage(
          error,
          "Failed to create stock lot. Please verify UOM and that an Item Group exists in ERPNext."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Create stock lot</h1>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{UI_LOT_NO}</label>
          <input
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder="ITEM-001"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{UI_DENIER}</label>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder="e.g. 200D"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {LOT_ATTR_KEYS.map((key) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {LOT_ATTR_LABELS[key]}
              </label>
              <input
                value={lotAttrs[key]}
                onChange={(e) => setLotAttrs((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
                autoComplete="off"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Twist, shade, quality, and machine no. are stored on the lot as text in Item description
          (same format as stock remarks) and prefilled when you add stock.
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Stock UOM
          </label>
          <select
            value={uomOptions.includes(stockUom) ? stockUom : uomOptions[0] ?? ""}
            onChange={(e) => setStockUom(e.target.value)}
            required
            disabled={loadingMeta || uomOptions.length === 0}
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
          >
            {loadingMeta ? (
              <option value="">Loading…</option>
            ) : uomOptions.length === 0 ? (
              <option value="">No UOMs</option>
            ) : (
              uomOptions.map((uom) => (
                <option key={uom} value={uom}>
                  {uom}
                </option>
              ))
            )}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Defaults to Kg or Kgs when present. The app tries to create Kg/Kgs in ERPNext if missing.
          </p>
        </div>
        {!loadingMeta && uomOptions.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Create lot is disabled until at least one <strong>UOM</strong> exists (Desk → Stock → UOM).
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          title={`Item group: ${FIXED_ITEM_GROUP}`}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {loading ? "Creating…" : "Create lot"}
        </button>
      </form>

      {successMessage && (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}
    </section>
  );
}
