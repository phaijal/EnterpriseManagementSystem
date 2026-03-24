import type { ChallanBoxLine } from "./challanPayload";
import { sumBoxColumns } from "./challanPayload";
import type { PartyPrintDetails } from "./challanPrintParties";
import { UI_DENIER, UI_LOT_NO } from "./uiLabels";
import { weightLabel } from "./units";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function partyBlockHtml(heading: string, party: PartyPrintDetails, fallbackName?: string) {
  const displayName = party.name && party.name !== "—" ? party.name : fallbackName || "—";
  const addr = party.addressLines.map((line) => `<div class="addr-line">${esc(line)}</div>`).join("");
  const gst =
    party.gstin?.trim() ?
      `<div class="gst-line"><span class="label">GSTIN</span> ${esc(party.gstin.trim())}</div>`
    : "";
  return `
    <div class="party-card">
      <div class="party-heading">${esc(heading)}</div>
      <div class="party-name">${esc(displayName)}</div>
      ${addr ? `<div class="party-address">${addr}</div>` : ""}
      ${gst || ""}
    </div>`;
}

export function buildChallanHtmlDocument(opts: {
  name: string;
  customer?: string;
  posting_date?: string;
  company?: string;
  remarks?: string;
  boxes: ChallanBoxLine[];
  companyParty?: PartyPrintDetails;
  customerParty?: PartyPrintDetails;
}): string {
  const sums = sumBoxColumns(opts.boxes);
  const rows = opts.boxes
    .map(
      (b) => `
    <tr>
      <td>${esc(b.box_label)}</td>
      <td>${esc(b.item_code)}</td>
      <td>${esc(b.item_name || "—")}</td>
      <td>${esc(b.grade || "—")}</td>
      <td class="num">${b.cops.toFixed(2)}</td>
      <td class="num">${b.gross.toFixed(2)}</td>
      <td class="num">${b.tare.toFixed(2)}</td>
      <td class="num">${b.net.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const humanRemarks = opts.remarks
    ? opts.remarks.split("CHALLAN_DATA:")[0]?.trim() || opts.remarks
    : "";

  const companyParty: PartyPrintDetails = opts.companyParty ?? {
    name: opts.company || "—",
    gstin: "",
    addressLines: []
  };
  const customerParty: PartyPrintDetails = opts.customerParty ?? {
    name: opts.customer || "—",
    gstin: "",
    addressLines: []
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Challan ${esc(opts.name)}</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #475569;
      --border: #94a3b8;
      --rule: #cbd5e1;
      --thead: #e2e8f0;
      --page-bg: #fff;
    }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      background: var(--page-bg);
      max-width: 210mm;
      margin: 0 auto;
      padding: 12mm 14mm 16mm;
      font-size: 10.5pt;
      line-height: 1.45;
    }
    .doc-title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid var(--ink);
      margin-bottom: 1rem;
    }
    .doc-title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .doc-meta {
      text-align: right;
      font-size: 0.95rem;
      color: var(--muted);
    }
    .doc-meta strong { color: var(--ink); font-weight: 600; }
    .doc-meta .mono { font-family: ui-monospace, monospace; font-size: 0.9em; }

    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem 1.5rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 640px) {
      .parties { grid-template-columns: 1fr; }
    }
    .party-card {
      border: 1px solid var(--rule);
      border-radius: 4px;
      padding: 0.65rem 0.75rem;
      min-height: 7.5rem;
      background: #fafafa;
    }
    .party-heading {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.35rem;
    }
    .party-name {
      font-weight: 700;
      font-size: 1.02rem;
      margin-bottom: 0.35rem;
      color: var(--ink);
    }
    .party-address { font-size: 0.92rem; color: #334155; }
    .addr-line + .addr-line { margin-top: 0.15rem; }
    .gst-line {
      margin-top: 0.5rem;
      font-size: 0.88rem;
      font-variant-numeric: tabular-nums;
    }
    .gst-line .label {
      font-weight: 600;
      color: var(--muted);
      margin-right: 0.35rem;
    }

    .context-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.25rem;
      font-size: 0.88rem;
      color: var(--muted);
      padding: 0.5rem 0;
      border-top: 1px solid var(--rule);
      border-bottom: 1px solid var(--rule);
      margin-bottom: 1rem;
    }
    .context-strip span strong { color: var(--ink); font-weight: 600; }

    .section-title {
      margin: 0 0 0.5rem;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }

    table.detail {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    table.detail th, table.detail td {
      border: 1px solid var(--border);
      padding: 0.45rem 0.55rem;
      text-align: left;
      vertical-align: top;
    }
    table.detail th {
      background: var(--thead);
      font-weight: 600;
      font-size: 0.82rem;
    }
    table.detail td.num, table.detail th.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    table.detail tfoot td {
      font-weight: 700;
      background: #f1f5f9;
    }

    .remarks {
      margin-top: 1.1rem;
      font-size: 0.85rem;
      color: var(--muted);
      white-space: pre-wrap;
      padding-top: 0.75rem;
      border-top: 1px dashed var(--rule);
    }

    .footer-note {
      margin-top: 1.5rem;
      font-size: 0.72rem;
      color: #94a3b8;
      text-align: center;
    }

    @media print {
      body { padding: 10mm 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .party-card { background: #fff; break-inside: avoid; }
      table.detail { break-inside: auto; }
      table.detail thead { display: table-header-group; }
      table.detail tfoot { display: table-footer-group; }
      table.detail tr { break-inside: avoid; break-after: auto; }
    }
  </style>
</head>
<body>
  <header class="doc-title-row">
    <div>
      <h1 class="doc-title">Delivery challan</h1>
    </div>
    <div class="doc-meta">
      <div><strong>No.</strong> <span class="mono">${esc(opts.name)}</span></div>
      <div><strong>Date</strong> ${esc(opts.posting_date || "—")}</div>
    </div>
  </header>

  <section class="parties" aria-label="Parties">
    ${partyBlockHtml("From — company", companyParty, opts.company)}
    ${partyBlockHtml("To — customer", customerParty, opts.customer)}
  </section>

  ${
    opts.company && opts.company !== companyParty.name ?
      `<div class="context-strip">
    <span><strong>Company code</strong> ${esc(opts.company)}</span>
  </div>`
    : ""
  }

  <h2 class="section-title">Product &amp; box details</h2>
  <table class="detail">
    <thead>
      <tr>
        <th>Box</th>
        <th>${esc(UI_LOT_NO)}</th>
        <th>${esc(UI_DENIER)}</th>
        <th>Grade</th>
        <th class="num">Cops</th>
        <th class="num">${esc(weightLabel("Gross"))}</th>
        <th class="num">${esc(weightLabel("Tare"))}</th>
        <th class="num">${esc(weightLabel("Net"))}</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="8">No line detail stored on this challan.</td></tr>`}
    </tbody>
    ${
      opts.boxes.length > 0 ?
        `<tfoot>
      <tr>
        <td colspan="4">Totals</td>
        <td class="num">${sums.cops.toFixed(2)}</td>
        <td class="num">${sums.gross.toFixed(2)}</td>
        <td class="num">${sums.tare.toFixed(2)}</td>
        <td class="num">${sums.net.toFixed(2)}</td>
      </tr>
    </tfoot>`
      : ""
    }
  </table>
  ${
    humanRemarks ?
      `<div class="remarks"><strong>Remarks</strong><br/>${esc(humanRemarks)}</div>`
    : ""
  }
  <p class="footer-note">This document was generated for printing or PDF export. Retain for your records.</p>
</body>
</html>`;
}

export function triggerHtmlDownload(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
