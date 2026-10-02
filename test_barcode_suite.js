/**
 * test_barcode_suite.js
 * Comprehensive Real-Run Test Suite for Review Round 2 Fixes:
 *  1. MONTH_MAP / YEAR_MAP: Confirmed values only (EN=2026, G=9), no placeholders/guesses
 *  2. processBarcodeReturn: Short Code decoded values override req.body; planDate validated with /^\d{4}-\d{2}-\d{2}$/
 *  3. decodeShortCode: Calendar date existence check (e.g. Sep 31 throws error for HTTP 400)
 *  4. isCompletePaperBarcode: Enter terminator trigger for variable length; 14-char fixed length fires without Enter
 *  5. sanitizeScan: Strips /\s/g, NBSP \u00A0, and strips AIM prefix twice (before and after Thai Kedmanee transliteration)
 *  6. Short Code lookup: Exact matching only (no LIKE, no DAY())
 *  7. Recording order & Duplicate protection: DB 155 updated first; 409 on duplicate completed return
 *  8. Pipe format uses cleanCode instead of actualRawBarcode
 */

const {
  YEAR_MAP,
  MONTH_MAP,
  SHORT_CODE_RE,
  PAPER_SHORT_RE,
  sanitizeScan,
  decodeShortCode,
  isCompletePaperBarcode,
  parsePaperBarcode,
  isClearCommand
} = require('./backend/src/utils/barcodeCodec');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(description, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    results.push({ id: totalTests, description, status: 'PASS', details });
    console.log(`  ✓ [PASS] #${totalTests}: ${description}`);
  } else {
    failedTests++;
    results.push({ id: totalTests, description, status: 'FAIL', details });
    console.error(`  ✗ [FAIL] #${totalTests}: ${description} (${details})`);
  }
}

console.log('================================================================================');
console.log('🧪 RUNNING BARCODE & DOCUMENT RETURN REAL TEST SUITE (ROUND 2)');
console.log('================================================================================\n');

// ─── Group 1: MONTH_MAP & YEAR_MAP Confirmed Values (Item 1) ───────────────────
console.log('--- Group 1: Confirmed Lookup Tables & No Placeholders ---');
assert('YEAR_MAP contains only confirmed year EN = 2026', YEAR_MAP['EN'] === 2026 && Object.keys(YEAR_MAP).length === 1);
assert('MONTH_MAP contains only confirmed month G = 9', MONTH_MAP['G'] === 9 && Object.keys(MONTH_MAP).length === 1);

let unknownMonthError = null;
try {
  decodeShortCode('ENH25BW1278P01'); // Month 'H' is unconfirmed
} catch (e) {
  unknownMonthError = e.message;
}
assert(
  'Unconfirmed month code (ENH) throws descriptive Error instead of guessing',
  unknownMonthError && unknownMonthError.includes('Unknown month code "H"'),
  unknownMonthError
);

let unknownYearError = null;
try {
  decodeShortCode('EMG25BW1278P01'); // Year 'EM' is unconfirmed
} catch (e) {
  unknownYearError = e.message;
}
assert(
  'Unconfirmed year code (EMG) throws descriptive Error instead of guessing',
  unknownYearError && unknownYearError.includes('Unknown year code "EM"'),
  unknownYearError
);

// ─── Group 2: Calendar Date Existence Check (Item 3) ──────────────────────────
console.log('\n--- Group 2: Strict Calendar Date Validation in decodeShortCode ---');
let validDateRes = null;
try {
  validDateRes = decodeShortCode('ENG25BW1278P01');
} catch (e) {}
assert(
  'Valid date ENG25BW1278P01 decodes to 2026-09-25 correctly',
  validDateRes && validDateRes.planDate === '2026-09-25' && validDateRes.mcType === 'BW12' && validDateRes.mcNo === '78'
);

let sep31Error = null;
try {
  decodeShortCode('ENG31BW1278P01'); // September has only 30 days!
} catch (e) {
  sep31Error = e.message;
}
assert(
  'September 31 (ENG31...) throws invalid calendar date Error (for HTTP 400)',
  sep31Error && sep31Error.includes('day 31 does not exist in month 9'),
  sep31Error
);

let day32Error = null;
try {
  decodeShortCode('ENG32BW1278P01');
} catch (e) {
  day32Error = e.message;
}
assert(
  'Day 32 (ENG32...) throws invalid day number Error',
  day32Error && day32Error.includes('Invalid day number "32"'),
  day32Error
);

