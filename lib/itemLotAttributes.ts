import { parseRemarkToken } from "./stockEntryRemarks";

/** ERPNext Item custom field names (add these on Item doctype to persist on the lot). */
export const ITEM_LOT_ATTR_FIELDS = {
  twist: "custom_twist",
  shade: "custom_shade",
  quality: "custom_quality",
  machineNo: "custom_machine_no"
} as const;

/** Stock Entry remarks tokens (values must not contain `;`). */
const REMARK_KEYS = {
  twist: "TWIST",
  shade: "SHADE",
  quality: "QUAL",
  machineNo: "MACH"
} as const;

export type LotAttrs = {
  twist: string;
  shade: string;
  quality: string;
  machineNo: string;
};

export const EMPTY_LOT_ATTRS: LotAttrs = {
  twist: "",
  shade: "",
  quality: "",
  machineNo: ""
};

/** User-facing labels (same order as fields). */
export const LOT_ATTR_LABELS: Record<keyof LotAttrs, string> = {
  twist: "Twist",
  shade: "Shade",
  quality: "Quality",
  machineNo: "Machine no."
};

export function sanitizeAttrForRemarks(s: string): string {
  return s.replace(/;/g, " ").replace(/\s+/g, " ").trim();
}

/** Append non-empty attributes to a remarks string (leading `;` on each segment). */
export function buildLotAttrsRemarkSuffix(attrs: LotAttrs): string {
  const parts: [keyof LotAttrs, string][] = [
    ["twist", REMARK_KEYS.twist],
    ["shade", REMARK_KEYS.shade],
    ["quality", REMARK_KEYS.quality],
    ["machineNo", REMARK_KEYS.machineNo]
  ];
  let out = "";
  for (const [key, rk] of parts) {
    const v = sanitizeAttrForRemarks(attrs[key]);
    if (v) out += `;${rk}:${v}`;
  }
  return out;
}

export function parseLotAttrsFromRemarks(remarks: string | undefined): LotAttrs {
  return {
    twist: parseRemarkToken(remarks, REMARK_KEYS.twist) ?? "",
    shade: parseRemarkToken(remarks, REMARK_KEYS.shade) ?? "",
    quality: parseRemarkToken(remarks, REMARK_KEYS.quality) ?? "",
    machineNo: parseRemarkToken(remarks, REMARK_KEYS.machineNo) ?? ""
  };
}

function readCustomField(item: Record<string, unknown>, field: string): string {
  const v = item[field];
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

/**
 * Lot attributes from Item: primary source is `description` (same TWIST/SHADE/QUAL/MACH tokens as stock remarks).
 * Falls back to ERP custom_* fields when description has no tokens.
 */
export function lotAttrsFromItemDoc(item: Record<string, unknown> | null | undefined): LotAttrs {
  if (!item) return { ...EMPTY_LOT_ATTRS };
  const desc =
    typeof item.description === "string" ? item.description
    : item.description != null ? String(item.description)
    : "";
  const fromDesc = parseLotAttrsFromRemarks(desc);
  const hasDesc =
    fromDesc.twist || fromDesc.shade || fromDesc.quality || fromDesc.machineNo;
  if (hasDesc) return fromDesc;
  return {
    twist: readCustomField(item, ITEM_LOT_ATTR_FIELDS.twist),
    shade: readCustomField(item, ITEM_LOT_ATTR_FIELDS.shade),
    quality: readCustomField(item, ITEM_LOT_ATTR_FIELDS.quality),
    machineNo: readCustomField(item, ITEM_LOT_ATTR_FIELDS.machineNo)
  };
}

/** Value for Item `description` — token suffix only (no leading `;`). Trim for empty → omit field. */
export function buildItemDescriptionLotAttrs(attrs: LotAttrs): string {
  const s = buildLotAttrsRemarkSuffix(attrs);
  return s.startsWith(";") ? s.slice(1) : s;
}
