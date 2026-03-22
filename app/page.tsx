"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getApiErrorMessage } from "@/lib/api";

export default function DashboardPage() {
  const { user, loading, login } = useAuth();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(usr, pwd);
      setPwd("");
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const guest = !user || user === "Guest";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#dashboard-login") return;
    requestAnimationFrame(() => {
      document.getElementById("dashboard-login")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [guest, loading]);

  return (
    <section className="flex min-h-[65vh] flex-col items-center justify-center px-2">
      <h1 className="mb-6 text-center text-3xl font-bold text-slate-900">Home</h1>

      {loading ? (
        <p className="text-slate-600">Checking session…</p>
      ) : guest ? (
        <div
          id="dashboard-login"
          className="mb-10 w-full max-w-md scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Sign in to ERPNext
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            Use your desk username and password. Your session is stored in the
            browser for API requests through this app.
          </p>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="dashboard-usr"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Username
              </label>
              <input
                id="dashboard-usr"
                name="usr"
                autoComplete="username"
                value={usr}
                onChange={(e) => setUsr(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                required
              />
            </div>
            <div>
              <label
                htmlFor="dashboard-pwd"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="dashboard-pwd"
                name="pwd"
                type="password"
                autoComplete="current-password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                required
              />
            </div>
            {error ? (
              <p className="whitespace-pre-wrap text-sm text-red-700">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-slate-900 py-3 text-center text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      ) : (
        <div className="max-w-md text-center">
          <p className="text-sm text-slate-600">
            Signed in as{" "}
            <span className="font-semibold text-slate-900">{user}</span>.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Use the navigation menu to open stock, challans, customers, and
            settings.
          </p>
        </div>
      )}
    </section>
  );
}
