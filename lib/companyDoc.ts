import { api } from "./api";
import { fetchDoctypeFieldNames } from "./frappeMeta";

/** Indian PAN: 5 letters, 4 digits, 1 letter */
const PAN_REGEX = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/i;

function panFromRegistrationDetails(text: unknown): string {
  if (typeof text !== "string") return "";
  const m = text.match(PAN_REGEX);
  return m ? m[1].toUpperCase() : "";
}

function parseFrappeMessageRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/**
 * PAN may be a custom field (any `*pan*` name), or embedded in `registration_details` text.
 * Core ERPNext Company has `tax_id` / GSTIN but often no dedicated `pan` column.
 */
export function readPanFromCompanyRecord(o: Record<string, unknown> | null | undefined): string {
  if (!o) return "";
  const exact = [
    "pan",
    "pan_no",
    "company_pan",
    "pan_number",
    "custom_pan",
    "gst_pan",
    "l10n_in_pan",
    "l10n_in_company_pan",
    "tax_registration_number"
  ];
  for (const k of exact) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const panKey = /(^|_)pan($|_)|pan_no|company_pan|l10n_in.*pan/i;
  for (const k of Object.keys(o)) {
    if (typeof o[k] !== "string" || !panKey.test(k)) continue;
    const v = (o[k] as string).trim();
    if (v) return v;
  }
  const fromReg = panFromRegistrationDetails(o.registration_details);
  if (fromReg) return fromReg;
  return "";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/**
 * REST resource + frappe.client.get merged — client.get includes custom fields when whitelisted.
 */
export async function fetchCompanyMerged(companyName: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  try {
    const res = await api.get<{ data?: unknown }>(
      `/api/resource/Company/${encodeURIComponent(companyName)}`
    );
    const d = asRecord(res.data?.data);
    if (d) Object.assign(out, d);
  } catch {
    /* */
  }

  try {
    const res = await api.get<{ message?: unknown }>("/api/method/frappe.client.get", {
      params: { doctype: "Company", name: companyName }
    });
    const m = parseFrappeMessageRecord(res.data?.message);
    if (m) Object.assign(out, m);
  } catch {
    /* */
  }

  return out;
}

/**
 * If merged doc still has no PAN, query DocType meta for any `pan`-related fieldnames and fetch them.
 */
export async function resolveCompanyPan(
  companyName: string,
  merged: Record<string, unknown>
): Promise<string> {
  const direct = readPanFromCompanyRecord(merged);
  if (direct) return direct;

  let meta: Set<string>;
  try {
    meta = await fetchDoctypeFieldNames("Company");
  } catch {
    return "";
  }

  const panRelated = [...meta].filter((f) => {
    const fl = f.toLowerCase();
    return (
      fl.includes("pan") ||
      f === "registration_details" ||
      fl.includes("permanent_account") ||
      fl.includes("tax_registration")
    );
  });

  const fields = [...new Set(["name", ...panRelated])];
  if (fields.length <= 1) return "";

  try {
    const res = await api.get<{ message?: unknown }>("/api/method/frappe.client.get_list", {
      params: {
        doctype: "Company",
        filters: JSON.stringify([["name", "=", companyName]]),
        fields: JSON.stringify(fields),
        limit_page_length: 1
      }
    });
    const list = res.data?.message;
    const row =
      Array.isArray(list) && list[0] && typeof list[0] === "object" ?
        (list[0] as Record<string, unknown>)
      : null;
    if (row) return readPanFromCompanyRecord(row);
  } catch {
    /* unknown field name etc. */
  }

  return "";
}
