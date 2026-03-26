import type { AxiosInstance } from "axios";
import { getFrappeSuccessResponseError } from "./api";

/**
 * Default leaf Item Group for stock lots — created on first company setup and reused by
 * Create lot and any other flow that needs a group.
 */
export const DEFAULT_LOT_ITEM_GROUP_NAME = "Manufacturing";

/** Last resort if "Manufacturing" is taken by a non-leaf node or create fails. */
const FALLBACK_LEAF_ITEM_GROUP_NAME = "EMS Lots";
const COMMON_ITEM_GROUP_PARENTS = [
  "All Item Groups",
  "Products",
  "Raw Material",
  "Finished Goods",
  "Consumable"
] as const;
export type ItemGroupEnsureDebug = {
  attemptedParents: string[];
};

type ItemGroupRow = {
  name?: string;
  is_group?: unknown;
  parent_item_group?: string | null;
};

function rowIsLeaf(row: ItemGroupRow): boolean {
  const g = row.is_group;
  return g === 0 || g === false || g === "0" || Number(g) === 0;
}

function rowIsGroupFolder(row: ItemGroupRow): boolean {
  const g = row.is_group;
  return g === 1 || g === true || g === "1" || Number(g) === 1;
}

/** Prefer REST; if empty or error, try frappe.client.get_list (often allowed when resource list is empty). */
async function fetchAllItemGroupRows(client: AxiosInstance): Promise<ItemGroupRow[]> {
  for (const fields of [["name", "is_group", "parent_item_group"], ["name", "is_group"]] as const) {
    try {
      const res = await client.get<{ data?: ItemGroupRow[] }>("/api/resource/Item Group", {
        params: {
          fields: JSON.stringify(fields),
          limit_page_length: 2000
        }
      });
      const rows = res.data?.data ?? [];
      if (rows.length > 0) return rows;
    } catch {
      /* */
    }
  }

  try {
    const res = await client.get<{ message?: unknown }>("/api/method/frappe.client.get_list", {
      params: {
        doctype: "Item Group",
        fields: JSON.stringify(["name", "is_group", "parent_item_group"]),
        limit_page_length: 2000
      }
    });
    if (getFrappeSuccessResponseError(res.data)) return [];
    const list = res.data?.message;
    if (Array.isArray(list) && list.length > 0) {
      return list.filter((x): x is ItemGroupRow => x != null && typeof x === "object");
    }
  } catch {
    /* */
  }

  return [];
}

/**
 * Any item_group already used on an Item is valid for new Items — no Item Group doc list/create needed.
 */
async function getItemGroupFromExistingItems(client: AxiosInstance): Promise<string> {
  try {
    const res = await client.get<{ data?: Array<{ item_group?: string }> }>("/api/resource/Item", {
      params: {
        fields: JSON.stringify(["name", "item_group"]),
        filters: JSON.stringify([["disabled", "=", 0]]),
        limit_page_length: 100
      }
    });
    for (const row of res.data?.data ?? []) {
      const ig = typeof row.item_group === "string" ? row.item_group.trim() : "";
      if (ig) return ig;
    }
  } catch {
    /* */
  }

  try {
    const res = await client.get<{ message?: unknown }>("/api/method/frappe.client.get_list", {
      params: {
        doctype: "Item",
        fields: JSON.stringify(["item_group"]),
        filters: JSON.stringify([["disabled", "=", 0]]),
        limit_page_length: 50
      }
    });
    if (getFrappeSuccessResponseError(res.data)) return "";
    const list = res.data?.message;
    if (!Array.isArray(list)) return "";
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const ig = typeof (row as { item_group?: string }).item_group === "string"
        ? (row as { item_group: string }).item_group.trim()
        : "";
      if (ig) return ig;
    }
  } catch {
    /* */
  }

  return "";
}

