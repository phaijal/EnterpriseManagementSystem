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
  lr_no?: string;
  vehicle_no?: string;
  transport?: string;
  boxes: ChallanBoxLine[];
  companyParty?: PartyPrintDetails;
  customerParty?: PartyPrintDetails;
}): string {
  const sums = sumBoxColumns(opts.boxes);
  const rows = opts.boxes.map((b, idx) => ({ ...b, srNo: idx + 1 }));
  const leftRows = rows.filter((_, idx) => idx % 2 === 0);
  const rightRows = rows.filter((_, idx) => idx % 2 === 1);
  const maxRows = Math.max(leftRows.length, rightRows.length);

  const bodyRows = Array.from({ length: maxRows }, (_, i) => {
    const l = leftRows[i];
    const r = rightRows[i];
    const leftCells = l ?
      `
        <td class="num">${l.srNo}</td>
        <td>${esc(l.box_label.replace(/^Box\s*/i, ""))}</td>
        <td class="num">${l.cops.toFixed(0)}</td>
        <td class="num">${l.gross.toFixed(3)}</td>
        <td class="num">${l.tare.toFixed(3)}</td>
        <td class="num">${l.net.toFixed(3)}</td>
      `
    : "<td></td><td></td><td></td><td></td><td></td><td></td>";
    const rightCells = r ?
      `
        <td class="num">${r.srNo}</td>
        <td>${esc(r.box_label.replace(/^Box\s*/i, ""))}</td>
        <td class="num">${r.cops.toFixed(0)}</td>
        <td class="num">${r.gross.toFixed(3)}</td>
        <td class="num">${r.tare.toFixed(3)}</td>
        <td class="num">${r.net.toFixed(3)}</td>
      `
    : "<td></td><td></td><td></td><td></td><td></td><td></td>";
    return `<tr>${leftCells}${rightCells}</tr>`;
  }).join("");

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
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      max-width: 210mm;
      margin: 0 auto;
      padding: 8mm;
      font-size: 11px;
      line-height: 1.25;
      background: #fff;
    }

    .sheet {
      border: 1px solid #222;
      padding: 6px;
    }

    .top-title {
      text-align: center;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: 0.5px;
      margin: 2px 0 4px;
    }

    .subtitle {
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      margin: 0 0 6px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      border: 1px solid #222;
      margin-bottom: 6px;
    }

    .meta-left,
    .meta-right {
      padding: 4px 6px;
      min-height: 108px;
    }

    .meta-left { border-right: 1px solid #222; }
    .row { display: flex; gap: 6px; margin-bottom: 3px; }
    .lbl { min-width: 72px; font-weight: 700; }
    .val { flex: 1; word-break: break-word; }
    .mono { font-family: "Courier New", monospace; }
    .muted { color: #222; }

    .table-wrap { border: 1px solid #222; }
    table.detail {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    table.detail th, table.detail td {
      border: 1px solid #222;
      padding: 3px 4px;
      text-align: left;
      vertical-align: middle;
    }
    table.detail th {
      background: #f1f1f1;
      font-weight: 700;
      white-space: nowrap;
    }
    table.detail td.num, table.detail th.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    table.detail tfoot td {
      font-weight: 700;
      background: #f9f9f9;
    }

    .remarks {
      margin-top: 6px;
      font-size: 10.5px;
      white-space: pre-wrap;
      padding-top: 4px;
      border-top: 1px dashed #666;
    }

    .footer-note {
      margin-top: 8px;
      font-size: 9.5px;
      color: #444;
      text-align: center;
    }

    @media print {
      body { padding: 4mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 4mm; }
    }
  </style>
</head>
<body>
  <section class="sheet">
    <p class="subtitle">Delivery Challan</p>
    <p class="top-title">${esc(companyParty.name || opts.company || "—")}</p>
    <p class="subtitle">
      ${esc((companyParty.addressLines || []).join(", ") || "—")}
      <br />
      GSTIN: ${esc(companyParty.gstin || "—")}
    </p>

    <section class="meta-grid" aria-label="Parties and challan meta">
      <div class="meta-left">
        <div class="row"><span class="lbl">GST NO :</span><span class="val mono">${esc(companyParty.gstin || "—")}</span></div>
        <div class="row"><span class="lbl">Party Name :</span><span class="val">${esc(customerParty.name || opts.customer || "—")}</span></div>
        <div class="row"><span class="lbl">Address :</span><span class="val">${esc((customerParty.addressLines || []).join(", ") || "—")}</span></div>
        <div class="row"><span class="lbl">GST NO :</span><span class="val mono">${esc(customerParty.gstin || "—")}</span></div>
      </div>
      <div class="meta-right">
        <div class="row"><span class="lbl">CHALLAN NO :</span><span class="val mono">${esc(opts.name)}</span></div>
        <div class="row"><span class="lbl">CHALLAN DATE :</span><span class="val">${esc(opts.posting_date || "—")}</span></div>
        <div class="row"><span class="lbl">L.R.NO :</span><span class="val">${esc(opts.lr_no || "—")}</span></div>
        <div class="row"><span class="lbl">VEHICLE NO :</span><span class="val">${esc(opts.vehicle_no || "—")}</span></div>
        <div class="row"><span class="lbl">TRANSPORT :</span><span class="val">${esc(opts.transport || "—")}</span></div>
      </div>
    </section>

    <div class="table-wrap">
      <table class="detail">
        <thead>
          <tr>
            <th class="num">Sr.No</th>
            <th>Box No</th>
            <th class="num">Cops</th>
            <th class="num">Gross wt.</th>
            <th class="num">Tare Wt</th>
            <th class="num">Net Wt</th>
            <th class="num">Sr.No</th>
            <th>Box No</th>
            <th class="num">Cops</th>
            <th class="num">Gross wt.</th>
            <th class="num">Tare Wt</th>
            <th class="num">Net Wt</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || `<tr><td colspan="12">No line detail stored on this challan.</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">Grand total :</td>
            <td class="num">${sums.cops.toFixed(0)}</td>
            <td class="num">${sums.gross.toFixed(3)}</td>
            <td class="num">${sums.tare.toFixed(3)}</td>
            <td class="num">${sums.net.toFixed(3)}</td>
            <td colspan="6"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    ${
      humanRemarks ?
        `<div class="remarks"><strong>Remarks:</strong> ${esc(humanRemarks)}</div>`
      : ""
    }
    <p class="footer-note">This document was generated for printing. Retain for your records.</p>
  </section>
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
