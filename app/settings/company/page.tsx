"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type CompanyListRow = {
  name?: string;
  company_name?: string;
};

type CompanyDoc = {
  name?: string;
  company_name?: string;
  gstin?: string;
  tax_id?: string;
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

export default function CompanySettingsPage() {
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
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
    if (!selectedId) {
      setCompanyName("");
      setGstin("");
      setCompanyCountry("");
      setAddressName(null);
      setAddressLine("");
      setCity("");
      setState("");
      setPincode("");
      setCountry("");
      return;
    }
    const loadDoc = async () => {
      setLoadingDoc(true);
      try {
        const res = await api.get<{ data: CompanyDoc }>(
          `/api/resource/Company/${encodeURIComponent(selectedId)}`
        );
        const d = res.data?.data;
        setCompanyName(d?.company_name || d?.name || "");
        setGstin(d?.gstin || d?.tax_id || "");
        const cc = (d?.country || "").trim();
        setCompanyCountry(cc);

        const addrListRes = await api.get<{ data: AddressListRow[] }>("/api/resource/Address", {
          params: {
            filters: JSON.stringify([
              ["Dynamic Link", "link_doctype", "=", "Company"],
              ["Dynamic Link", "link_name", "=", selectedId]
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
    };
    loadDoc();
  }, [selectedId]);

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
      await setCompanyFieldQuiet(selectedId, "gstin", gstVal);
      await setCompanyFieldQuiet(selectedId, "tax_id", gstVal);

      const addrLine = addressLine.trim();
      const cityVal = city.trim();
      const countryVal = country.trim();
      const wantsAddress = Boolean(addrLine && cityVal && countryVal);

      let activeAddressName = addressName;

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

      const refreshed = await api.get<{ data: CompanyDoc }>(
        `/api/resource/Company/${encodeURIComponent(selectedId)}`
      );
      const rd = refreshed.data?.data;
      setCompanyName(rd?.company_name || rd?.name || "");
      setGstin(rd?.gstin || rd?.tax_id || "");
      setCompanyCountry((rd?.country || "").trim());

      if (activeAddressName) {
        const ar = await api.get<{ data: AddressDoc }>(
          `/api/resource/Address/${encodeURIComponent(activeAddressName)}`
        );
        const ad = ar.data?.data;
        if (ad) {
          setAddressLine(ad.address_line1 || "");
          setCity(ad.city || "");
          setState(ad.state || "");
          setPincode(ad.pincode || "");
          setCountry(ad.country || countryVal || "");
        }
      }

      setSuccessMessage("Company saved.");
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to save company."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Company &amp; GST</h1>
      <p className="mb-6 text-sm text-slate-600">
        Update the legal name, GSTIN, and registered address. The address is stored as an ERPNext
        Address linked to this company.
      </p>

      {loadingList ? (
        <p className="text-slate-600">Loading companies…</p>
      ) : companyIds.length === 0 ? (
        <p className="text-slate-600">No companies found in ERPNext.</p>
      ) : (
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
              disabled={loadingDoc}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">GSTIN</label>
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              disabled={loadingDoc}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
              placeholder="Optional"
            />
            <p className="mt-1 text-xs text-slate-500">
              Saved on the company and on the address below when street, city, and country are filled.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Registered address</h2>
            {!addressName && !loadingDoc && (
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
                disabled={loadingDoc}
                required={Boolean(addressName)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                placeholder="Building, street"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={loadingDoc}
                  required={Boolean(addressName)}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">State / province</label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={loadingDoc}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Postal code</label>
                <input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  disabled={loadingDoc}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  disabled={loadingDoc}
                  required={Boolean(addressName)}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
                  placeholder="Must match a Country in ERPNext"
                />
              </div>
            </div>
            {companyCountry && (
              <p className="mt-2 text-xs text-slate-500">
                Company country in ERPNext: {companyCountry}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || loadingDoc}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {successMessage && (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}
    </section>
  );
}
