import { api } from "./api";

/**
 * ERPNext Warehouse.warehouse_type value for sellable / FG stock.
 * Blank / unset type is treated as Finished Goods so sites that never set the field still work.
 */
export const FINISHED_GOODS_WAREHOUSE_TYPE = "Finished Goods";

/**
 * ERPNext Company.create_default_warehouses creates "Goods In Transit" with this Warehouse Type.
 * The master must exist or company creation fails with LinkValidationError.
 */
export const TRANSIT_WAREHOUSE_TYPE = "Transit";

const WAREHOUSE_TYPE_DOCTYPE = "Warehouse Type";

/** Masters Company bootstrap may reference; safe to no-op if already present. */
const WAREHOUSE_TYPES_TO_ENSURE_BEFORE_NEW_COMPANY = [
  TRANSIT_WAREHOUSE_TYPE,
  FINISHED_GOODS_WAREHOUSE_TYPE
] as const;

/**
 * Ensures Warehouse Type rows exist before POST /api/resource/Company.
 * Does not replace fetchAppWarehouseName — warehouses do not exist until after the company is created.
 */
export async function ensureWarehouseTypesForCompanyCreate(): Promise<void> {
  const base = `/api/resource/${encodeURIComponent(WAREHOUSE_TYPE_DOCTYPE)}`;
  for (const typeName of WAREHOUSE_TYPES_TO_ENSURE_BEFORE_NEW_COMPANY) {
    try {
      await api.get(`${base}/${encodeURIComponent(typeName)}`);
    } catch {
      try {
        await api.post(base, { name: typeName });
      } catch {
        /* duplicate, permissions, or site policy */
      }
    }
  }
}

export type WarehouseListRow = {
  name?: string;
  warehouse_type?: string | null;
};

function leafWarehouseListPath(): string {
  const filters = [
    ["disabled", "=", 0],
    ["is_group", "=", 0]
  ];
  const fields = JSON.stringify(["name", "warehouse_type"]);
  const encodedFilters = encodeURIComponent(JSON.stringify(filters));
  return `/api/resource/Warehouse?fields=${encodeURIComponent(fields)}&filters=${encodedFilters}&limit_page_length=500`;
}

/** Unset / blank warehouse_type defaults to Finished Goods; other types are excluded. */
function matchesAppFinishedGoodsWarehouse(row: WarehouseListRow): boolean {
  const t = (row.warehouse_type ?? "").trim();
  if (t === "") return true;
  return t === FINISHED_GOODS_WAREHOUSE_TYPE;
}

function sortedWarehouseNames(rows: Array<{ name?: string }> | undefined): string[] {
  return (rows ?? [])
    .map((row) => row.name || "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function primaryName(names: string[]): string {
  return names[0] ?? "";
}

/**
 * Resolves the single warehouse this app uses: leaf, enabled, Finished Goods type
 * or blank type (defaults to finished goods). Deterministic first after sort.
 */
export async function fetchAppWarehouseName(): Promise<string> {
  const res = await api.get<{ data: WarehouseListRow[] }>(leafWarehouseListPath());
  const rows = res.data.data ?? [];
  const pool = rows.filter(matchesAppFinishedGoodsWarehouse);
  const names = sortedWarehouseNames(pool);
  return primaryName(names);
}
