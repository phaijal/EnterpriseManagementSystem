"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import { fetchCompanyMerged, resolveCompanyPan } from "@/lib/companyDoc";
import { ensureAddressTemplatesForCountry } from "@/lib/erpnextAddressTemplate";

type CompanyListRow = {
  name?: string;
  company_name?: string;
};

type CompanyDoc = {
  name?: string;
  company_name?: string;
  gstin?: string;
  tax_id?: string;
  pan?: string;
  abbr?: string;
  country?: string;
};

type AddressListRow = {
  name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  is_primary_address?: 0 | 1;
  modified?: string;
};

type AddressDoc = {
  name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  gstin?: string;
  tax_id?: string;
};

async function setCompanyFieldQuiet(companyName: string, fieldname: string, value: string) {
  try {
    await api.post("/api/method/frappe.client.set_value", {
      doctype: "Company",
      name: companyName,
      fieldname,
      value
    });
  } catch {
    /* Field may not exist on this site. */
  }
}

async function setAddressFieldQuiet(addressName: string, fieldname: string, value: string) {
  try {
    await api.post("/api/method/frappe.client.set_value", {
      doctype: "Address",
      name: addressName,
      fieldname,
      value
    });
  } catch {
    /* Field may not exist (e.g. tax_id vs gstin by region). */
  }
}

function pickPrimaryCompanyAddress(rows: AddressListRow[]): AddressListRow | null {
  if (!rows.length) return null;
  const primary = rows.find((r) => r.is_primary_address === 1);
  return primary ?? rows[0];
}

function ViewRow({ label, value }: { label: string; value: string }) {
  const display = value.trim() ? value : "—";
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{display}</p>
    </div>
  );
}

