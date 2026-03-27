import type { AxiosInstance } from "axios";
import { stockEntriesLockedByDeliveryNotes } from "./challanPayload";

type DeliveryNoteListRow = {
  name: string;
};

type DeliveryNoteDetailResponse = {
  data?: {
    name?: string;
    remarks?: string;
    docstatus?: number;
    items?: Array<{
      description?: string;
      item_description?: string;
    }>;
  };
};

const DETAIL_CHUNK = 15;

/** Submitted (docstatus 1) delivery notes only — cancelled notes release stock_entry keys. */
export async function fetchSubmittedChallanLockMap(
  api: AxiosInstance
): Promise<Map<string, string>> {
  // Frappe list API does not allow `remarks` on Delivery Note — fetch names, then load each doc.
  const response = await api.get<{ data: DeliveryNoteListRow[] }>("/api/resource/Delivery Note", {
    params: {
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify([["docstatus", "=", 1]]),
      order_by: "modified desc",
      limit_page_length: 500
    }
  });
  const names = (response.data.data ?? [])
    .map((r) => r.name)
    .filter((n): n is string => Boolean(n));

  const docs: Array<{
    name: string;
    remarks?: string;
    docstatus?: number;
    items?: Array<{ description?: string; item_description?: string }>;
  }> = [];

  for (let i = 0; i < names.length; i += DETAIL_CHUNK) {
    const chunk = names.slice(i, i + DETAIL_CHUNK);
    const details = await Promise.all(
      chunk.map((name) =>
        api.get<DeliveryNoteDetailResponse>(
          `/api/resource/Delivery Note/${encodeURIComponent(name)}`
        )
      )
    );
    for (const res of details) {
      const d = res.data?.data;
      if (d?.name && d.docstatus === 1) {
        docs.push({
          name: d.name,
          remarks: d.remarks,
          docstatus: d.docstatus,
          items: d.items
        });
      }
    }
  }

  return stockEntriesLockedByDeliveryNotes(docs);
}