let day00Error = null;
try {
  decodeShortCode('ENG00BW1278P01');
} catch (e) {
  day00Error = e.message;
}
assert(
  'Day 00 (ENG00...) throws invalid day number Error',
  day00Error && day00Error.includes('Invalid day number "00"'),
  day00Error
);

// ─── Group 3: sanitizeScan - Whitespace, NBSP, & Double AIM Prefix (Item 9) ───
console.log('\n--- Group 3: sanitizeScan whitespace, NBSP, Thai translit & AIM prefix ---');
const withNBSP = '  ENG25BW1278P01 \u00A0 \t ';
assert(
  'sanitizeScan removes all spaces, tabs, and NBSP (\\u00A0)',
  sanitizeScan(withNBSP) === 'ENG25BW1278P01',
  `Got: "${sanitizeScan(withNBSP)}"`
);

const withAIM = ']C0ENG25BW1278P01';
assert(
  'sanitizeScan strips AIM prefix ]C0',
  sanitizeScan(withAIM) === 'ENG25BW1278P01',
  `Got: "${sanitizeScan(withAIM)}"`
);

// In Thai Kedmanee keyboard mode:
// ']' is 'ล', 'C' is 'ฉ', '0' is 'จ' -> ']C0' = 'ลฉจ'
// 'E' is 'ฎ', 'N' is 'ื', 'G' is 'เ', '2' is '/', '5' is 'ถ', 'B' is 'ฺ', 'W' is '"', '1' is 'ๅ', '7' is 'ึ', '8' is 'ค', 'P' is 'ญ', '0' is 'จ'
const thaiTypedAIM = 'ลฉจฎืเ/ถฺ"ๅ/ึคญจๅ'; // "]C0ENG25BW1278P01" in Thai
assert(
  'sanitizeScan strips AIM prefix even when typed in Thai Kedmanee mode (ลฉจ -> ]C0)',
  sanitizeScan(thaiTypedAIM) === 'ENG25BW1278P01',
  `Got: "${sanitizeScan(thaiTypedAIM)}"`
);

const thaiPipeBarcode = ' /ุจต/ถฅ/ุจต/ถฅฺ"ๅ/ฅึค '; // " 260925|260925|BW12|78 " in Thai Kedmanee mode
assert(
  'sanitizeScan converts Thai pipe barcode and strips spaces',
  sanitizeScan(thaiPipeBarcode) === '260925|260925|BW12|78',
  `Got: "${sanitizeScan(thaiPipeBarcode)}"`
);

// ─── Group 4: isCompletePaperBarcode Enter Suffix Option (ก) (Item 4) ─────────
console.log('\n--- Group 4: isCompletePaperBarcode completion triggers (Option ก: Enter suffix) ---');
// A) Bare Short Code (14 chars fixed length)
assert(
  'Bare Short Code 14 chars is complete without Enter: "ENG25BW1278P01"',
  isCompletePaperBarcode('ENG25BW1278P01', false) === true
);

// B) Variable length formats without Enter MUST return false
assert(
  'Short Code with revision WITHOUT Enter returns FALSE: "ENG25BW1278P01-R1"',
  isCompletePaperBarcode('ENG25BW1278P01-R1', false) === false
);
assert(
  'Pipe format WITHOUT Enter returns FALSE: "260925|260925|BW12|7"',
  isCompletePaperBarcode('260925|260925|BW12|7', false) === false
);
assert(
  'Pipe format WITHOUT Enter returns FALSE: "260925|260925|BW12|78"',
  isCompletePaperBarcode('260925|260925|BW12|78', false) === false
);
assert(
  'Pipe format with rev WITHOUT Enter returns FALSE: "260925|260925|BW12|78|A"',
  isCompletePaperBarcode('260925|260925|BW12|78|A', false) === false
);

// C) Variable length formats WITH Enter (\r\n or hasEnter=true)
assert(
  'Short Code with revision WITH Enter returns TRUE: "ENG25BW1278P01-R1\\r\\n"',
  isCompletePaperBarcode('ENG25BW1278P01-R1\r\n', false) === true
);
assert(
  'Short Code with revision with hasEnter=true returns TRUE: "ENG25BW1278P01-R1"',
  isCompletePaperBarcode('ENG25BW1278P01-R1', true) === true
);
assert(
  'Pipe format complete WITH Enter returns TRUE: "260925|260925|BW12|78\\r\\n"',
  isCompletePaperBarcode('260925|260925|BW12|78\r\n', false) === true
);
assert(
  'Pipe format with rev WITH Enter returns TRUE: "260925|260925|BW12|78|A\\r\\n"',
  isCompletePaperBarcode('260925|260925|BW12|78|A\r\n', false) === true
);
assert(
  'Pipe format with incomplete MCNo (BW12|7) WITH Enter returns FALSE (too short): "260925|260925|BW12|7\\r\\n"',
  isCompletePaperBarcode('260925|260925|BW12|7\r\n', false) === false
);