export default function CompanySettingsPage() {
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [companyCountry, setCompanyCountry] = useState("");
  const [addressName, setAddressName] = useState<string | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editing, setEditing] = useState(false);

  const loadCompanyDoc = useCallback(async (id: string) => {
    if (!id) {
      setCompanyName("");
      setGstin("");
      setPan("");
      setCompanyCountry("");
      setAddressName(null);
      setAddressLine("");
      setCity("");
      setState("");
      setPincode("");
      setCountry("");
      return;
    }
    setLoadingDoc(true);
    try {
      const merged = await fetchCompanyMerged(id);
      setCompanyName(
        (typeof merged.company_name === "string" && merged.company_name) ||
          (typeof merged.name === "string" && merged.name) ||
          ""
      );
      const gst =
        (typeof merged.gstin === "string" && merged.gstin) ||
        (typeof merged.tax_id === "string" && merged.tax_id) ||
        "";
      setGstin(gst);
      setPan(await resolveCompanyPan(id, merged));
      const cc = (typeof merged.country === "string" ? merged.country : "").trim();
      setCompanyCountry(cc);

      const addrListRes = await api.get<{ data: AddressListRow[] }>("/api/resource/Address", {
        params: {
          filters: JSON.stringify([
            ["Dynamic Link", "link_doctype", "=", "Company"],
            ["Dynamic Link", "link_name", "=", id]
          ]),
          fields: JSON.stringify([
            "name",
            "address_line1",
            "city",
            "state",
            "country",
            "pincode",
            "is_primary_address",
            "modified"
          ]),
          limit_page_length: 50,
          order_by: "modified desc"
        }
      });
      const rows = addrListRes.data?.data ?? [];
      const picked = pickPrimaryCompanyAddress(rows);

      if (picked?.name) {
        setAddressName(picked.name);
        const addrRes = await api.get<{ data: AddressDoc }>(
          `/api/resource/Address/${encodeURIComponent(picked.name)}`
        );
        const a = addrRes.data?.data;
        setAddressLine(a?.address_line1 || "");
        setCity(a?.city || "");
        setState(a?.state || "");
        setPincode(a?.pincode || "");
        setCountry((a?.country || cc || "India").trim());
      } else {
        setAddressName(null);
        setAddressLine("");
        setCity("");
        setState("");
        setPincode("");
        setCountry(cc || "India");
      }
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to load company."));
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<{ data: CompanyListRow[] }>("/api/resource/Company", {
          params: {
            fields: JSON.stringify(["name", "company_name"]),
            limit_page_length: 50
          }
        });
        const ids = (res.data.data ?? [])
          .map((r) => r.name || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        setCompanyIds(ids);
        if (ids.length > 0) setSelectedId(ids[0]);
      } catch (error) {
        alert(getApiErrorMessage(error, "Failed to load companies."));
      } finally {
        setLoadingList(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    setEditing(false);
    setSuccessMessage("");
    void loadCompanyDoc(selectedId);
  }, [selectedId, loadCompanyDoc]);

  const cancelEdit = () => {
    setEditing(false);
    setSuccessMessage("");
    void loadCompanyDoc(selectedId);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setSuccessMessage("");
    try {
      const res = await api.get<{ data: CompanyDoc }>(
        `/api/resource/Company/${encodeURIComponent(selectedId)}`
      );
      const existing = res.data?.data;
      if (!existing?.name) throw new Error("Missing company document.");

      await api.post("/api/method/frappe.client.set_value", {
        doctype: "Company",
        name: selectedId,
        fieldname: "company_name",
        value: companyName.trim()
      });

      const gstVal = gstin.trim();
      const panVal = pan.trim();
      await setCompanyFieldQuiet(selectedId, "gstin", gstVal);
      await setCompanyFieldQuiet(selectedId, "tax_id", gstVal);
      await setCompanyFieldQuiet(selectedId, "pan", panVal);
      await setCompanyFieldQuiet(selectedId, "pan_no", panVal);
      await setCompanyFieldQuiet(selectedId, "company_pan", panVal);
      await setCompanyFieldQuiet(selectedId, "custom_pan", panVal);

      const addrLine = addressLine.trim();
      const cityVal = city.trim();
      const countryVal = country.trim();
      const wantsAddress = Boolean(addrLine && cityVal && countryVal);

      let activeAddressName = addressName;

      if (wantsAddress) {
        await ensureAddressTemplatesForCountry(countryVal);
      }

      if (wantsAddress && !activeAddressName) {
        const insertRes = await api.post<{ data: AddressDoc }>("/api/resource/Address", {
          address_title: `${companyName.trim() || selectedId} — Billing`,
          address_type: "Billing",
          address_line1: addrLine,
          city: cityVal,
          state: state.trim() || undefined,
          country: countryVal,
          pincode: pincode.trim() || undefined,
          gstin: gstVal || undefined,
          is_primary_address: 1,
          links: [{ link_doctype: "Company", link_name: selectedId }]
        });
        const newName = insertRes.data?.data?.name;
        if (!newName) throw new Error("Address was not created (missing name in response).");
        activeAddressName = newName;
        setAddressName(newName);
      }

      if (activeAddressName && wantsAddress) {
        const fieldPairs: Array<[string, string]> = [
          ["address_line1", addrLine],
          ["city", cityVal],
          ["state", state.trim()],
          ["country", countryVal],
          ["pincode", pincode.trim()]
        ];
        for (const [fieldname, value] of fieldPairs) {
          await api.post("/api/method/frappe.client.set_value", {
            doctype: "Address",
            name: activeAddressName,
            fieldname,
            value
          });
        }
        await setAddressFieldQuiet(activeAddressName, "gstin", gstVal);
        await setAddressFieldQuiet(activeAddressName, "tax_id", gstVal);
      }

      await loadCompanyDoc(selectedId);
      setSuccessMessage("Company saved.");
      setEditing(false);
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to save company."));
    } finally {
      setSaving(false);
    }
  };

  const addressSummary = [addressLine, [city, state].filter(Boolean).join(", "), pincode, country]
    .filter((p) => p.trim())
    .join("\n");

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Company &amp; GST</h1>
          <p className="mt-2 text-sm text-slate-600">
            {editing ?
              "Edit legal name, GSTIN, PAN, and registered address."
            : "View company details. Click Edit to make changes."}
          </p>
        </div>
        {!loadingList && companyIds.length > 0 && !loadingDoc ?
          editing ?
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          : <button
              type="button"
              onClick={() => {
                setSuccessMessage("");
                setEditing(true);
              }}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Edit
            </button>

        : null}
      </div>

      {loadingList ? (
        <p className="text-slate-600">Loading companies…</p>
      ) : companyIds.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600">
          <p className="mb-3">No companies found in ERPNext.</p>
          <Link
            href="/settings/company/add"
            className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Add company
          </Link>
        </div>
      ) : loadingDoc ?
        <p className="text-slate-600">Loading company…</p>
      : editing ?
        <form className="space-y-4" onSubmit={handleSubmit}>
          {companyIds.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Company</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
              >
                {companyIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Company name</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">GSTIN</label>
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              placeholder="Optional"
            />
            <p className="mt-1 text-xs text-slate-500">
              Saved on the company and on the address below when street, city, and country are filled.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">PAN</label>
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              placeholder="Optional"
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Registered address</h2>
            {!addressName && (
              <p className="mb-3 text-xs text-slate-600">
                No address linked yet. Fill the fields below and save to create a billing address for
                this company.
              </p>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Street / line 1</label>
              <textarea
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                required={Boolean(addressName)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
                placeholder="Building, street"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required={Boolean(addressName)}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">State / province</label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
                />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Postal code</label>
                <input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  required={Boolean(addressName)}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
                  placeholder="Must match a Country in ERPNext"
                />
              </div>
            </div>
            {companyCountry ?
              <p className="mt-2 text-xs text-slate-500">
                Company country in ERPNext: {companyCountry}
              </p>
            : null}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      : <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          {companyIds.length > 1 && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Company
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
              >
                {companyIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <ViewRow label="Company name" value={companyName} />
          <ViewRow label="GSTIN" value={gstin} />
          <ViewRow label="PAN" value={pan} />
          <div className="border-b border-slate-100 py-3 last:border-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Registered address
            </p>
            <p className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">
              {addressSummary.trim() ? addressSummary : "—"}
            </p>
          </div>
          {companyCountry ?
            <p className="mt-2 text-xs text-slate-500">Company country (ERPNext): {companyCountry}</p>
          : null}
        </div>
      }

      {successMessage && (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}
    </section>
  );
}
