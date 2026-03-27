import { api } from "@/lib/api";

export type PartyPrintDetails = {
  name: string;
  gstin: string;
  addressLines: string[];
};

type AddressLike = {
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

type AddrListRow = {
  name?: string;
  is_primary_address?: 0 | 1;
};

function pickPrimaryAddress(rows: AddrListRow[]): AddrListRow | null {
  if (!rows.length) return null;
  const primary = rows.find((r) => r.is_primary_address === 1);
  return primary ?? rows[0];
}

export function formatAddressLines(a?: AddressLike | null): string[] {
  if (!a) return [];
  const lines: string[] = [];
  if (a.address_line1?.trim()) lines.push(a.address_line1.trim());
  if (a.address_line2?.trim()) lines.push(a.address_line2.trim());
  const cityPart = [a.city, a.state].filter((x) => x?.trim()).join(", ");
  const pin = a.pincode?.trim() || "";
  if (cityPart || pin) {
    lines.push([cityPart, pin].filter(Boolean).join(pin && cityPart ? " — " : "").trim());
  }
  if (a.country?.trim()) lines.push(a.country.trim());
  return lines;
}

export async function fetchCompanyPrintDetails(companyId: string): Promise<PartyPrintDetails> {
  const fallback: PartyPrintDetails = { name: companyId || "—", gstin: "", addressLines: [] };
  if (!companyId) return fallback;
  try {
    const cRes = await api.get<{ data?: { company_name?: string; name?: string; gstin?: string; tax_id?: string } }>(
      `/api/resource/Company/${encodeURIComponent(companyId)}`
    );
    const c = cRes.data?.data;
    const name = (c?.company_name || c?.name || companyId).trim();
    const gstin = (c?.gstin || c?.tax_id || "").trim();

    const addrListRes = await api.get<{ data?: AddrListRow[] }>("/api/resource/Address", {
      params: {
        filters: JSON.stringify([
          ["Dynamic Link", "link_doctype", "=", "Company"],
          ["Dynamic Link", "link_name", "=", companyId]
        ]),
        fields: JSON.stringify(["name", "is_primary_address", "modified"]),
        limit_page_length: 50,
        order_by: "modified desc"
      }
    });
    const picked = pickPrimaryAddress(addrListRes.data?.data ?? []);
    let addressLines: string[] = [];
    if (picked?.name) {
      const aRes = await api.get<{ data?: AddressLike }>(
        `/api/resource/Address/${encodeURIComponent(picked.name)}`
      );
      addressLines = formatAddressLines(aRes.data?.data);
    }
    return { name, gstin, addressLines };
  } catch {
    return { ...fallback, name: companyId };
  }
}

export async function fetchCustomerPrintDetails(customerId: string): Promise<PartyPrintDetails> {
  const fallback: PartyPrintDetails = { name: customerId || "—", gstin: "", addressLines: [] };
  if (!customerId) return fallback;
  try {
    const custRes = await api.get<{
      data?: {
        customer_name?: string;
        name?: string;
        gstin?: string;
        tax_id?: string;
        customer_primary_address?: string;
      };
    }>(`/api/resource/Customer/${encodeURIComponent(customerId)}`);
    const cu = custRes.data?.data;
    const name = (cu?.customer_name || cu?.name || customerId).trim();
    const gstin = (cu?.gstin || cu?.tax_id || "").trim();
    let addressLines: string[] = [];
    const addrKey = cu?.customer_primary_address;
    if (addrKey) {
      const aRes = await api.get<{ data?: AddressLike }>(
        `/api/resource/Address/${encodeURIComponent(addrKey)}`
      );
      addressLines = formatAddressLines(aRes.data?.data);
    }
    return { name, gstin, addressLines };
  } catch {
    return { ...fallback, name: customerId };
  }
}