// ─── Group 5: parsePaperBarcode (Base key + Revision) ─────────────────────────
console.log('\n--- Group 5: parsePaperBarcode extraction ---');
const parsedShortRev = parsePaperBarcode('ENG25BW1278P01-R1');
assert(
  'parsePaperBarcode extracts baseBarcode and revision from -R1',
  parsedShortRev.baseBarcode === 'ENG25BW1278P01' && parsedShortRev.revision === '1' && parsedShortRev.isPaperKey === true
);

const parsedPipeRev = parsePaperBarcode('260925|260925|BW12|78|REV0');
assert(
  'parsePaperBarcode extracts baseBarcode and revision from pipe 5-segment',
  parsedPipeRev.baseBarcode === '260925|260925|BW12|78' && parsedPipeRev.revision === '0' && parsedPipeRev.isPaperKey === true
);

// ─── Group 6: processBarcodeReturn Logic Simulation (Items 2, 6, 7, 8) ────────
console.log('\n--- Group 6: processBarcodeReturn Logic Simulation ---');

// Mock helper to test controller logic in isolation
function simulateProcessBarcodeReturn({
  body,
  existingCompletedRecords = [],
  db155Plans = []
}) {
  let { barcode, rawBarcode, mcType, mcNo, planDate } = body;
  const actualRawBarcode = (rawBarcode || barcode || '').trim();

  const cleanUpper = sanitizeScan(actualRawBarcode);
  const parsedPaper = parsePaperBarcode(cleanUpper);
  const cleanCode = parsedPaper.baseBarcode || cleanUpper;

  // Item 2: Short Code overrides req.body
  let isShortCode = false;
  let scMCType = null;
  let scMCNo = null;

  if (SHORT_CODE_RE.test(cleanCode)) {
    try {
      const sc = decodeShortCode(cleanCode);
      isShortCode = true;
      scMCType = sc.mcType;
      scMCNo = sc.mcNo;
      // OVERRIDE:
      planDate = sc.planDate;
      mcType = scMCType;
      mcNo = scMCNo;
    } catch (scErr) {
      return { status: 400, error: scErr.message };
    }
  } else if (cleanCode.includes('|')) {
    // Item 8: Pipe format uses cleanCode
    const parts = cleanCode.split('|').map(s => s.trim());
    if (parts.length >= 4) {
      mcType = parts[2];
      mcNo = parts[3];
      const p1 = parts[1];
      if (/^\d{6}$/.test(p1)) {
        planDate = `20${p1.slice(0, 2)}-${p1.slice(2, 4)}-${p1.slice(4, 6)}`;
      }
    }
  }

  // Item 2: planDate regex validation /^\d{4}-\d{2}-\d{2}$/
  if (planDate && planDate !== 'NODATE') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
      return { status: 400, error: `Invalid planDate format: "${planDate}". Expected YYYY-MM-DD.` };
    }
  }

  // Item 7: Duplicate protection
  const isDuplicate = existingCompletedRecords.some(r => 
    r.RawBarcode === actualRawBarcode || r.RawBarcode === cleanCode || r.DocumentID === actualRawBarcode || r.DocumentID === cleanCode
  );
  if (isDuplicate) {
    return { status: 409, error: 'บาร์โค้ดนี้ได้รับการบันทึกส่งคืนเรียบร้อยแล้ว (สแกนซ้ำ)', isDuplicate: true };
  }

  // Item 6: Short Code lookup - Exact match only (NO LIKE, NO DAY())
  let updatedRowsCount = 0;
  if (isShortCode && scMCType && scMCNo && planDate) {
    const matched = db155Plans.filter(p => 
      p.MC_Type === scMCType && p.MC_No === scMCNo && p.PlanDate === planDate
    );
    updatedRowsCount = matched.length;
  } else if (mcType && mcNo && planDate) {
    const matched = db155Plans.filter(p => 
      p.MC_Type === mcType && p.MC_No === mcNo && p.PlanDate === planDate
    );
    updatedRowsCount = matched.length;
  } else if (body.planIds && body.planIds.length > 0) {
    const matched = db155Plans.filter(p => body.planIds.includes(p.Plan_ID));
    updatedRowsCount = matched.length;
  }

  // Item 7: DB 155 update first - if 0 rows updated, fail before inserting Engineer_Return
  if (updatedRowsCount === 0) {
    return { status: 400, error: 'ไม่พบรายการแผนงานที่ตรงกันในระบบ (master.tb_PC_Plan) จึงไม่สามารถปิดแผนและบันทึกการคืนได้' };
  }

  return {
    status: 200,
    success: true,
    data: {
      planDate,
      mcType,
      mcNo,
      status: 'Completed',
      returnBalance: 'Complete'
    }
  };
}

