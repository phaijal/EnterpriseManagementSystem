import { api, getFrappeSuccessResponseError } from "./api";
import { getStoredCompanyPan, setStoredCompanyPan } from "./companyPanLocal";
import { fetchDoctypeFieldNames } from "./frappeMeta";

const PAN_FIELD_TRY = ["pan", "custom_pan", "pan_no", "company_pan", "l10n_in_pan"] as const;

/** Indian PAN: 5 letters, 4 digits, 1 letter */
const PAN_REGEX = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/i;

const PAN_STRICT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function stripHtmlToPlain(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 15-char GSTIN embeds PAN at positions 3–12 (1-based). */
function panFromIndianGstin(gstin: string): string {
  const s = gstin.trim().toUpperCase().replace(/\s/g, "");
  if (s.length !== 15) return "";
  const pan = s.slice(2, 12);
  return PAN_STRICT.test(pan) ? pan : "";
}

function panFromRegistrationDetails(text: unknown): string {
  if (typeof text !== "string") return "";
  const plain = stripHtmlToPlain(text);
  const m = plain.match(PAN_REGEX);
  if (m) return m[1].toUpperCase();
  for (const line of plain.split(/\r?\n/)) {
    const t = line.trim();
    const pm = /^PAN\s*:\s*(.+)$/i.exec(t);
    if (!pm) continue;
    const inner = pm[1].trim();
    const innerM = inner.match(PAN_REGEX);
    if (innerM) return innerM[1].toUpperCase();
    const u = inner.toUpperCase();
    if (PAN_STRICT.test(u)) return u;
    // Allow short / non-standard test values we store under "PAN: …" (standard Company has no pan column).
    if (inner.length >= 1 && inner.length <= 24) return u;
  }
  return "";
}

function unwrapFrappeDocPayload(o: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(o.docs) && o.docs[0] && typeof o.docs[0] === "object") {
    return o.docs[0] as Record<string, unknown>;
  }
  const doc = o.doc;
  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    return doc as Record<string, unknown>;
  }
  return o;
}

function parseFrappeMessageRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        return unwrapFrappeDocPayload(p as Record<string, unknown>);
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return unwrapFrappeDocPayload(raw as Record<string, unknown>);
  }
  return null;
}

function docFromResourceGetBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const data = b.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (Array.isArray(b.docs) && b.docs[0] && typeof b.docs[0] === "object") {
    return b.docs[0] as Record<string, unknown>;
  }
  return null;
}

/**
 * PAN may be a custom field (any `*pan*` name), or embedded in `registration_details` text.
 * Core ERPNext Company has `tax_id` / GSTIN but often no dedicated `pan` column.
 */
/** First non-empty GST-style identifier on the company (for display / fallbacks). */
export function pickGstinFromCompanyRecord(o: Record<string, unknown> | null | undefined): string {
  if (!o) return "";
  const keys = ["gstin", "tax_id", "l10n_in_gstin", "company_gstin", "gst_no"] as const;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

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
  for (const field of ["registration_details", "company_description"] as const) {
    const raw = o[field];
    const regStr =
      typeof raw === "string" ? raw
      : raw != null && typeof raw !== "object" ? String(raw)
      : "";
    const fromReg = panFromRegistrationDetails(regStr);
    if (fromReg) return fromReg;
  }
  const gstinKeys = [
    "gstin",
    "tax_id",
    "l10n_in_gstin",
    "company_gstin",
    "gst_no"
  ] as const;
  for (const k of gstinKeys) {
    const v = o[k];
    if (typeof v !== "string" || !v.trim()) continue;
    const fromGst = panFromIndianGstin(v);
    if (fromGst) return fromGst;
  }
  return "";
}

function mergePanLineIntoMultilineField(existing: string, panVal: string): string {
  const lines = existing.split(/\r?\n/).filter((line) => !/^PAN\s*:/i.test(line.trim()));
  lines.push(`PAN: ${panVal}`);
  return lines.join("\n").trim();
}