async function listLeafItemGroupNames(client: AxiosInstance): Promise<string[]> {
  let names: string[] = [];
  try {
    const filterRes = await client.get<{ data?: ItemGroupRow[] }>("/api/resource/Item Group", {
      params: {
        fields: JSON.stringify(["name", "is_group"]),
        filters: JSON.stringify([["is_group", "=", 0]]),
        limit_page_length: 2000
      }
    });
    names = (filterRes.data?.data ?? [])
      .filter((row) => rowIsLeaf(row))
      .map((row) => (row.name ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    /* */
  }

  if (names.length > 0) return names;

  const all = await fetchAllItemGroupRows(client);
  names = all
    .filter((row) => rowIsLeaf(row) && (row.name ?? "").trim())
    .map((row) => (row.name ?? "").trim())
    .sort((a, b) => a.localeCompare(b));
  return names;
}

function gatherParentNamesForCreate(all: ItemGroupRow[]): string[] {
  const candidates = new Set<string>();

  for (const row of all) {
    if (rowIsGroupFolder(row) && (row.name ?? "").trim()) {
      candidates.add((row.name ?? "").trim());
    }
  }

  for (const row of all) {
    const pig = row.parent_item_group;
    if (typeof pig === "string" && pig.trim()) {
      candidates.add(pig.trim());
    }
  }

  const provenParents = new Set(
    all
      .filter((row) => rowIsLeaf(row) && typeof row.parent_item_group === "string" && row.parent_item_group.trim())
      .map((row) => row.parent_item_group!.trim())
  );

  return [...candidates].sort((a, b) => {
    const pa = provenParents.has(a) ? 0 : 1;
    const pb = provenParents.has(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

async function createLeafRest(
  client: AxiosInstance,
  itemGroupName: string,
  parent: string
): Promise<boolean> {
  try {
    await client.post("/api/resource/Item Group", {
      item_group_name: itemGroupName,
      parent_item_group: parent,
      is_group: 0
    });
    return true;
  } catch {
    return false;
  }
}

async function createLeafInsert(client: AxiosInstance, itemGroupName: string, parent: string): Promise<boolean> {
  try {
    const res = await client.post("/api/method/frappe.client.insert", {
      doc: {
        doctype: "Item Group",
        item_group_name: itemGroupName,
        parent_item_group: parent,
        is_group: 0
      }
    });
    return !getFrappeSuccessResponseError(res.data);
  } catch {
    return false;
  }
}

async function parentItemGroupExists(client: AxiosInstance, parent: string): Promise<boolean> {
  const p = parent.trim();
  if (!p) return false;
  try {
    await client.get(`/api/resource/Item Group/${encodeURIComponent(p)}`);
    return true;
  } catch {
    /* */
  }
  try {
    const res = await client.get<{ message?: unknown }>("/api/method/frappe.client.get_list", {
      params: {
        doctype: "Item Group",
        fields: JSON.stringify(["name"]),
        filters: JSON.stringify([["name", "=", p]]),
        limit_page_length: 1
      }
    });
    if (getFrappeSuccessResponseError(res.data)) return false;
    const list = res.data?.message;
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}

async function tryCreateLeafItemGroup(client: AxiosInstance, itemGroupName: string): Promise<boolean> {
  const all = await fetchAllItemGroupRows(client);
  const rawParents = Array.from(new Set([...gatherParentNamesForCreate(all), ...COMMON_ITEM_GROUP_PARENTS]));
  const parents: string[] = [];
  for (const parent of rawParents) {
    if (await parentItemGroupExists(client, parent)) parents.push(parent);
  }
  if (parents.length === 0) {
    return false;
  }

  for (const parent of parents) {
    if (await createLeafRest(client, itemGroupName, parent)) return true;
    if (await createLeafInsert(client, itemGroupName, parent)) return true;
  }

  return false;
}

/**
 * Resolves a valid `item_group` for new Items: prefer Manufacturing, else any leaf group, else
 * create Manufacturing/EMS Lots, else **reuse item_group from any existing Item** (works when
 * Item Group list/create is restricted but Items are readable).
 */
export async function ensureDefaultLeafItemGroup(
  client: AxiosInstance,
  onDebug?: (debug: ItemGroupEnsureDebug) => void
): Promise<string> {
  let leafNames = await listLeafItemGroupNames(client);
  const attemptedParents = new Set<string>();

  const reportDebug = () => {
    onDebug?.({ attemptedParents: [...attemptedParents] });
  };

  if (leafNames.includes(DEFAULT_LOT_ITEM_GROUP_NAME)) {
    reportDebug();
    return DEFAULT_LOT_ITEM_GROUP_NAME;
  }

  const allForPrimary = await fetchAllItemGroupRows(client);
  const primaryParents = Array.from(
    new Set([...gatherParentNamesForCreate(allForPrimary), ...COMMON_ITEM_GROUP_PARENTS])
  );
  for (const p of primaryParents) attemptedParents.add(p);
  reportDebug();
  if (await tryCreateLeafItemGroup(client, DEFAULT_LOT_ITEM_GROUP_NAME)) {
    reportDebug();
    return DEFAULT_LOT_ITEM_GROUP_NAME;
  }

  if (leafNames.length > 0) {
    reportDebug();
    return leafNames[0];
  }

  const allForFallback = await fetchAllItemGroupRows(client);
  const fallbackParents = Array.from(
    new Set([...gatherParentNamesForCreate(allForFallback), ...COMMON_ITEM_GROUP_PARENTS])
  );
  for (const p of fallbackParents) attemptedParents.add(p);
  reportDebug();
  if (await tryCreateLeafItemGroup(client, FALLBACK_LEAF_ITEM_GROUP_NAME)) {
    reportDebug();
    return FALLBACK_LEAF_ITEM_GROUP_NAME;
  }

  leafNames = await listLeafItemGroupNames(client);
  if (leafNames.length > 0) {
    reportDebug();
    return leafNames[0];
  }

  const fromItems = await getItemGroupFromExistingItems(client);
  if (fromItems) {
    reportDebug();
    return fromItems;
  }

  reportDebug();
  return "";
}
