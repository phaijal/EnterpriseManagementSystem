"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import { encodeChallanPayload } from "@/lib/challanPayload";
import { WEIGHT_UNIT_LABEL } from "@/lib/units";
import { fetchSubmittedChallanLockMap } from "@/lib/challanLocks";

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

type ItemNameResponse = {
  data: Array<{
    name?: string;
    item_name?: string;
  }>;
};

type BoxOption = {
  stock_entry: string;
  item_code: string;
  item_name: string;
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
  const [customer, setCustomer] = useState("");
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [itemCode, setItemCode] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyGstin, setCompanyGstin] = useState("");
  const [boxOptions, setBoxOptions] = useState<BoxOption[]>([]);
  const [challanLockByStockEntry, setChallanLockByStockEntry] = useState<Record<string, string>>({});
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
          '/api/resource/Warehouse?fields=["name"]&filters=[["disabled","=",0],["is_group","=",0]]&limit_page_length=500'
        );
        const names = (response.data.data ?? [])
          .map((row) => row.name || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        setWarehouseOptions(names);
        if (names.length > 0) {
          setWarehouse(names[0]);
        } else {
          setWarehouse("");
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
    if (loadingCustomers || customerOptions.length === 0) return;
    if (customer && customerOptions.includes(customer)) return;
    const prefer = customerOptions.includes("Walk-in Customer")
      ? "Walk-in Customer"
      : customerOptions[0];
    setCustomer(prefer ?? "");
  }, [loadingCustomers, customerOptions, customer]);

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
      const lockPromise = fetchSubmittedChallanLockMap(api);
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

        const itemCodes = Array.from(
          new Set(
            details
              .map((d) => d.data.data?.items?.[0]?.item_code || "")
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

        const mapped: BoxOption[] = entries
          .map((entry, index) => {
            const firstItem = details[index].data.data?.items?.[0];
            if (!firstItem?.item_code) return null;
            const itemWh = firstItem.t_warehouse || firstItem.s_warehouse || "";
            const parsed = parseRemarks(entry.remarks);
            const boxNo = firstItem.custom_box_no;
            const cops = Number(firstItem.custom_cops ?? parsed.cops ?? 0);
            const tare = Number(firstItem.custom_tare_weight ?? parsed.tare ?? 0);
            const gross = Number(firstItem.custom_gross_weight ?? parsed.gross ?? 0);
            const net = Number(firstItem.custom_net_weight ?? parsed.net ?? firstItem.qty ?? 0);
            const ic = firstItem.item_code;
            return {
              stock_entry: entry.name,
              item_code: ic,
              item_name: itemNameMap[ic] || ic,
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
        try {
          const lockMap = await lockPromise;
          setChallanLockByStockEntry(Object.fromEntries(lockMap));
        } catch {
          setChallanLockByStockEntry({});
        }
        setLoadingBoxes(false);
      }
    };
    fetchBoxes();
  }, []);

  useEffect(() => {
    setSelectedBoxIds((prev) =>
      prev.filter((id) => {
        const box = boxOptions.find((b) => b.stock_entry === id);
        return box && box.warehouse === warehouse;
      })
    );
  }, [warehouse, boxOptions]);

  useEffect(() => {
    setSelectedBoxIds((prev) => prev.filter((id) => !challanLockByStockEntry[id]));
  }, [challanLockByStockEntry]);

  const filteredBoxes = useMemo(() => {
    if (!warehouse) return [];
    return boxOptions.filter((box) => {
      if (challanLockByStockEntry[box.stock_entry]) return false;
      if (box.warehouse !== warehouse) return false;
      return itemCode ? box.item_code === itemCode : true;
    });
  }, [boxOptions, itemCode, warehouse, challanLockByStockEntry]);

  const selectedBoxes = useMemo(() => {
    return boxOptions.filter((box) => selectedBoxIds.includes(box.stock_entry));
  }, [boxOptions, selectedBoxIds]);

  const totalNetWeight = useMemo(() => {
    return selectedBoxes.reduce((sum, box) => sum + box.net, 0);
  }, [selectedBoxes]);

  const itemOptions = useMemo(() => {
    const codes = boxOptions
      .filter((box) => box.warehouse === warehouse)
      .map((box) => box.item_code);
    return Array.from(new Set(codes)).sort((a, b) => a.localeCompare(b));
  }, [boxOptions, warehouse]);

  useEffect(() => {
    if (!itemCode) return;
    if (!itemOptions.includes(itemCode)) setItemCode("");
  }, [itemOptions, itemCode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");

    try {
      const itemRows = selectedBoxes.map((box) => ({
        item_code: box.item_code,
        qty: box.net,
        warehouse,
        allow_zero_valuation_rate: 1,
        description: `${box.box_label} — ${box.item_name} (${box.item_code}) — COPS:${box.cops} TARE:${box.tare} GROSS:${box.gross} NET:${box.net} STOCK_ENTRY:${box.stock_entry}`
      }));

      const humanRemarks = `BOXES:${selectedBoxes.map((box) => box.box_label).join(", ")};TOTAL_NET:${totalNetWeight}`;
      const challanPayload = encodeChallanPayload({
        warehouse,
        boxes: selectedBoxes.map((box) => ({
          box_label: box.box_label,
          item_code: box.item_code,
          item_name: box.item_name,
          cops: box.cops,
          tare: box.tare,
          gross: box.gross,
          net: box.net,
          stock_entry: box.stock_entry
        }))
      });

      const createResponse = await api.post("/api/resource/Delivery Note", {
        customer,
        items: itemRows,
        remarks: `${humanRemarks};${challanPayload}`
      });
      const createdDoc = createResponse.data?.data;
      const dnName = createdDoc?.name as string | undefined;
      if (!dnName) {
        throw new Error("Server did not return a delivery note name.");
      }
      try {
        await api.post("/api/method/frappe.client.submit", {
          doc: JSON.stringify(createdDoc)
        });
      } catch (submitError) {
        try {
          await api.delete(`/api/resource/Delivery Note/${encodeURIComponent(dnName)}`);
        } catch {
          /* draft may need manual cleanup in ERPNext */
        }
        throw submitError;
      }
      setSuccessMessage("Delivery Note created and submitted.");
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
    <div className="mx-auto w-full max-w-6xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Create Challan</h1>
        <Link
          href="/challan/list"
          className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
        >
          View all challans →
        </Link>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 space-y-6 border-slate-200 lg:w-72 lg:border-r lg:pr-6">
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer
              </h2>
              <label className="mb-1 block text-sm font-medium text-slate-700">Customer</label>
              <select
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                required
                disabled={loadingCustomers || customerOptions.length === 0}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
              >
                {loadingCustomers ? (
                  <option value="">Loading customers…</option>
                ) : customerOptions.length === 0 ? (
                  <option value="">No customers found</option>
                ) : (
                  customerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
              <Link href="/add-customer" className="mt-2 inline-block text-xs text-slate-600 underline">
                Add new customer
              </Link>
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Warehouse & filters
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Warehouse</label>
                  <select
                    value={warehouse}
                    onChange={(e) => setWarehouse(e.target.value)}
                    required
                    disabled={loadingWarehouses || warehouseOptions.length === 0}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                  >
                    {loadingWarehouses ? (
                      <option value="">Loading warehouses…</option>
                    ) : warehouseOptions.length === 0 ? (
                      <option value="">No leaf warehouses found</option>
                    ) : (
                      warehouseOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Same default as Add Stock / Boxes (leaf warehouses only).
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Item filter</label>
                  <select
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    disabled={!warehouse || loadingBoxes}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                  >
                    <option value="">All items</option>
                    {itemOptions.map((code) => {
                      const sample = boxOptions.find(
                        (b) => b.warehouse === warehouse && b.item_code === code
                      );
                      const label = sample ? `${code} — ${sample.item_name}` : code;
                      return (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Company
              </h2>
              <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">
                <p>
                  <span className="font-semibold">Company:</span> {companyName || "—"}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">GST:</span> {companyGstin || "—"}
                </p>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Selection summary
              </h2>
              <div className="max-h-40 overflow-y-auto rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">
                {selectedBoxes.length > 0 ? (
                  <ul className="space-y-1">
                    {selectedBoxes.map((box) => (
                      <li key={box.stock_entry}>
                        {box.box_label} · {box.item_name} ({box.item_code}) · C {box.cops} · T {box.tare}{" "}
                        {WEIGHT_UNIT_LABEL} · G {box.gross} {WEIGHT_UNIT_LABEL} · N {box.net}{" "}
                        {WEIGHT_UNIT_LABEL}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">No boxes selected.</p>
                )}
              </div>
              <p className="mt-2 text-sm font-bold text-slate-900">
                Total net ({WEIGHT_UNIT_LABEL}): {totalNetWeight.toFixed(2)}
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Action
              </h2>
              <button
                type="submit"
                disabled={
                  loading ||
                  loadingWarehouses ||
                  loadingBoxes ||
                  loadingCustomers ||
                  !warehouse ||
                  !customer ||
                  selectedBoxes.length === 0
                }
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
              >
                {loading ? "Submitting…" : "Create & submit challan"}
              </button>
              {successMessage && (
                <p className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-xs text-emerald-800">
                  {successMessage}
                </p>
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Select boxes</h2>
            <div className="rounded-lg border p-4">
              {loadingBoxes ? (
                <p className="text-sm text-slate-500">Loading boxes…</p>
              ) : !warehouse ? (
                <p className="text-sm text-slate-500">Choose a warehouse to list boxes.</p>
              ) : (
                <p className="mb-3 text-xs text-slate-500">
                  Boxes already on a submitted challan are hidden here. Cancel the challan under All
                  Challans to return stock and show them again.
                </p>
              )}
              {loadingBoxes || !warehouse ? null : filteredBoxes.length > 0 ? (
                <div className="max-h-[min(28rem,60vh)] space-y-2 overflow-y-auto pr-1">
                  {filteredBoxes.map((box) => {
                    const checked = selectedBoxIds.includes(box.stock_entry);
                    return (
                      <label
                        key={box.stock_entry}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
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
                          {box.box_label} — {box.item_name} ({box.item_code}) — C {box.cops} · T {box.tare}{" "}
                          {WEIGHT_UNIT_LABEL} · G {box.gross} {WEIGHT_UNIT_LABEL} · N {box.net}{" "}
                          {WEIGHT_UNIT_LABEL}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No boxes for this warehouse / filter.</p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
