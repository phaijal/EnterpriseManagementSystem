"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getApiErrorMessage } from "@/lib/api";
import { ensureAddressTemplatesForCountry } from "@/lib/erpnextAddressTemplate";
import { ensureWarehouseTypesForCompanyCreate } from "@/lib/finishedGoodsWarehouse";

type AddressDoc = { name?: string };

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
    /* tax_id vs gstin by region */
  }
}

function suggestAbbr(companyName: string): string {
  const letters = companyName
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").charAt(0))
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return (letters || "CO").slice(0, 5);
}

function pickDefaultCountry(names: string[]): string {
  const india = names.find((n) => n === "India");
  if (india) return india;
  return names[0] ?? "";
}

function pickDefaultCurrency(names: string[]): string {
  const inr = names.find((n) => n === "INR");
  if (inr) return inr;
  return names[0] ?? "";
}

export default function AddCompanyPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [countryNames, setCountryNames] = useState<string[]>([]);
  const [currencyNames, setCurrencyNames] = useState<string[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [countryCo, setCountryCo] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [countryAddr, setCountryAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [mastersError, setMastersError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoadingMasters(true);
      setMastersError("");
      try {
        const [cRes, curEnabledRes] = await Promise.all([
          api.get<{ data?: Array<{ name?: string }> }>("/api/resource/Country", {
            params: {
              fields: JSON.stringify(["name"]),
              limit_page_length: 1000,
              order_by: "name asc"
            }
          }),
          api.get<{ data?: Array<{ name?: string }> }>("/api/resource/Currency", {
            params: {
              fields: JSON.stringify(["name"]),
              filters: JSON.stringify([["enabled", "=", 1]]),
              limit_page_length: 500,
              order_by: "name asc"
            }
          })
        ]);

        const countries = (cRes.data?.data ?? [])
          .map((r) => (r.name ?? "").trim())
          .filter(Boolean);

        let currencies = (curEnabledRes.data?.data ?? [])
          .map((r) => (r.name ?? "").trim())
          .filter(Boolean);

        if (currencies.length === 0) {
          const curAll = await api.get<{ data?: Array<{ name?: string }> }>("/api/resource/Currency", {
            params: {
              fields: JSON.stringify(["name"]),
              limit_page_length: 500,
              order_by: "name asc"
            }
          });
          currencies = (curAll.data?.data ?? [])
            .map((r) => (r.name ?? "").trim())
            .filter(Boolean);
        }

        setCountryNames(countries);
        setCurrencyNames(currencies);

        const co = pickDefaultCountry(countries);
        const cur = pickDefaultCurrency(currencies);
        setCountryCo(co);
        setCountryAddr(co);
        setDefaultCurrency(cur);

        if (countries.length === 0 || currencies.length === 0) {
          setMastersError(
            countries.length === 0
              ? "No countries found in ERPNext. Open Desk → Country and ensure records exist, or complete setup wizard."
              : "No currencies found in ERPNext. Open Desk → Currency and enable at least one (e.g. INR)."
          );
        }
      } catch (error) {
        setMastersError(getApiErrorMessage(error, "Could not load Country / Currency from ERPNext."));
      } finally {
        setLoadingMasters(false);
      }
    };
    load();
  }, []);

  const mastersReady = countryNames.length > 0 && currencyNames.length > 0 && !mastersError;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nameTrim = companyName.trim();
    if (!nameTrim || !mastersReady) return;

    setLoading(true);
    try {
      const abbrVal = (abbr.trim() || suggestAbbr(nameTrim)).toUpperCase().slice(0, 10);
      const currency = defaultCurrency.trim();
      const coCountry = countryCo.trim();

      if (!currency || !coCountry) {
        alert("Please select country and currency.");
        setLoading(false);
        return;
      }

      await ensureWarehouseTypesForCompanyCreate();

      const companyRes = await api.post<{ data: { name?: string } }>("/api/resource/Company", {
        company_name: nameTrim,
        abbr: abbrVal,
        default_currency: currency,
        country: coCountry
      });

      const companyId = companyRes.data?.data?.name ?? nameTrim;
      if (!companyId) throw new Error("Company was not created (missing name).");

      const gstVal = gstin.trim();
      const panVal = pan.trim();
      await setCompanyFieldQuiet(companyId, "gstin", gstVal);
      await setCompanyFieldQuiet(companyId, "tax_id", gstVal);
      await setCompanyFieldQuiet(companyId, "pan", panVal);
      await setCompanyFieldQuiet(companyId, "pan_no", panVal);
      await setCompanyFieldQuiet(companyId, "company_pan", panVal);
      await setCompanyFieldQuiet(companyId, "custom_pan", panVal);

      const addrLine = addressLine.trim();
      const cityVal = city.trim();
      const countryVal = (countryAddr.trim() || coCountry).trim();
      const wantsAddress = Boolean(addrLine && cityVal && countryVal);

      if (wantsAddress) {
        await ensureAddressTemplatesForCountry(countryVal);
        const insertRes = await api.post<{ data: AddressDoc }>("/api/resource/Address", {
          address_title: `${nameTrim} — Billing`,
          address_type: "Billing",
          address_line1: addrLine,
          city: cityVal,
          state: state.trim() || undefined,
          country: countryVal,
          pincode: pincode.trim() || undefined,
          gstin: gstVal || undefined,
          is_primary_address: 1,
          links: [{ link_doctype: "Company", link_name: companyId }]
        });
        const addrName = insertRes.data?.data?.name;
        if (addrName && gstVal) {
          await setAddressFieldQuiet(addrName, "gstin", gstVal);
          await setAddressFieldQuiet(addrName, "tax_id", gstVal);
        }
      }

      router.push("/settings/company");
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to create company."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <p className="mb-4 text-sm">
        <Link href="/settings/company" className="text-slate-600 underline hover:text-slate-900">
          ← Company &amp; GST
        </Link>
      </p>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Add company</h1>
      <p className="mb-6 text-sm text-slate-600">
        Creates an ERPNext company with a standard chart of accounts, then optionally links a billing
        address (same as on Company &amp; GST). Country and currency must match records in ERPNext —
        loaded below from your site.
      </p>

      {loadingMasters ? (
        <p className="text-slate-600">Loading countries and currencies…</p>
      ) : mastersError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {mastersError}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Legal company name</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              placeholder="e.g. Acme Textiles Pvt Ltd"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Abbreviation</label>
            <input
              value={abbr}
              onChange={(e) => setAbbr(e.target.value.toUpperCase())}
              maxLength={10}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              placeholder="Short code (auto if empty)"
            />
            <p className="mt-1 text-xs text-slate-500">
              Used on accounts and warehouses. Leave blank to derive from the company name.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Default currency</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              >
                {currencyNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
              <select
                value={countryCo}
                onChange={(e) => {
                  const v = e.target.value;
                  setCountryCo(v);
                  setCountryAddr(v);
                }}
                required
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              >
                {countryNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">GSTIN</label>
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">PAN</label>
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              placeholder="Optional (India: Company PAN if field exists)"
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Registered address (optional)</h2>
            <p className="mb-3 text-xs text-slate-600">
              If you fill street, city, and country, a billing address is created and linked to this
              company.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Street / line 1</label>
              <textarea
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
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
                <select
                  value={countryAddr}
                  onChange={(e) => setCountryAddr(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
                >
                  {countryNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !mastersReady}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {loading ? "Creating…" : "Create company"}
          </button>
        </form>
      )}
    </section>
  );
}
