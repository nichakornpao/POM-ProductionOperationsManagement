/**
 * barcodeCodec.ts
 * Shared barcode codec for EN Document Return system.
 * All functions are framework-independent (no Angular imports).
 * sanitizeScan() MUST be called first on every raw scanner input.
 */

// ─── § 1. Confirmed Code Lookup Tables (No placeholders) ──────────────────────
//
// Structure (14 chars, 0-indexed):
//   [0-1]  Year code  2 alpha-upper  e.g. 'EN' = 2026
//   [2]    Month code 1 alpha-upper  e.g. 'G'  = September (9)
//   [3-4]  Day        2 decimal      e.g. '25'
//   [5-8]  MCType     4 alnum        e.g. 'BW12'
//   [9-10] MCNo       2 alnum        e.g. '78'
//   [11-13] PartCode  3 alnum        e.g. 'P01'
//
// ONLY user-confirmed values are included. Placeholders are strictly prohibited
// to prevent silent PlanDate corruption in database records.
export const YEAR_MAP: Record<string, number> = {
  EN: 2026
};

export const MONTH_MAP: Record<string, number> = {
  G: 9 // September
};

export const MONTH_CHAR: Record<number, string> = Object.fromEntries(
  Object.entries(MONTH_MAP).map(([k, v]) => [v, k])
);

/**
 * Generic Short Code regex — NOT hard-coded to 'ENG'.
 * Matches exactly 14 chars: 3 alpha-upper + 2 digit + 9 alnum-upper.
 * PASS: 'ENG25BW1278P01'
 * FAIL: 'ENG25BW1278P0' (13), 'eng25bw1278p01' (lowercase — sanitize first)
 */
export const SHORT_CODE_RE = /^[A-Z]{3}[0-9]{2}[A-Z0-9]{9}$/;

/**
 * Paper barcode regex: 14-char Short Code base + '-R' + 1-4 alnum revision token.
 * PASS: 'ENG25BW1278P01-R0', 'ENG25BW1278P01-RA', 'ENG25BW1278P01-RREV0'
 * FAIL: 'ENG25BW1278P01-R' (no token), 'ENG25BW1278P01' (no suffix)
 */
export const PAPER_SHORT_RE = /^[A-Z]{3}[0-9]{2}[A-Z0-9]{9}-R[A-Z0-9]{1,4}$/;

// ─── § 2. Thai Kedmanee → Latin map ──────────────────────────────────────────
export const THAI_KEDMANEE: Record<string, string> = {
  // Row 1 (Numbers / Symbols)
  'ๅ': '1', '+': '!',
  '/': '2', '๑': '@',
  '-': '3', '๒': '#',
  'ภ': '4', '๓': '$',
  'ถ': '5', '๔': '%',
  'ุ': '6', 'ู': '^',
  'ึ': '7', '฿': '&',
  'ค': '8', '๕': '*',
  'ต': '9', '๖': '(',
  'จ': '0', '๗': ')',
  'ข': '-', '๘': '_',
  'ช': '=', '๙': '+',
  // Row 2
  'ๆ': 'q', '๐': 'Q',
  'ไ': 'w', '"': 'W',
  'ำ': 'e', 'ฎ': 'E',
  'พ': 'r', 'ฑ': 'R',
  'ะ': 't', 'ธ': 'T',
  'ั': 'y', 'ํ': 'Y',
  'ี': 'u', '๊': 'U',
  'ร': 'i', 'ณ': 'I',
  'น': 'o', 'ฯ': 'O',
  'ย': 'p', 'ญ': 'P',
  'บ': '[', 'ฐ': '{',
  'ล': ']', ',': '}',
  'ฃ': '\\', 'ฅ': '|',
  // Row 3
  'ฟ': 'a', 'ฤ': 'A',
  'ห': 's', 'ฆ': 'S',
  'ก': 'd', 'ฏ': 'D',
  'ด': 'f', 'โ': 'F',
  'เ': 'g', 'ฌ': 'G',
  '้': 'h', '็': 'H',
  '่': 'j', '๋': 'J',
  'า': 'k', 'ษ': 'K',
  'ส': 'l', 'ศ': 'L',
  'ว': ';', 'ซ': ':',
  'ง': "'", '.': '"',
  // Row 4
  'ผ': 'z', '(': 'Z',
  'ป': 'x', ')': 'X',
  'แ': 'c', 'ฉ': 'C',
  'อ': 'v', 'ฮ': 'V',
  'ิ': 'b', 'ฺ': 'B',
  'ื': 'n', '์': 'N',
  'ท': 'm', '?': 'M',
  'ม': ',', 'ฒ': '<',
  'ใ': '.', 'ฬ': '>',
  'ฝ': '/', 'ฦ': '?'
};

