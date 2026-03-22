import type { ChallanBoxLine } from "./challanPayload";
import { sumBoxColumns } from "./challanPayload";
import { weightLabel } from "./units";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildChallanHtmlDocument(opts: {
  name: string;
  customer?: string;
  posting_date?: string;
  company?: string;
  warehouse?: string;
  remarks?: string;
  boxes: ChallanBoxLine[];
}): string {
  const sums = sumBoxColumns(opts.boxes);
  const rows = opts.boxes
    .map(
      (b) => `
    <tr>
      <td>${esc(b.box_label)}</td>
      <td>${esc(b.item_code)}</td>
      <td>${esc(b.item_name || "—")}</td>
      <td class="num">${b.cops.toFixed(2)}</td>
      <td class="num">${b.tare.toFixed(2)}</td>
      <td class="num">${b.gross.toFixed(2)}</td>
      <td class="num">${b.net.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const humanRemarks = opts.remarks
    ? opts.remarks.split("CHALLAN_DATA:")[0]?.trim() || opts.remarks
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Challan ${esc(opts.name)}</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #0f172a; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .meta { color: #475569; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .meta p { margin: 0.2rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { border: 1px solid #cbd5e1; padding: 0.5rem 0.6rem; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; background: #f8fafc; }
    .remarks { margin-top: 1.25rem; font-size: 0.85rem; color: #64748b; white-space: pre-wrap; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Challan</h1>
  <div class="meta">
    <p><strong>Document:</strong> ${esc(opts.name)}</p>
    <p><strong>Customer:</strong> ${esc(opts.customer || "—")}</p>
    <p><strong>Posting date:</strong> ${esc(opts.posting_date || "—")}</p>
    <p><strong>Company:</strong> ${esc(opts.company || "—")}</p>
    <p><strong>Warehouse:</strong> ${esc(opts.warehouse || "—")}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Box</th>
        <th>Item code</th>
        <th>Item name</th>
        <th class="num">Cops</th>
        <th class="num">${esc(weightLabel("Tare"))}</th>
        <th class="num">${esc(weightLabel("Gross"))}</th>
        <th class="num">${esc(weightLabel("Net"))}</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="7">No line detail stored on this challan.</td></tr>`}
    </tbody>
    ${
      opts.boxes.length > 0
        ? `<tfoot>
      <tr>
        <td colspan="3">Totals</td>
        <td class="num">${sums.cops.toFixed(2)}</td>
        <td class="num">${sums.tare.toFixed(2)}</td>
        <td class="num">${sums.gross.toFixed(2)}</td>
        <td class="num">${sums.net.toFixed(2)}</td>
      </tr>
    </tfoot>`
        : ""
    }
  </table>
  ${
    humanRemarks
      ? `<div class="remarks"><strong>Remarks (summary):</strong><br/>${esc(humanRemarks)}</div>`
      : ""
  }
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