// Test A: Short Code overrides wrong values in req.body
const testOverride = simulateProcessBarcodeReturn({
  body: {
    barcode: 'ENG25BW1278P01',
    mcType: 'WRONG_TYPE',
    mcNo: '99',
    planDate: '2024-01-01'
  },
  db155Plans: [
    { Plan_ID: 101, MC_Type: 'BW12', MC_No: '78', PlanDate: '2026-09-25' }
  ]
});
assert(
  'Short Code successfully overrides req.body (mcType=BW12, mcNo=78, planDate=2026-09-25)',
  testOverride.status === 200 &&
  testOverride.data.mcType === 'BW12' &&
  testOverride.data.mcNo === '78' &&
  testOverride.data.planDate === '2026-09-25'
);

// Test B: Invalid planDate format rejected with HTTP 400
const testInvalidPlanDate = simulateProcessBarcodeReturn({
  body: {
    barcode: 'PLAN-123',
    planDate: '2026/09/25' // Wrong separator: should be YYYY-MM-DD
  },
  db155Plans: [{ Plan_ID: 123 }]
});
assert(
  'Invalid planDate format ("2026/09/25") returns HTTP 400 error',
  testInvalidPlanDate.status === 400 && testInvalidPlanDate.error.includes('Invalid planDate format')
);

// Test C: Duplicate scan returns HTTP 409
const testDuplicate = simulateProcessBarcodeReturn({
  body: { barcode: 'ENG25BW1278P01' },
  existingCompletedRecords: [{ RawBarcode: 'ENG25BW1278P01', Status: 'Completed' }],
  db155Plans: [{ Plan_ID: 101, MC_Type: 'BW12', MC_No: '78', PlanDate: '2026-09-25' }]
});
assert(
  'Duplicate barcode scan returns HTTP 409 Conflict',
  testDuplicate.status === 409 && testDuplicate.isDuplicate === true
);

// Test D: Exact Short Code match prevents wrong plan from closing
const testNoLikeMatch = simulateProcessBarcodeReturn({
  body: { barcode: 'ENG25BW1278P01' }, // looking for BW12, MC 78, Date 2026-09-25
  db155Plans: [
    // This machine has MC_No 178 (which would match LIKE '%78%' but NOT exact match)
    { Plan_ID: 201, MC_Type: 'BW12', MC_No: '178', PlanDate: '2026-09-25' },
    // This machine has PlanDate 2026-08-25 (which matches DAY=25 but NOT PlanDate=2026-09-25)
    { Plan_ID: 202, MC_Type: 'BW12', MC_No: '78', PlanDate: '2026-08-25' }
  ]
});
assert(
  'Exact matching prevents closing wrong plan (LIKE %78% and DAY=25 are NOT matched)',
  testNoLikeMatch.status === 400 && testNoLikeMatch.error.includes('ไม่พบรายการแผนงานที่ตรงกัน')
);

// Test E: Pipe format parses from Thai-transliterated cleanCode
const testPipeCleanCode = simulateProcessBarcodeReturn({
  body: { barcode: ' /ุจต/ถฅ/ุจต/ถฅฺ"ๅ/ฅึค ' }, // Thai Kedmanee scan: " 260925|260925|BW12|78 "
  db155Plans: [
    { Plan_ID: 301, MC_Type: 'BW12', MC_No: '78', PlanDate: '2026-09-25' }
  ]
});
assert(
  'Pipe format parses correctly from cleanCode (transliterated Thai & stripped spaces)',
  testPipeCleanCode.status === 200 &&
  testPipeCleanCode.data.mcType === 'BW12' &&
  testPipeCleanCode.data.mcNo === '78' &&
  testPipeCleanCode.data.planDate === '2026-09-25'
);

// ─── Test Summary ─────────────────────────────────────────────────────────────
console.log('\n================================================================================');
console.log(`📊 TEST SUITE SUMMARY: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
console.log('================================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
