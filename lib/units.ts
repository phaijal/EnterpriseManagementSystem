/** Label for weight columns and copy (ERP qty remains in item stock UOM, typically Kg/Kgs). */
export const WEIGHT_UNIT_LABEL = "Kgs";

export function weightLabel(short: string): string {
  return `${short} (${WEIGHT_UNIT_LABEL})`;
}
