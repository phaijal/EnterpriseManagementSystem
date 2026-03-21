"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type WarehouseResponse = {
  data: Array<{
    name?: string;
  }>;
};

type CustomerResponse = {
  data: Array<{
    name?: string;
  }>;
};

type CompanyResponse = {
  data: Array<{
    name?: string;
  }>;
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
      qty?: number;
      t_warehouse?: string;
      s_warehouse?: string;
      custom_box_no?: number;
      custom_cops?: number;
      custom_tare_weight?: number;
      custom_gross_weight?: number;
      custom_net_weight?: number;
    }>;
  };
};

type BoxOption = {
  stock_entry: string;
  item_code: string;
  box_label: string;
  cops: number;
  tare: number;
  gross: number;
  net: number;
  warehouse: string;
};

const CUSTOM_FIELDS = {
  box: "custom_box_no",
  cops: "custom_cops",
  tare: "custom_tare_weight",
  gross: "custom_gross_weight",
  net: "custom_net_weight"
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
    cops: get("COPS") ?? 0,
    tare: get("TARE") ?? 0,
    gross: get("GROSS") ?? 0,
    net: get("NET") ?? 0
  };
}

export default function ChallanPage() {
  const [customer, setCustomer] = useState("Walk-in Customer");
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [itemCode, setItemCode] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyGstin, setCompanyGstin] = useState("");
  const [boxOptions, setBoxOptions] = useState<BoxOption[]>([]);
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(true);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
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

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await api.get<CustomerResponse>(
          '/api/resource/Customer?fields=["name"]&limit_page_length=500'
        );
        const names = (response.data.data ?? [])
          .map((row) => row.name || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        setCustomerOptions(names);
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to fetch customer list."));
      } finally {
        setLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    const fetchCompanyDetails = async () => {
      try {
        const response = await api.get<CompanyResponse>(
          '/api/resource/Company?fields=["name"]&limit_page_length=1'
        );
        const company = response.data.data?.[0];
        const companyNameValue = company?.name || "";
        setCompanyName(companyNameValue);
        if (companyNameValue) {
          const companyDoc = await api.get(`/api/resource/Company/${encodeURIComponent(companyNameValue)}`);
          setCompanyGstin(companyDoc.data?.data?.gstin || "");
        } else {
          setCompanyGstin("");
        }
      } catch {
        setCompanyName("");
        setCompanyGstin("");
      }
    };
    fetchCompanyDetails();
  }, []);

  useEffect(() => {
    const fetchBoxes = async () => {
      setLoadingBoxes(true);
      try {
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
        const details = await Promise.all(
          entries.map((entry) =>
            api.get<StockEntryDetailResponse>(`/api/resource/Stock Entry/${entry.name}`)
          )
        );

        const mapped: BoxOption[] = entries
          .map((entry, index) => {
            const firstItem = details[index].data.data?.items?.[0];
            if (!firstItem?.item_code) return null;
            const itemWh = firstItem.t_warehouse || firstItem.s_warehouse || "";
            const parsed = parseRemarks(entry.remarks);
            const boxNo = firstItem.custom_box_no;
            const cops = firstItem.custom_cops ?? parsed.cops;
            const tare = firstItem.custom_tare_weight ?? parsed.tare;
            const gross = firstItem.custom_gross_weight ?? parsed.gross;
            const net = firstItem.custom_net_weight ?? parsed.net ?? firstItem.qty ?? 0;
            return {
              stock_entry: entry.name,
              item_code: firstItem.item_code,
              box_label: boxNo ? `Box ${boxNo}` : parsed.box,
              cops,
              tare,
              gross,
              net,
              warehouse: itemWh
            };
          })
          .filter((row): row is BoxOption => Boolean(row));
        setBoxOptions(mapped);
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to fetch boxes for challan."));
      } finally {
        setLoadingBoxes(false);
      }
    };
    fetchBoxes();
  }, []);

  const filteredBoxes = useMemo(() => {
    return boxOptions.filter((box) => {
      const itemMatch = itemCode ? box.item_code === itemCode : true;
      const whMatch = warehouse ? box.warehouse === warehouse : true;
      return itemMatch && whMatch;
    });
  }, [boxOptions, itemCode, warehouse]);

  const selectedBoxes = useMemo(() => {
    return boxOptions.filter((box) => selectedBoxIds.includes(box.stock_entry));
  }, [boxOptions, selectedBoxIds]);

  const totalNetWeight = useMemo(() => {
    return selectedBoxes.reduce((sum, box) => sum + box.net, 0);
  }, [selectedBoxes]);

  const itemOptions = useMemo(() => {
    return Array.from(new Set(boxOptions.map((box) => box.item_code))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [boxOptions]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");

    try {
      const itemRows = selectedBoxes.map((box) => ({
        item_code: box.item_code,
        qty: box.net,
        warehouse
      }));

      await api.post("/api/resource/Delivery Note", {
        customer,
        items: itemRows,
        remarks: `BOXES:${selectedBoxes.map((box) => box.box_label).join(", ")};TOTAL_NET:${totalNetWeight}`
      });
      setSuccessMessage("Delivery Note created successfully.");
      setSelectedBoxIds([]);
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
            list="customer-options"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder={loadingCustomers ? "Loading customers..." : "Select customer"}
          />
          <datalist id="customer-options">
            {customerOptions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <Link href="/add-customer" className="mt-1 inline-block text-xs underline">
            Add new customer
          </Link>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Item Filter
          </label>
          <input
            list="item-options-challan"
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder="Filter boxes by item code"
          />
          <datalist id="item-options-challan">
            {itemOptions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
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

        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">Select Boxes</p>
          {loadingBoxes ? (
            <p className="text-sm text-slate-500">Loading boxes...</p>
          ) : filteredBoxes.length > 0 ? (
            <div className="space-y-2">
              {filteredBoxes.map((box) => {
                const checked = selectedBoxIds.includes(box.stock_entry);
                return (
                  <label key={box.stock_entry} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBoxIds((prev) => [...prev, box.stock_entry]);
                        } else {
                          setSelectedBoxIds((prev) =>
                            prev.filter((id) => id !== box.stock_entry)
                          );
                        }
                      }}
                    />
                    <span>
                      {box.box_label} - {box.item_code} - Net {box.net}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No boxes match current filters.</p>
          )}
        </div>

        <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold">Company:</span> {companyName || "-"}
          </p>
          <p>
            <span className="font-semibold">Company GST:</span> {companyGstin || "-"}
          </p>
          <p className="mt-2 font-semibold">Selected Boxes:</p>
          {selectedBoxes.length > 0 ? (
            <ul className="ml-5 list-disc">
              {selectedBoxes.map((box) => (
                <li key={box.stock_entry}>
                  {box.box_label} - {box.item_code} - Net {box.net}
                </li>
              ))}
            </ul>
          ) : (
            <p>-</p>
          )}
          <p className="mt-2 text-base font-bold">Total Net Weight: {totalNetWeight.toFixed(2)}</p>
        </div>

        <button
          type="submit"
          disabled={
            loading ||
            loadingWarehouses ||
            loadingBoxes ||
            !warehouse ||
            selectedBoxes.length === 0
          }
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
