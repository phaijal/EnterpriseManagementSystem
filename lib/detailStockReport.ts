import { parseRemarkToken } from "./stockEntryRemarks";

/** Column groups on the detail stock report (legacy IST / ISTA / PQ / CLQ+Other). */
export const REPORT_GRADE_HEADERS = ["IST", "ISTA", "PQ", "CLQ / Other"] as const;

export type ReportGradeKey = (typeof REPORT_GRADE_HEADERS)[number];

export type GradeMetrics = {
  boxes: number;
  units: number;
  quantity: number;
};

export function emptyGradeMetrics(): GradeMetrics {
  return { boxes: 0, units: 0, quantity: 0 };
}

export type GradeBlock = Record<ReportGradeKey, GradeMetrics>;

export function emptyGradeBlock(): GradeBlock {
  return {
    IST: emptyGradeMetrics(),
    ISTA: emptyGradeMetrics(),
    PQ: emptyGradeMetrics(),
    "CLQ / Other": emptyGradeMetrics()
  };
}

/**
 * Map stored grade (e.g. 1st, PQ, CLQ) to a report column.
 * Unknown values go to "CLQ / Other".
 */
export function normalizeReportGrade(raw: string | undefined | null): ReportGradeKey {
  const s = (raw ?? "").trim();
  if (!s) return "CLQ / Other";
  const u = s.toUpperCase();
  if (u === "IST" || u === "1ST" || s.toLowerCase() === "1st") return "IST";
  if (u === "ISTA") return "ISTA";
  if (u === "PQ") return "PQ";
  if (u === "CLQ") return "CLQ / Other";
  return "CLQ / Other";
}

export function addToGradeBlock(block: GradeBlock, grade: ReportGradeKey, box: GradeMetrics): void {
  const g = block[grade];
  g.boxes += box.boxes;
  g.units += box.units;
  g.quantity += box.quantity;
}

export function mergeGradeBlocks(a: GradeBlock, b: GradeBlock): GradeBlock {
  const out = emptyGradeBlock();
  for (const k of REPORT_GRADE_HEADERS) {
    out[k] = {
      boxes: a[k].boxes + b[k].boxes,
      units: a[k].units + b[k].units,
      quantity: a[k].quantity + b[k].quantity
    };
  }
  return out;
}

export type ReportDataRow = {
  kind: "data";
  denier: string;
  lotNo: string;
  machineNo: string;
  grades: GradeBlock;
};

export type ReportSubtotalRow = {
  kind: "subtotal";
  label: string;
  grades: GradeBlock;
};

export type ReportGrandRow = {
  kind: "grand";
  grades: GradeBlock;
};

export type ReportTableRow = ReportDataRow | ReportSubtotalRow | ReportGrandRow;

/** One material-receipt line → single box metrics. */
export function metricsFromBoxLine(opts: {
  remarks?: string;
  customGrade?: string;
  customCops?: number;
  netQty: number;
}): { grade: ReportGradeKey; metrics: GradeMetrics } {
  const gradeRaw =
    opts.customGrade?.trim() || parseRemarkToken(opts.remarks, "GRADE") || "";
  const grade = normalizeReportGrade(gradeRaw);
  const copsTok = opts.customCops ?? parseRemarkToken(opts.remarks, "COPS");
  const cops = copsTok !== undefined ? Number(copsTok) : 0;
  const units = Number.isFinite(cops) ? cops : 0;
  const qty = Number.isFinite(opts.netQty) ? opts.netQty : 0;
  return {
    grade,
    metrics: { boxes: 1, units, quantity: qty }
  };
}

/** Build flat table rows with denier subtotals and grand total. */
export function buildReportRows(dataRows: ReportDataRow[]): ReportTableRow[] {
  if (dataRows.length === 0) return [];

  const sorted = [...dataRows].sort((a, b) => {
    const d = a.denier.localeCompare(b.denier);
    if (d !== 0) return d;
    const l = a.lotNo.localeCompare(b.lotNo);
    if (l !== 0) return l;
    return a.machineNo.localeCompare(b.machineNo);
  });

  const out: ReportTableRow[] = [];
  let grand = emptyGradeBlock();

  let i = 0;
  while (i < sorted.length) {
    const denier = sorted[i].denier;
    let sub = emptyGradeBlock();
    while (i < sorted.length && sorted[i].denier === denier) {
      out.push(sorted[i]);
      sub = mergeGradeBlocks(sub, sorted[i].grades);
      grand = mergeGradeBlocks(grand, sorted[i].grades);
      i += 1;
    }
    out.push({
      kind: "subtotal",
      label: `${denier} — subtotal`,
      grades: sub
    });
  }

  // Replace last subtotal with clearer label or keep — actually legacy says "DENIER TOTAL"
  for (let j = out.length - 1; j >= 0; j--) {
    const row = out[j];
    if (row.kind === "subtotal") {
      const denierLabel = row.label.replace(" — subtotal", "");
      out[j] = { ...row, label: `Denier total — ${denierLabel}` };
    }
  }

  out.push({ kind: "grand", grades: grand });
  return out;
}

export function totalBlock(block: GradeBlock): GradeMetrics {
  const t = emptyGradeMetrics();
  for (const k of REPORT_GRADE_HEADERS) {
    t.boxes += block[k].boxes;
    t.units += block[k].units;
    t.quantity += block[k].quantity;
  }
  return t;
}
