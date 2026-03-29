"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  buildItemDescriptionLotAttrs,
  EMPTY_LOT_ATTRS,
  LOT_ATTR_LABELS,
  lotAttrsFromItemDoc,
  type LotAttrs
} from "@/lib/itemLotAttributes";
import { UI_DENIER, UI_LOT_NO } from "@/lib/uiLabels";

type ItemListResponse = {
  data?: Array<{
    name?: string;
    item_code?: string;
  }>;
};

type ItemDocResponse = {
  data?: Record<string, unknown>;
};

function EditItemPageInner() {
  const searchParams = useSearchParams();
  const initialItemCode = (searchParams.get("name") || "").trim();
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [lotAttrs, setLotAttrs] = useState<LotAttrs>({ ...EMPTY_LOT_ATTRS });
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingItemDoc, setLoadingItemDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const loadItems = async () => {
      setLoadingItems(true);
      try {
        const res = await api.get<ItemListResponse>("/api/resource/Item", {
          params: {
            fields: JSON.stringify(["name", "item_code"]),
            filters: JSON.stringify([["is_stock_item", "=", 1], ["disabled", "=", 0]]),
            limit_page_length: 1000,
            order_by: "item_code asc"
          }
        });
        const options = Array.from(
          new Set(
            (res.data?.data ?? [])
              .map((row) => (row.item_code || row.name || "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));
        setItemOptions(options);
        if (options.length === 0) return;
        if (initialItemCode && options.includes(initialItemCode)) {
          setItemCode(initialItemCode);
          return;
        }
        setItemCode(options[0]);
      } catch (error) {
        alert(getApiErrorMessage(error, `Failed to fetch ${UI_LOT_NO.toLowerCase()} list.`));
      } finally {
        setLoadingItems(false);
      }
    };
    void loadItems();
  }, [initialItemCode]);

  useEffect(() => {
    if (!itemCode) {
      setItemName("");
      setLotAttrs({ ...EMPTY_LOT_ATTRS });
      return;
    }
    const loadItemDoc = async () => {
      setLoadingItemDoc(true);
      setSuccessMessage("");
      try {
        const res = await api.get<ItemDocResponse>(`/api/resource/Item/${encodeURIComponent(itemCode)}`);
        const doc = res.data?.data ?? {};
        const resolvedItemName =
          typeof doc.item_name === "string" ? doc.item_name
          : typeof doc.name === "string" ? doc.name
          : "";
        setItemName(resolvedItemName);
        setLotAttrs(lotAttrsFromItemDoc(doc));
      } catch (error) {
        alert(getApiErrorMessage(error, `Failed to load ${UI_LOT_NO.toLowerCase()} details.`));
      } finally {
        setLoadingItemDoc(false);
      }
    };
    void loadItemDoc();
  }, [itemCode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!itemCode) return;
    setSaving(true);
    setSuccessMessage("");
    try {
      const description = buildItemDescriptionLotAttrs(lotAttrs);

      await api.post("/api/method/frappe.client.set_value", {
        doctype: "Item",
        name: itemCode,
        fieldname: "item_name",
        value: itemName
      });

      await api.post("/api/method/frappe.client.set_value", {
        doctype: "Item",
        name: itemCode,
        fieldname: "description",
        value: description
      });

      setSuccessMessage(`Saved: ${UI_LOT_NO} ${itemCode}`);
    } catch (error) {
      alert(
        getApiErrorMessage(
          error,
          `Failed to save ${UI_LOT_NO.toLowerCase()}. Please verify permissions and values.`
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Edit lot</h1>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{UI_LOT_NO}</label>
          <select
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            required
            disabled={loadingItems || saving}
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
          >
            {loadingItems ? (
              <option value="">Loading…</option>
            ) : itemOptions.length === 0 ? (
              <option value="">No lots found</option>
            ) : (
              itemOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{UI_DENIER}</label>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
            disabled={loadingItemDoc || saving || !itemCode}
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(LOT_ATTR_LABELS) as (keyof LotAttrs)[]).map((key) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium text-slate-700">{LOT_ATTR_LABELS[key]}</label>
              <input
                value={lotAttrs[key]}
                onChange={(e) => setLotAttrs((prev) => ({ ...prev, [key]: e.target.value }))}
                disabled={loadingItemDoc || saving || !itemCode}
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                autoComplete="off"
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={saving || loadingItems || loadingItemDoc || !itemCode}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {saving ? "Saving…" : "Save lot"}
        </button>
      </form>

      {successMessage ? (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{successMessage}</p>
      ) : null}
    </section>
  );
}

export default function EditItemPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-2xl font-bold text-slate-900">Edit lot</h1>
          <p className="text-sm text-slate-600">Loading…</p>
        </section>
      }
    >
      <EditItemPageInner />
    </Suspense>
  );
}
