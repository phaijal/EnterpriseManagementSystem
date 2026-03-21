"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type WarehouseResponse = {
  data: Array<{
    name?: string;
  }>;
};

export default function ChallanPage() {
  const [customer, setCustomer] = useState("Walk-in Customer");
  const [itemCode, setItemCode] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [warehouse, setWarehouse] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const response = await api.get<WarehouseResponse>(
          '/api/resource/Warehouse?fields=["name"]&filters=[["disabled","=",0]]&limit_page_length=500'
        );
        const names = (response.data.data ?? [])
          .map((row) => row.name || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        setWarehouseOptions(names);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");

    try {
      await api.post("/api/resource/Delivery Note", {
        customer,
        items: [
          {
            item_code: itemCode,
            qty: quantity,
            warehouse
          }
        ]
      });
      setSuccessMessage("Delivery Note created successfully.");
      setItemCode("");
      setQuantity(1);
    } catch (error) {
      alert(
        getApiErrorMessage(
          error,
          "Failed to create challan. Please verify input values."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Create Challan
      </h1>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Customer
          </label>
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>
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
            Quantity
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Warehouse
          </label>
          <input
            list="warehouse-options-challan"
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder={
              loadingWarehouses ? "Loading warehouses..." : "Start typing warehouse"
            }
            disabled={loadingWarehouses}
          />
          <datalist id="warehouse-options-challan">
            {warehouseOptions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>

        <button
          type="submit"
          disabled={loading || loadingWarehouses || !warehouse}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {loading ? "Creating..." : "Create Delivery Note"}
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
