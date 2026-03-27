import { api } from "./api";

type FieldRow = { fieldname?: string };

function fieldNamesFromRows(fields: unknown): Set<string> {
  if (!Array.isArray(fields)) return new Set();
  const out = new Set<string>();
  for (const f of fields) {
    if (f && typeof f === "object") {
      const name = (f as FieldRow).fieldname;
      if (typeof name === "string" && name.length > 0) out.add(name);
    }
  }
  return out;
}

function extractFieldNamesFromResourceDocType(data: unknown): Set<string> {
  if (!data || typeof data !== "object") return new Set();
  const root = data as Record<string, unknown>;
  const doc = root.data;
  if (doc && typeof doc === "object" && "fields" in doc) {
    return fieldNamesFromRows((doc as { fields: unknown }).fields);
  }
  return new Set();
}

function extractFromClientGetOrMetaMessage(data: unknown): Set<string> {
  if (!data || typeof data !== "object") return new Set();
  const root = data as Record<string, unknown>;
  if (root.exc) return new Set();
  const message = root.message;
  if (message && typeof message === "object" && "fields" in message) {
    return fieldNamesFromRows((message as { fields: unknown }).fields);
  }
  return new Set();
}

/**
 * Load fieldnames for a DocType using only API-whitelisted paths.
 * Order: GET /api/resource/DocType/…, frappe.client.get, frappe.client.get_meta.
 * (frappe.desk.form.load.getdoctype is not whitelisted for REST on many sites.)
 */
export async function fetchDoctypeFieldNames(doctype: string): Promise<Set<string>> {
  const encoded = encodeURIComponent(doctype);

  try {
    const res = await api.get(`/api/resource/DocType/${encoded}`);
    const names = extractFieldNamesFromResourceDocType(res.data);
    if (names.size > 0) return names;
  } catch {
    // try fallbacks
  }

  try {
    const res = await api.get("/api/method/frappe.client.get", {
      params: { doctype: "DocType", name: doctype }
    });
    const names = extractFromClientGetOrMetaMessage(res.data);
    if (names.size > 0) return names;
  } catch {
    // continue
  }

  try {
    const res = await api.get("/api/method/frappe.client.get_meta", {
      params: { doctype }
    });
    return extractFromClientGetOrMetaMessage(res.data);
  } catch {
    return new Set();
  }
}
