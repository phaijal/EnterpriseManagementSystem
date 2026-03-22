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
  abbr?: string;
};

export default function CompanySettingsPage() {
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
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
        setGstin(d?.gstin || "");
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
      await api.put(`/api/resource/Company/${encodeURIComponent(selectedId)}`, {
        ...existing,
        company_name: companyName.trim(),
        gstin: gstin.trim()
      });
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
        Update the legal name and GSTIN stored on the Company record in ERPNext.
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
