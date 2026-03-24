import { api } from "./api";

const ADDRESS_TEMPLATE_RESOURCE = `/api/resource/${encodeURIComponent("Address Template")}`;

/** Minimal Jinja body so Frappe `render_address` / Address `on_update` can run. */
export const DEFAULT_ADDRESS_TEMPLATE_BODY =
  "{{ address_line1 }}<br>\n" +
  "{% if address_line2 %}{{ address_line2 }}<br>{% endif %}\n" +
  "{{ city }}<br>\n" +
  "{% if state %}{{ state }}<br>{% endif %}\n" +
  "{% if pincode %}PIN: {{ pincode }}<br>{% endif %}\n" +
  "{{ country }}<br>\n";

/**
 * Ensures `get_address_templates` finds a row: either `is_default`, or a template for this country.
 * Without this, saving Address can throw on fresh sites.
 */
export async function ensureAddressTemplatesForCountry(countryHint: string): Promise<void> {
  const country = countryHint.trim();
  if (!country) return;

  try {
    const defRes = await api.get<{ data?: unknown[] }>(ADDRESS_TEMPLATE_RESOURCE, {
      params: {
        filters: JSON.stringify([["is_default", "=", 1]]),
        fields: JSON.stringify(["name"]),
        limit_page_length: 1
      }
    });
    if ((defRes.data?.data ?? []).length > 0) return;
  } catch {
    /* create below */
  }

  try {
    await api.get(`${ADDRESS_TEMPLATE_RESOURCE}/${encodeURIComponent(country)}`);
    await api.post("/api/method/frappe.client.set_value", {
      doctype: "Address Template",
      name: country,
      fieldname: "is_default",
      value: 1
    });
    return;
  } catch {
    /* no row for this country */
  }

  await api.post(ADDRESS_TEMPLATE_RESOURCE, {
    country,
    is_default: 1,
    template: DEFAULT_ADDRESS_TEMPLATE_BODY
  });
}
