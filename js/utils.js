/** utils.js – constants, formatting helpers, calculation logic */

// ── Dropdown options ──────────────────────────────────────────────────
const OPT_PAYMENT_STATUS  = ['Not Paid', 'Paid', 'Paid without GST'];
const OPT_CURRENCY        = ['INR', 'USD'];
const OPT_GST_REQUIRED    = ['No', 'Yes'];
const OPT_YES_NO_NA       = ['NA', 'Yes', 'No'];
const OPT_ACCOUNT_TYPE    = ['Vendor', 'Customer', 'Both'];
const OPT_PREF_CONTACT    = ['Any', 'Email', 'Phone', 'Mobile'];

// ── ID generation ─────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Formatting ────────────────────────────────────────────────────────
function fmtINR(val) {
  if (val === null || val === undefined || val === '' || isNaN(parseFloat(val))) return '—';
  return 'INR\u00a0' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUSD(val) {
  if (val === null || val === undefined || val === '' || isNaN(parseFloat(val))) return '—';
  return 'USD\u00a0' + parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(val) {
  if (val === null || val === undefined || val === '') return '—';
  return parseFloat(val).toLocaleString('en-IN');
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d)) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** HTML-escape a string */
function esc(s) {
  if (!s && s !== 0) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build <option> tags for a <select> */
function opts(options, selected, placeholder) {
  let html = placeholder !== undefined
    ? `<option value="">${esc(placeholder)}</option>`
    : '';
  for (const o of options) {
    html += `<option value="${esc(o)}" ${o === selected ? 'selected' : ''}>${esc(o)}</option>`;
  }
  return html;
}

// ── Calculations ──────────────────────────────────────────────────────

/**
 * Amount to receive (invoice value before received):
 *   USD  → perDay × days × exchange  (no GST)
 *   INR + GST Yes → perDay × days × 1.18
 *   INR + GST No  → perDay × days
 */
function calcAmountToReceive(perDay, days, currency, exchange, gstRequired) {
  const base = (parseFloat(perDay) || 0) * (parseFloat(days) || 1);
  if (currency === 'USD') return base * (parseFloat(exchange) || 1);
  if (gstRequired === 'Yes') return base * 1.18;
  return base;
}

function calcGST(perDay, days, currency, gstRequired) {
  if (currency === 'USD' || gstRequired !== 'Yes') return 0;
  const base = (parseFloat(perDay) || 0) * (parseFloat(days) || 1);
  return base * 0.18;
}

function calcTotalTrainerFee(trainerFeePerDay, days) {
  return (parseFloat(trainerFeePerDay) || 0) * (parseFloat(days) || 1);
}

function calcMargin(received, totalTrainerFee) {
  return (parseFloat(received) || 0) - (parseFloat(totalTrainerFee) || 0);
}

// ── Fiscal year helpers ───────────────────────────────────────────────
function currentFYRange() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: new Date(year, 3, 1),   // 1 Apr
    end:   new Date(year + 1, 2, 31, 23, 59, 59), // 31 Mar
    label: `This FY Trainings (${year}-${String(year + 1).slice(2)})`
  };
}

function inCurrentFY(dateStr) {
  if (!dateStr) return false;
  const { start, end } = currentFYRange();
  const d = new Date(dateStr + 'T00:00:00');
  return d >= start && d <= end;
}

// ── Date parsing ─────────────────────────────────────────────────────
/** Parse DD-MM-YYYY or DD/MM/YYYY → YYYY-MM-DD for date inputs */
function parseDMY(val) {
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Excel serial date number
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400 * 1000));
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  return '';
}

/** Parse a numeric value safely */
function parseNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// ── Export to CSV ─────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