/**
 * Saves PAN: writes `PAN: …` into `company_description` and `registration_details` (standard Company
 * fields), tries optional PAN columns, then stores a browser copy so the UI can always show a value
 * even when GET omits text fields.
 */
export async function saveCompanyPanValue(
  companyName: string,
  panVal: string,
  merged: Record<string, unknown>
): Promise<void> {
  const v = panVal.trim();
  if (!v) {
    setStoredCompanyPan(companyName, "");
    return;
  }

  const latest = await fetchCompanyMerged(companyName);
  const descSource =
    typeof latest.company_description === "string" ? latest.company_description
    : typeof merged.company_description === "string" ? merged.company_description
    : "";
  const regSource =
    typeof latest.registration_details === "string" ? latest.registration_details
    : typeof merged.registration_details === "string" ? merged.registration_details
    : "";

  const descNext = mergePanLineIntoMultilineField(descSource, v);
  const regNext = mergePanLineIntoMultilineField(regSource, v);

  await api.post("/api/method/frappe.client.set_value", {
    doctype: "Company",
    name: companyName,
    fieldname: "company_description",
    value: descNext
  });

  await api.post("/api/method/frappe.client.set_value", {
    doctype: "Company",
    name: companyName,
    fieldname: "registration_details",
    value: regNext
  });

  for (const fieldname of PAN_FIELD_TRY) {
    const res = await api.post("/api/method/frappe.client.set_value", {
      doctype: "Company",
      name: companyName,
      fieldname,
      value: v
    });
    if (!getFrappeSuccessResponseError(res.data)) break;
  }

  setStoredCompanyPan(companyName, v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/** Merge get_list rows without letting null wipe earlier values (partial list rows often send nulls). */
function mergeCompanyListRow(out: Record<string, unknown>, row: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    if (k === "registration_details" && typeof v === "string" && !v.trim()) continue;
    if (k === "company_description" && typeof v === "string" && !v.trim()) continue;
    out[k] = v;
  }
}

/**
 * REST resource + frappe.client.get merged — client.get includes custom fields when whitelisted.
 */
export async function fetchCompanyMerged(companyName: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  try {
    const res = await api.get(`/api/resource/Company/${encodeURIComponent(companyName)}`);
    const body = res.data as unknown;
    const d = docFromResourceGetBody(body) ?? asRecord((body as Record<string, unknown>)?.data);
    if (d) mergeCompanyListRow(out, d);
  } catch {
    /* */
  }

  try {
    const res = await api.get("/api/method/frappe.client.get", {
      params: { doctype: "Company", name: companyName }
    });
    const raw = (res.data as Record<string, unknown>)?.message;
    if (!getFrappeSuccessResponseError(res.data)) {
      const m = parseFrappeMessageRecord(raw);
      if (m) mergeCompanyListRow(out, m);
    }
  } catch {
    /* */
  }

  const fieldSets = [
    [
      "name",
      "company_name",
      "registration_details",
      "company_description",
      "gstin",
      "tax_id",
      "pan",
      "custom_pan",
      "l10n_in_pan"
    ],
    ["name", "registration_details", "company_description", "gstin", "tax_id"],
    ["name", "gstin", "tax_id"],
    ["name", "company_description"],
    ["name", "registration_details"]
  ];
  for (const fields of fieldSets) {
    try {
      const res = await api.get("/api/method/frappe.client.get_list", {
        params: {
          doctype: "Company",
          filters: JSON.stringify([["name", "=", companyName]]),
          fields: JSON.stringify(fields),
          limit_page_length: 1
        }
      });
      if (getFrappeSuccessResponseError(res.data)) continue;
      const list = (res.data as Record<string, unknown>)?.message;
      const row =
        Array.isArray(list) && list[0] && typeof list[0] === "object" ?
          (list[0] as Record<string, unknown>)
        : null;
      if (row) mergeCompanyListRow(out, row);
    } catch {
      /* unknown field name etc. */
    }
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
      f === "company_description" ||
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

  return getStoredCompanyPan(companyName);
}
