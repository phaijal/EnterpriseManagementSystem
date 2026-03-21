"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type ItemRow = {
  item_code?: string;
  name?: string;
};

type ItemResponse = {
  data: ItemRow[];
};

type WarehouseResponse = {
  data: Array<{
    name?: string;
  }>;
};

type StockEntryListResponse = {
  data: Array<{
    remarks?: string;
  }>;
};

function extractBoxNumber(remarks?: string) {
  if (!remarks) return 0;
  const match = remarks.match(/BOX:(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export default function AddStockPage() {
  const [itemCode, setItemCode] = useState("");
  const [cops, setCops] = useState<number>(1);
  const [tareWeight, setTareWeight] = useState<number>(0);
  const [grossWeight, setGrossWeight] = useState<number>(0);
  const [boxNumber, setBoxNumber] = useState<number>(1);
  const [warehouse, setWarehouse] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const netWeight = Math.max(0, grossWeight - tareWeight);

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
            "Failed to fetch stock items for dropdown."
          )
        );
      } finally {
        setLoadingItems(false);
      }
    };

    fetchStockItems();
  }, []);

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const response = await api.get<WarehouseResponse>(
          '/api/resource/Warehouse?fields=["name"]&filters=[["disabled","=",0],["is_group","=",0]]&limit_page_length=500'
        );
        const names = (response.data.data ?? [])
          .map((row) => row.name || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        if (names.length > 0) {
          setWarehouse(names[0]);
        }
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to fetch warehouse list."));
      } finally {
        setLoadingWarehouses(false);
      }
    };

    fetchWarehouses();
  }, []);

  useEffect(() => {
    const fetchNextBoxNumber = async () => {
      try {
        const response = await api.get<StockEntryListResponse>(
          '/api/resource/Stock Entry?fields=["remarks"]&filters=[["stock_entry_type","=","Material Receipt"]]&order_by=creation desc&limit_page_length=200'
        );
        const maxBox = (response.data.data ?? []).reduce((max, row) => {
          return Math.max(max, extractBoxNumber(row.remarks));
        }, 0);
        setBoxNumber(maxBox + 1);
      } catch {
        // Keep default box number if lookup fails.
      }
    };

    fetchNextBoxNumber();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");

    try {
      const remarks = `BOX:${boxNumber};COPS:${cops};TARE:${tareWeight};GROSS:${grossWeight};NET:${netWeight}`;
      const createResponse = await api.post("/api/resource/Stock Entry", {
        stock_entry_type: "Material Receipt",
        remarks,
        items: [
          {
            item_code: itemCode,
            // Keep ERP qty aligned to net weight.
            qty: netWeight,
            t_warehouse: warehouse,
            allow_zero_valuation_rate: 1,
            basic_rate: 0
          }
        ]
      });
      const createdDoc = createResponse.data?.data;
      const stockEntryName = createdDoc?.name;

      if (stockEntryName) {
        // Draft Stock Entry does not update Bin until submitted.
        await api.post("/api/method/frappe.client.submit", {
          doc: JSON.stringify(createdDoc)
        });
      }

      setSuccessMessage(`Stock entry created successfully for Box ${boxNumber}.`);
      setItemCode("");
      setCops(1);
      setTareWeight(0);
      setGrossWeight(0);
      setBoxNumber((prev) => prev + 1);
    } catch (error) {
      alert(
        getApiErrorMessage(
          error,
          "Failed to add stock. Please verify item and warehouse."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Add Stock</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Box Number: <span className="font-semibold">{boxNumber}</span>
        </div>
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Using warehouse:{" "}
          <span className="font-semibold">
            {loadingWarehouses ? "Loading..." : warehouse || "Not found"}
          </span>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Item Code
          </label>
          <select
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            disabled={loadingItems}
          >
            {loadingItems ? (
              <option value="">Loading stock items...</option>
            ) : itemOptions.length > 0 ? (
              itemOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))
            ) : (
              <option value="">No stock items found. Create a new item.</option>
            )}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Cops
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={cops}
            onChange={(e) => setCops(Number(e.target.value))}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tare Weight
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={tareWeight}
            onChange={(e) => setTareWeight(Number(e.target.value))}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Gross Weight
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={grossWeight}
            onChange={(e) => setGrossWeight(Number(e.target.value))}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Net Weight (Gross - Tare):{" "}
          <span className="font-semibold">{netWeight.toFixed(2)}</span>
        </div>
        <button
          type="submit"
          disabled={
            loading ||
            loadingItems ||
            loadingWarehouses ||
            itemOptions.length === 0 ||
            !warehouse ||
            netWeight <= 0
          }
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {loading ? "Adding..." : "Submit Material Receipt"}
        </button>
      </form>

      <div className="mt-4">
        <Link
          href="/add-item"
          className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
        >
          No item in list? Create a new stock item
        </Link>
      </div>

      {successMessage && (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}
    </section>
  );
}
