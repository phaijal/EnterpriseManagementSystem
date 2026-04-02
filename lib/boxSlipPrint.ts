import { LOT_ATTR_LABELS, parseLotAttrsFromRemarks } from "./itemLotAttributes";
import { parseRemarkToken } from "./stockEntryRemarks";
import { UI_DENIER, UI_LOT_NO } from "./uiLabels";
import { WEIGHT_UNIT_LABEL, weightLabel } from "./units";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type BoxSlipRow = {
  boxNumber: number;
  numCops: number;
  boxWeight: number;
  copWeight: number;
  tareWeight: number;
  grossWeight: number;
  netWeight: number;
  grade: string;
  twist?: string;
  shade?: string;
  quality?: string;
  machineNo?: string;
};

export type BoxSlipsDocumentOpts = {
  itemCode: string;
  printedAt: string;
  slips: BoxSlipRow[];
  /** Optional — printed at top (e.g. company name). */
  organizationName?: string;
};

/** Minimal row shape from the Boxes (view) page. */
export type BoxViewRowLike = {
  box: string;
  item_code: string;
  cops: number | "-";
  tare_weight: number | "-";
  gross_weight: number | "-";
  net_weight: number;
  grade: string;
};

/**
 * Build one slip row from table data + optional Stock Entry remarks (for COPW).
 * Box weight is derived as tare − cops × cop weight when COPW is present.
 */
export function slipRowFromBoxView(
  row: BoxViewRowLike,
  stockEntryRemarks?: string
): BoxSlipRow | null {
  const boxMatch = row.box.match(/(\d+)/);
  const boxNumber = boxMatch ? Number(boxMatch[1]) : NaN;
  if (!Number.isFinite(boxNumber)) return null;

  const numCops = typeof row.cops === "number" ? row.cops : 0;
  const tareW = typeof row.tare_weight === "number" ? row.tare_weight : 0;
  const grossW = typeof row.gross_weight === "number" ? row.gross_weight : 0;
  const netW =
    typeof row.net_weight === "number" && !Number.isNaN(row.net_weight) ?
      row.net_weight
    : Math.max(0, grossW - tareW);

  const copWTok = parseRemarkToken(stockEntryRemarks, "COPW");
  const copParsed = copWTok !== undefined ? Number(copWTok) : NaN;
  const copWeight = Number.isFinite(copParsed) ? copParsed : 0;
  const boxWeight = Math.max(0, tareW - numCops * copWeight);
  const la = parseLotAttrsFromRemarks(stockEntryRemarks);

  return {
    boxNumber,
    numCops,
    boxWeight,
    copWeight,
    tareWeight: tareW,
    grossWeight: grossW,
    netWeight: netW,
    grade: row.grade === "—" ? "—" : row.grade,
    twist: la.twist || undefined,
    shade: la.shade || undefined,
    quality: la.quality || undefined,
    machineNo: la.machineNo || undefined
  };
}

export function printSingleBoxSlip(opts: {
  row: BoxViewRowLike;
  stockEntryRemarks?: string;
}): void {
  const slip = slipRowFromBoxView(opts.row, opts.stockEntryRemarks);
  if (!slip) {
    window.alert("Could not read a box number for this slip.");
    return;
  }
  const html = buildBoxSlipsHtmlDocument({
    itemCode: opts.row.item_code,
    printedAt: new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }),
    slips: [slip]
  });
  printBoxSlipsHtml(html);
}

/**
 * One print job: multiple pages, one slip per box (page-break between slips).
 */
function specRow(label: string, valueHtml: string) {
  return `<tr><th scope="row">${esc(label)}</th><td>${valueHtml}</td></tr>`;
}

function lotAttrSpecRows(s: BoxSlipRow): string {
  const keys = ["twist", "shade", "quality", "machineNo"] as const;
  return keys
    .filter((k) => Boolean(s[k]?.trim()))
    .map((k) => specRow(LOT_ATTR_LABELS[k], esc(s[k]!.trim())))
    .join("\n          ");
}