function thaiToLatin(s: string): string {
  let out = '';
  for (const ch of s) {
    out += (THAI_KEDMANEE[ch] !== undefined) ? THAI_KEDMANEE[ch] : ch;
  }
  return out;
}

// ─── § 3. Alt-Numpad decode helpers ──────────────────────────────────────────
function decodeChunks(digits: string, chunkSize: number): string | null {
  let out = '';
  for (let i = 0; i < digits.length; i += chunkSize) {
    const code = parseInt(digits.substring(i, i + chunkSize), 10);
    if (code < 32 || code > 126) return null;
    out += String.fromCharCode(code);
  }
  return out.length >= 4 ? out : null;
}

function tryAltNumpadDecode(digits: string): string | null {
  if (digits.length % 4 === 0 && /^0[03-9]\d\d|0[01][0-9]\d/.test(digits)) {
    const r = decodeChunks(digits, 4);
    if (r) return r;
  }
  if (digits.length % 3 === 0 && /^0[3-9]\d|1[01]\d/.test(digits)) {
    const r = decodeChunks(digits, 3);
    if (r) return r;
  }
  if (digits.length % 2 === 0 && (digits.startsWith('69') || digits.startsWith('65'))) {
    const r = decodeChunks(digits, 2);
    if (r) return r;
  }
  return null;
}

// ─── § 4. sanitizeScan ───────────────────────────────────────────────────────
/**
 * Sanitize raw scanner string.
 * Steps:
 *  1. Strip AIM Code ID prefix (]C0, ]Q0, etc.)
 *  2. Strip control chars, zero-width, NBSP (\u00A0), and ALL whitespace (/\s/g)
 *  3. Alt-Numpad decode if numeric >= 8 chars
 *  4. Thai Kedmanee transliteration if Thai characters present
 *  5. Strip AIM prefix AGAIN (in case AIM prefix was typed in Thai mode e.g. ลฉจ -> ]C0)
 *  6. Strip any residual whitespace and toUpperCase()
 */
export function sanitizeScan(raw: string): string {
  if (!raw) return '';
  let s = String(raw);

  // 1. Strip AIM prefix first
  s = s.replace(/^\][A-Za-z0-9]{2}/, '');

  // 2. Strip control chars, zero-width, NBSP, and ALL whitespace everywhere
  s = s.replace(/[\x00-\x1F\x7F\s\u00A0\u200B\u200C\u200D\uFEFF]/g, '');
  if (!s) return '';

  // 3. Alt-Numpad decode if pure numeric
  if (/^\d+$/.test(s) && s.length >= 8) {
    const decoded = tryAltNumpadDecode(s);
    if (decoded) s = decoded;
  }

  // 4. Thai transliteration (only if Thai characters are present)
  if (/[\u0E00-\u0E7F]/.test(s)) {
    s = thaiToLatin(s);
  }

  // 5. Strip AIM prefix AGAIN in case it was transliterated from Thai mode
  s = s.replace(/^\][A-Za-z0-9]{2}/, '');

  // 6. Strip any residual spaces/NBSP and uppercase
  s = s.replace(/[\s\u00A0]/g, '').toUpperCase();

  return s;
}

// ─── § 5. CLEAR command detection ────────────────────────────────────────────
/**
 * Returns true if sanitized string is a ##CLEAR## command.
 * Uses endsWith so accidental prefix garbage still triggers reset.
 * Bare 'CLEAR' is intentionally NOT accepted to avoid colliding with part names/remarks.
 */
export function isClearCommand(sanitized: string): boolean {
  if (!sanitized) return false;
  return sanitized.endsWith('##CLEAR##');
}

