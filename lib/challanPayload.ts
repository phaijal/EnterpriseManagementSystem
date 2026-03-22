export type ChallanBoxLine = {
  box_label: string;
  item_code: string;
  /** Display name from Item master */
  item_name?: string;
  cops: number;
  tare: number;
  gross: number;
  net: number;
  /** e.g. 1st, PQ, CLQ */
  grade?: string;
  lot?: string;
  /** Material Receipt Stock Entry — used to lock row on Boxes page while challan is submitted */
  stock_entry?: string;
};

export type ChallanPayload = {
  warehouse: string;
  boxes: ChallanBoxLine[];
};

const MARKER = "CHALLAN_DATA:";

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeChallanPayload(payload: ChallanPayload): string {
  return `${MARKER}${utf8ToBase64(JSON.stringify(payload))}`;
}

export function decodeChallanPayload(remarks?: string): ChallanPayload | null {
  if (!remarks || !remarks.includes(MARKER)) return null;
  const idx = remarks.indexOf(MARKER);
  const b64 = remarks.slice(idx + MARKER.length).trim();
  if (!b64) return null;
  try {
    const parsed = JSON.parse(base64ToUtf8(b64)) as ChallanPayload;
    if (!parsed?.boxes || !Array.isArray(parsed.boxes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parse our line description saved on Delivery Note Item:
 * `Box 1 — Item Name (ITEMCODE) — COPS:1 GROSS:10 TARE:0 NET:10` (legacy: TARE before GROSS still parses)
 * (em dash, en dash, or hyphen between segments)
 */
function normalizeDnDescriptionText(text: string): string {
  const stripped = text.replace(/<[^>]+>/g, " ");
  return stripped.replace(/\s+/g, " ").trim();
}

export function parseBoxLineFromDnDescription(text?: string | null): Partial<ChallanBoxLine> | null {
  if (!text?.trim()) return null;
  const normalized = normalizeDnDescriptionText(text);
  const grossFirst = normalized.match(
    /COPS:\s*([\d.+-]+)\s+GROSS:\s*([\d.+-]+)\s+TARE:\s*([\d.+-]+)\s+NET:\s*([\d.+-]+)/i
  );
  const tareFirst = normalized.match(
    /COPS:\s*([\d.+-]+)\s+TARE:\s*([\d.+-]+)\s+GROSS:\s*([\d.+-]+)\s+NET:\s*([\d.+-]+)/i
  );
  let cops: number;
  let tare: number;
  let gross: number;
  let net: number;
  if (grossFirst) {
    cops = Number(grossFirst[1]) || 0;
    gross = Number(grossFirst[2]) || 0;
    tare = Number(grossFirst[3]) || 0;
    net = Number(grossFirst[4]) || 0;
  } else if (tareFirst) {
    cops = Number(tareFirst[1]) || 0;
    tare = Number(tareFirst[2]) || 0;
    gross = Number(tareFirst[3]) || 0;
    net = Number(tareFirst[4]) || 0;
  } else {
    return null;
  }

  const gradeM = normalized.match(/GRADE:\s*(\S+)/i);
  const lotWithStock = normalized.match(/LOT:\s*(.+?)\s+STOCK_ENTRY:/i);
  const grade = gradeM?.[1]?.trim();
  const lot = lotWithStock?.[1]?.trim();

  const headEnd = normalized.search(/COPS:/i);
  const head = (headEnd >= 0 ? normalized.slice(0, headEnd) : normalized).trim();
  const splitRe = /^(.+?)\s*[—\u2013\-]\s+(.+?)\s+\(([^)]*)\)\s*$/;
  const m = head.match(splitRe);
  if (!m) {
    return { box_label: head || "—", cops, tare, gross, net, grade, lot };
  }
  return {
    box_label: m[1].trim(),
    item_name: m[2].trim(),
    item_code: m[3].trim(),
    cops,
    tare,
    gross,
    net,
    grade,
    lot
  };
}

export function parseBoxLabelsFromRemarks(remarks?: string): string[] {
  const boxMatch = remarks?.match(/BOXES:([^;]+)/i);
  if (!boxMatch) return [];
  return boxMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Prefer CHALLAN_DATA; else parse each item.description; then BOXES:/qty fallback. */
export function resolveChallanBoxLines(
  remarks: string | undefined,
  items: Array<{
    item_code?: string;
    qty?: number;
    description?: string;
    item_description?: string;
  }>
): ChallanBoxLine[] {
  const decoded = decodeChallanPayload(remarks);
  if (decoded?.boxes?.length) return decoded.boxes;

  const labels = parseBoxLabelsFromRemarks(remarks);
  const fullFallback = fallbackBoxesFromRemarksAndItems(remarks, items);

  return items.map((it, i) => {
    const lineText = it.description ?? it.item_description;
    const parsed = parseBoxLineFromDnDescription(lineText);
    if (parsed) {
      const ic =
        parsed.item_code && parsed.item_code !== "—"
          ? parsed.item_code
          : (it.item_code ?? "—");
      const net =
        parsed.net != null && !Number.isNaN(parsed.net)
          ? parsed.net
          : Number(it.qty) || 0;
      const box_label =
        (parsed.box_label && parsed.box_label !== "—" ? parsed.box_label : null) ||
        labels[i] ||
        `Line ${i + 1}`;
      return {
        box_label,
        item_code: ic,
        item_name: parsed.item_name,
        cops: parsed.cops ?? 0,
        tare: parsed.tare ?? 0,
        gross: parsed.gross ?? 0,
        net,
        grade: parsed.grade,
        lot: parsed.lot
      };
    }
    if (fullFallback?.[i]) return fullFallback[i];
    return {
      box_label: labels[i] ?? `Line ${i + 1}`,
      item_code: it.item_code ?? "—",
      cops: 0,
      tare: 0,
      gross: 0,
      net: Number(it.qty) || 0
    };
  });
}

/** Fallback when CHALLAN_DATA is missing: labels from BOXES: and qty from each item row (same order). */
export function fallbackBoxesFromRemarksAndItems(
  remarks: string | undefined,
  items: Array<{ item_code?: string; qty?: number }>
): ChallanBoxLine[] | null {
  if (!remarks || items.length === 0) return null;
  const boxMatch = remarks.match(/BOXES:([^;]+)/i);
  if (!boxMatch) return null;
  const labels = boxMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (labels.length !== items.length) return null;
  return items.map((row, i) => ({
    box_label: labels[i] ?? "—",
    item_code: row.item_code ?? "—",
    cops: 0,
    tare: 0,
    gross: 0,
    net: Number(row.qty) || 0
  }));
}

export function parseStockEntryNamesFromLineText(text?: string | null): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(/STOCK_ENTRY:\s*(\S+)/gi), (m) => m[1]).filter(Boolean);
}

/** Submitted DN → lock Material Receipt stock entries (boxes) from CHALLAN_DATA and/or STOCK_ENTRY: tags on lines. */
export function stockEntriesLockedByDeliveryNotes(
  docs: Array<{
    name: string;
    remarks?: string;
    docstatus?: number;
    items?: Array<{ description?: string; item_description?: string }>;
  }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const dn of docs) {
    if (dn.docstatus !== 1) continue;
    const decoded = decodeChallanPayload(dn.remarks);
    if (decoded?.boxes?.length) {
      for (const b of decoded.boxes) {
        const se = b.stock_entry;
        if (typeof se === "string" && se.length > 0) map.set(se, dn.name);
      }
    }
    for (const it of dn.items ?? []) {
      const line = it.description ?? it.item_description ?? "";
      for (const se of parseStockEntryNamesFromLineText(line)) {
        map.set(se, dn.name);
      }
    }
  }
  return map;
}

export function sumBoxColumns(boxes: ChallanBoxLine[]) {
  return boxes.reduce(
    (acc, b) => ({
      cops: acc.cops + b.cops,
      tare: acc.tare + b.tare,
      gross: acc.gross + b.gross,
      net: acc.net + b.net
    }),
    { cops: 0, tare: 0, gross: 0, net: 0 }
  );
}