export function buildBoxSlipsHtmlDocument(opts: BoxSlipsDocumentOpts): string {
  const banner = opts.organizationName?.trim() || "Packing Slip";

  const slipPages = opts.slips
    .map(
      (s) => `
  <section class="slip" aria-label="Box ${s.boxNumber} label">
    <div class="slip-card">
      <header class="slip-banner">${esc(banner)}</header>
      <div class="slip-main">
        <div class="box-block">
          <span class="box-label">Box No</span>
          <span class="box-num">${s.boxNumber}</span>
        </div>
        <div class="spec-two-col">
          <table class="spec-table">
            ${specRow(UI_DENIER, esc(opts.itemCode))}
            ${specRow("Grade", esc(s.grade))}
            ${specRow(UI_LOT_NO, esc(opts.itemCode))}
            ${specRow(weightLabel("Gross"), `<span class="tabular">${s.grossWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</span>`)}
            ${specRow("Tare", `<span class="tabular">${s.tareWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</span>`)}
            ${specRow("Box weight", `<span class="tabular">${s.boxWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</span>`)}
          </table>
          <table class="spec-table">
            ${specRow(LOT_ATTR_LABELS.twist, esc(s.twist?.trim() || "—"))}
            ${specRow(LOT_ATTR_LABELS.shade, esc(s.shade?.trim() || "—"))}
            ${specRow(LOT_ATTR_LABELS.quality, esc(s.quality?.trim() || "—"))}
            ${specRow(LOT_ATTR_LABELS.machineNo, esc(s.machineNo?.trim() || "—"))}
            ${specRow("No. of cops", `<span class="tabular">${s.numCops}</span>`)}
            ${specRow("Cop weight", `<span class="tabular">${s.copWeight.toFixed(3)} ${esc(WEIGHT_UNIT_LABEL)}</span>`)}
          </table>
        </div>
        <div class="net-strip" role="status">
          <span class="net-strip-label">${esc(weightLabel("Net"))}</span>
          <span class="net-strip-value tabular">${s.netWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</span>
        </div>
      </div>
      <footer class="slip-meta">Printed ${esc(opts.printedAt)}</footer>
    </div>
  </section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Box labels (${opts.slips.length})</title>
  <style>
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif;
      color: #0a0a0a;
      background: #e5e7eb;
    }
    .tabular { font-variant-numeric: tabular-nums lining-nums; }

    /* Screen: centered preview cards */
    .slip {
      display: flex;
      justify-content: center;
      padding: 16px;
      border-bottom: 1px solid #cbd5e1;
    }
    .slip:last-of-type { border-bottom: none; }

    .slip-card {
      width: 90mm;
      min-height: 70mm;
      background: #fff;
      border: 0.12in solid #111;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 14px rgba(0,0,0,0.12);
      text-transform: uppercase;
    }

    .slip-banner {
      background: #111;
      color: #fff;
      text-align: center;
      font-size: 0.54rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.2rem 0.3rem;
      line-height: 1.2;
    }

    .slip-main {
      flex: 1;
      padding: 0.28in 0.32in 0.2in;
      display: flex;
      flex-direction: column;
      gap: 0.12in;
    }

    .box-block {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.06in 0;
      border-bottom: 2px solid #111;
    }
    .box-label {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #374151;
    }
    .box-num {
      font-size: 1.7rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.02em;
    }

    .spec-two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.08in;
      align-items: start;
    }

    .spec-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.7rem;
      border: 1px solid #111;
      table-layout: fixed;
    }
    .spec-table th {
      text-align: left;
      font-weight: 800;
      color: #374151;
      padding: 0.12rem 0.16rem;
      width: 56%;
      border-bottom: 1px solid #d1d5db;
      border-right: 1px solid #e5e7eb;
      vertical-align: middle;
      white-space: nowrap;
    }
    .spec-table td {
      padding: 0.12rem 0.16rem;
      font-weight: 800;
      border-bottom: 1px solid #d1d5db;
      vertical-align: middle;
      height: 1.5rem;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .spec-table tr:last-child th,
    .spec-table tr:last-child td {
      border-bottom: none;
    }

    .net-strip {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.16rem 0.2rem;
      background: #111;
      color: #fff;
      border: 2px solid #111;
    }
    .net-strip-label {
      font-size: 0.56rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .net-strip-value {
      font-size: 0.9rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .slip-meta {
      font-size: 0.48rem;
      color: #6b7280;
      text-align: center;
      padding: 0.25rem 0.35rem 0.35rem;
      letter-spacing: 0.02em;
    }

    @media print {
      body { background: #fff; }
      .slip {
        padding: 0;
        border: none;
        page-break-after: always;
        break-after: page;
        width: 90mm;
        height: 70mm;
        overflow: hidden;
      }
      .slip:last-of-type {
        page-break-after: auto;
        break-after: auto;
      }
      .slip-card {
        width: 88mm;
        height: 68mm;
        min-height: 0;
        box-shadow: none;
        border-width: 0.3mm;
        font-family: Arial, Helvetica, sans-serif;
      }
      .slip-banner { font-size: 10px; padding: 1mm 1.2mm; letter-spacing: 0.04em; }
      .slip-main { padding: 1.2mm 1.5mm 1mm; gap: 1mm; }
      .box-block { padding: 0.5mm 0; }
      .box-label { font-size: 10px; }
      .box-num { font-size: 22px; }
      .spec-two-col { gap: 1mm; }
      .spec-table { font-size: 10px; }
      .spec-table th, .spec-table td { padding: 0.45mm 0.65mm; }
      .net-strip { padding: 0.7mm 1mm; }
      .net-strip-label { font-size: 9px; }
      .net-strip-value { font-size: 14px; }
      .slip-meta { font-size: 8px; padding: 0.6mm 0.8mm 0.8mm; line-height: 1.1; }
      @page {
        size: 90mm 70mm;
        margin: 0;
      }
    }
  </style>
</head>
<body>
${slipPages}
</body>
</html>`;
}

function printBoxSlipsHtmlViaHiddenIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.title = "Print preview";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "8.5in",
    height: "11in",
    border: "0",
    margin: "0"
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  let printScheduled = false;
  const runPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 90_000);
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  iframe.addEventListener("load", () => {
    const doc = iframe.contentWindow?.document;
    if (!doc?.body?.querySelector(".slip") || printScheduled) return;
    printScheduled = true;
    window.setTimeout(runPrint, 100);
  });

  document.body.appendChild(iframe);
  iframe.srcdoc = html;
}

/**
 * Prints via a hidden iframe on the current page only (no window.open, no new tab, no pop-up prompts).
 * Call from a direct button click so print() is allowed after async work.
 */
export function printBoxSlipsHtml(html: string): void {
  printBoxSlipsHtmlViaHiddenIframe(html);
}