// ─── § 6. isCompletePaperBarcode ─────────────────────────────────────────────
/**
 * Determines if a barcode is complete and ready for auto-processing.
 * Strategy: Option (ก) Enter suffix is the primary terminator for variable-length inputs.
 *
 * Rules:
 *   A) Bare Short Code (14 chars):
 *      Matches SHORT_CODE_RE exactly. Has strictly fixed length of 14 characters.
 *      Complete even without Enter suffix.
 *   B) Variable-length formats (Paper key with -R revision token, Pipe format):
 *      Cannot determine end of input by content alone (e.g. -R1 might be -R12,
 *      BW12|7 might be BW12|78, or BW12|78 might still have |A coming).
 *      REQUIRES Enter terminator (\r, \n, or hasEnter = true) to be considered complete.
 */
export function isCompletePaperBarcode(raw: string, hasEnter = false): boolean {
  if (!raw) return false;
  const endsWithEnter = typeof raw === 'string' && /[\r\n]$/.test(raw);
  const isTerminated = hasEnter || endsWithEnter;
  const sanitized = sanitizeScan(raw);
  if (!sanitized || sanitized.length < 8) return false;

  // A) Bare Short Code 14 chars: fixed length, complete immediately
  if (SHORT_CODE_RE.test(sanitized)) {
    return true;
  }

  // B) Variable length formats: require Enter terminator
  if (isTerminated) {
    if (PAPER_SHORT_RE.test(sanitized)) return true;
    if (sanitized.includes('|')) {
      if (sanitized.endsWith('|')) return false;
      const segs = sanitized.split('|');
      const lastSeg = segs[segs.length - 1].trim();
      if (!lastSeg) return false;
      if (segs.length === 4 && segs[3].length < 2) return false;
      return segs.length === 5 || segs.length === 4;
    }
  }

  return false;
}

// ─── § 7. parsePaperBarcode ──────────────────────────────────────────────────
export interface ParsedPaperBarcode {
  baseBarcode: string;
  revision: string | null;
  isPaperKey: boolean;
}

/**
 * Parse sanitized paper barcode → base job key + revision string.
 */
export function parsePaperBarcode(sanitized: string): ParsedPaperBarcode {
  if (!sanitized) return { baseBarcode: '', revision: null, isPaperKey: false };

  // 1. Matches -R<rev> without fixed-length regex on base (Requirement 2)
  const m = sanitized.match(/^(.+)-R([A-Z0-9]+)$/);
  if (m) {
    return { baseBarcode: m[1], revision: m[2], isPaperKey: true };
  }

  // 2. Pipe 5-segment (e.g. 260925|260925|BW12|78|0 or |R0)
  if (sanitized.includes('|')) {
    const segs = sanitized.split('|');
    if (segs.length === 5 && segs[4].trim()) {
      const rawRev = segs[4].trim();
      const rev = rawRev.replace(/^REV/i, '').replace(/^R(?=[A-Z0-9])/i, '');
      return { baseBarcode: segs.slice(0, 4).join('|'), revision: rev || rawRev, isPaperKey: true };
    }
    if (segs.length === 4 && !sanitized.endsWith('|')) {
      return { baseBarcode: sanitized, revision: null, isPaperKey: false };
    }
  }

  return { baseBarcode: sanitized, revision: null, isPaperKey: false };
}

export function formatShortCodeForItem(item: any): string {
  if (!item) return '';
  const planVal = item.PlanDate || item.planDate || item.date || item.DateTime_Record;
  let dayStr = '01';
  if (planVal) {
    const d = new Date(planVal);
    if (!isNaN(d.getTime())) {
      dayStr = String(d.getDate()).padStart(2, '0');
    } else if (typeof planVal === 'string') {
      const m = planVal.match(/[-/](\d{2})$/) || planVal.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) dayStr = m[m.length - 1];
    }
  }

  let mc = (item.MC_Type || item.MCType || 'MC').trim().toUpperCase().replace(/[\s-]/g, '');
  let mcNo = (item.MC_No || item.MCNo || '01').trim().replace(/[\s,]/g, '');

  let procSuffix = 'P01';
  if (item.Process && typeof item.Process === 'string') {
    const matchP = item.Process.match(/P\d+/i);
    if (matchP) procSuffix = matchP[0].toUpperCase();
  }

  return `ENG${dayStr}${mc}${mcNo}${procSuffix}`;
}

