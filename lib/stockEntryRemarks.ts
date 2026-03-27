/** Allowed grade values for material receipt boxes. */
export const GRADE_OPTIONS = ["1ST", "ISTA", "PQ", "CLQ"] as const;
export type GradeValue = (typeof GRADE_OPTIONS)[number];

export function isGradeValue(s: string): s is GradeValue {
  return (GRADE_OPTIONS as readonly string[]).includes(s);
}

/** Read a semicolon-delimited token from Stock Entry remarks (value cannot contain `;`). */
export function parseRemarkToken(remarks: string | undefined, key: string): string | undefined {
  if (!remarks) return undefined;
  const m = remarks.match(new RegExp(`(?:^|;)${key}:([^;]*)`, "i"));
  const v = m?.[1]?.trim();
  return v || undefined;
}

export function sanitizeLotForRemarks(lot: string): string {
  return lot.replace(/;/g, " ").trim();
}
