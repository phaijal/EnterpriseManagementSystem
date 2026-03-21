"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type UomResponse = {
  data: Array<{
    name?: string;
    uom_name?: string;
  }>;
};

type ItemGroupResponse = {
  data: Array<{
    name?: string;
  }>;
};

export default function AddItemPage() {
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [stockUom, setStockUom] = useState("Nos");
  const [itemGroup, setItemGroup] = useState("");
  const [uomOptions, setUomOptions] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const fetchFormMeta = async () => {
      try {
        const [uomRes, itemGroupRes] = await Promise.all([
          api.get<UomResponse>(
            '/api/resource/UOM?fields=["name","uom_name"]&limit_page_length=500'
          ),
          api.get<ItemGroupResponse>(
            '/api/resource/Item Group?fields=["name"]&filters=[["is_group","=",0]]&limit_page_length=200'
          )
        ]);

        const uoms = Array.from(
          new Set(
            (uomRes.data.data ?? [])
              .map((row) => row.uom_name || row.name || "")
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));

        setUomOptions(uoms);
        if (!uoms.includes(stockUom) && uoms.length > 0) {
          setStockUom(uoms[0]);
        }

        const groups = (itemGroupRes.data.data ?? [])
          .map((row) => row.name || "")
          .filter(Boolean);
        if (groups.length > 0) {
          setItemGroup(groups[0]);
        }
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
      const response = await api.post("/api/resource/Item", {
        item_code: itemCode,
        item_name: itemName,
        is_stock_item: 1,
        item_group: itemGroup,
        stock_uom: stockUom
      });

      const createdName = response.data?.data?.name ?? itemCode;
      setSuccessMessage(`Item created successfully: ${createdName}`);
      setItemCode("");
      setItemName("");
    } catch (error) {
      alert(
        getApiErrorMessage(
          error,
          "Failed to create item. Please verify UOM."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Create Stock Item
      </h1>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Item Code
          </label>
          <input
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder="ITEM-001"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Item Name
          </label>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder="Sample Item"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Stock UOM
          </label>
          <input
            list="uom-options"
            value={stockUom}
            onChange={(e) => setStockUom(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder={loadingMeta ? "Loading UOMs..." : "Start typing UOM"}
            disabled={loadingMeta}
          />
          <datalist id="uom-options">
            {uomOptions.map((uom) => (
              <option key={uom} value={uom} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-slate-500">
            Start typing to see matching UOM options.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || loadingMeta || !itemGroup}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {loading ? "Creating..." : "Create Item"}
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
