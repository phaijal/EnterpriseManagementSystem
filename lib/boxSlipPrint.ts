import { parseRemarkToken } from "./stockEntryRemarks";
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
  lotNo: string;
};

export type BoxSlipsDocumentOpts = {
  itemCode: string;
  printedAt: string;
  slips: BoxSlipRow[];
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
  lot: string;
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

  return {
    boxNumber,
    numCops,
    boxWeight,
    copWeight,
    tareWeight: tareW,
    grossWeight: grossW,
    netWeight: netW,
    grade: row.grade === "—" ? "—" : row.grade,
    lotNo: row.lot === "—" ? "—" : row.lot
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
export function buildBoxSlipsHtmlDocument(opts: BoxSlipsDocumentOpts): string {
  const slipPages = opts.slips
    .map(
      (s) => `
  <section class="slip">
    <header class="slip-head">
      <h1>Box slip</h1>
      <p class="box-no">Box <span>${s.boxNumber}</span></p>
    </header>
    <dl class="slip-grid">
      <dt>Item</dt><dd>${esc(opts.itemCode)}</dd>
      <dt>Grade</dt><dd>${esc(s.grade)}</dd>
      <dt>Lot no.</dt><dd>${esc(s.lotNo)}</dd>
      <dt>No. of cops</dt><dd class="num">${s.numCops}</dd>
      <dt>Cop weight</dt><dd class="num">${s.copWeight.toFixed(3)} ${esc(WEIGHT_UNIT_LABEL)}</dd>
      <dt>Box weight</dt><dd class="num">${s.boxWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</dd>
      <dt>${esc(weightLabel("Gross"))}</dt><dd class="num">${s.grossWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</dd>
      <dt>Tare</dt><dd class="num">${s.tareWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</dd>
      <dt>${esc(weightLabel("Net"))}</dt><dd class="num net">${s.netWeight.toFixed(2)} ${esc(WEIGHT_UNIT_LABEL)}</dd>
    </dl>
    <footer class="slip-foot">Printed ${esc(opts.printedAt)}</footer>
  </section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Box slips (${opts.slips.length})</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #fff;
    }
    .slip {
      max-width: 420px;
      margin: 0 auto;
      padding: 12mm 14mm 10mm;
      border-bottom: 1px dashed #cbd5e1;
    }
    .slip:last-of-type { border-bottom: none; }
    .slip-head h1 {
      margin: 0 0 0.25rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .box-no {
      margin: 0 0 1rem;
      font-size: 1.5rem;
      font-weight: 800;
    }
    .box-no span { font-variant-numeric: tabular-nums; }
    .slip-grid {
      display: grid;
      grid-template-columns: 7.5rem 1fr;
      gap: 0.35rem 0.75rem;
      margin: 0;
      font-size: 0.9rem;
    }
    .slip-grid dt {
      margin: 0;
      color: #64748b;
      font-weight: 600;
    }
    .slip-grid dd {
      margin: 0;
      font-weight: 500;
    }
    .slip-grid .num { font-variant-numeric: tabular-nums; }
    .slip-grid .net { font-size: 1.05rem; font-weight: 800; }
    .slip-foot {
      margin-top: 1.25rem;
      font-size: 0.7rem;
      color: #94a3b8;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .slip {
        page-break-after: always;
        border-bottom: none;
        max-width: none;
      }
      .slip:last-of-type {
        page-break-after: auto;
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