export function formatPipeBarcodeForItem(item: any): string {
  if (!item) return '';
  const toShortDateStr = (dateVal: any) => {
    if (!dateVal) return 'NODATE';
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yy}${mm}${dd}`;
      }
      return 'NODATE';
    } catch (_) {
      return 'NODATE';
    }
  };
  const recVal = item.DateTime_Record || item.DateTimeRecordStr || item.recordTime || item.ScanTime || item.CreatedAt;
  const planVal = item.PlanDate || item.planDate || item.date;
  const recordDateShort = toShortDateStr(recVal) !== 'NODATE' ? toShortDateStr(recVal) : toShortDateStr(planVal);
  const planDateShort = toShortDateStr(planVal) !== 'NODATE' ? toShortDateStr(planVal) : recordDateShort;
  const mc = (item.MC_Type || item.MCType || '-').trim();
  let rawMcNo = (item.MC_No || item.MCNo || '-').trim();
  if (rawMcNo !== '-') {
    rawMcNo = rawMcNo.replace(/\s*,\s*/g, ',').replace(/\s+/g, '');
  }
  return `${recordDateShort}|${planDateShort}|${mc}|${rawMcNo}`;
}

export function formatBarcodeForItem(item: any, mode: 'short' | 'pipe' = 'short'): string {
  return mode === 'pipe' ? formatPipeBarcodeForItem(item) : formatShortCodeForItem(item);
}

// ─── § 8. decodeShortCode ────────────────────────────────────────────────────
export interface ShortCodeParts {
  yearCode: string;
  monthCode: string;
  year: number;
  month: number;
  day: number;
  mcType: string;
  mcNo: string;
  partCode: string;
  planDate: string; // 'YYYY-MM-DD'
}

/**
 * Decode a sanitized 14-char Short Code into its constituent parts.
 *
 * Throws descriptive Error (for HTTP 400 response):
 *  - If not 14-char format
 *  - If year code not in confirmed YEAR_MAP (no guessing)
 *  - If month code not in confirmed MONTH_MAP (no guessing)
 *  - If calendar date is invalid (e.g. September 31 or Feb 30)
 *
 * MCType = chars[5..8] = 4 chars (e.g. 'BW12')
 * MCNo   = chars[9..10] = 2 chars (e.g. '78')
 * PartCode = chars[11..13] = 3 chars (e.g. 'P01')
 */
export function decodeShortCode(code: string): ShortCodeParts {
  if (!SHORT_CODE_RE.test(code)) {
    throw new Error(`[barcodeCodec] Not a valid 14-char Short Code: "${code}"`);
  }
  const yearCode  = code.substring(0, 2);
  const monthCode = code.charAt(2);
  const dayStr    = code.substring(3, 5);
  const mcType    = code.substring(5, 9);   // slice(5, 9) = 4 chars
  const mcNo      = code.substring(9, 11);  // slice(9, 11) = 2 chars
  const partCode  = code.substring(11, 14); // slice(11, 14) = 3 chars

  const year = YEAR_MAP[yearCode];
  if (!year) {
    throw new Error(
      `[barcodeCodec] Unknown year code "${yearCode}" in "${code}". ` +
      `Known: ${Object.keys(YEAR_MAP).join(', ')}`
    );
  }

  const month = MONTH_MAP[monthCode];
  if (!month) {
    throw new Error(
      `[barcodeCodec] Unknown month code "${monthCode}" in "${code}". ` +
      `Known: ${Object.keys(MONTH_MAP).join(', ')}`
    );
  }

  const day = parseInt(dayStr, 10);
  if (isNaN(day) || day < 1 || day > 31) {
    throw new Error(`[barcodeCodec] Invalid day number "${dayStr}" in "${code}"`);
  }

  // Strict Calendar Date Validation (e.g. Sep 31, Feb 30 must throw error)
  const dObj = new Date(year, month - 1, day);
  if (
    dObj.getFullYear() !== year ||
    dObj.getMonth() !== month - 1 ||
    dObj.getDate() !== day
  ) {
    throw new Error(
      `[barcodeCodec] Invalid calendar date: day ${day} does not exist in month ${month} (${year}-${String(month).padStart(2, '0')})`
    );
  }

  const planDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { yearCode, monthCode, year, month, day, mcType, mcNo, partCode, planDate };
}
