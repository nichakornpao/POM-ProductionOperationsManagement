const { poolPromise, poolPbgm8gPromise } = require("../config/database");
const sql = require("mssql");



exports.importIReport = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).send({ message: "No file uploaded." });
    }

    const pool = await poolPromise;

    // --- XLSX Parsing ---
    console.log(`[Import IReport] Reading file from buffer...`);
    const workbook = require('xlsx').read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return res.status(400).send({ message: "Sheet not found" });
    }

    const items = require('xlsx').utils.sheet_to_json(worksheet);
    const totalItems = items.length;

    if (totalItems === 0) {
      return res.status(400).send({ message: "File is empty or no data found." });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    console.log(`[Import IReport] Parsed ${totalItems} items. Starting import...`);

    // Helper to find value with fuzzy key matching
    const findValue = (item, candidates) => {
      const itemKeys = Object.keys(item);
      // 1. Exact match
      for (const key of candidates) {
        if (item[key] !== undefined && item[key] !== null) return item[key];
      }
      // 2. Case-insensitive
      for (const key of candidates) {
        const lowerKey = key.toLowerCase();
        const foundKey = itemKeys.find(k => k.toLowerCase() === lowerKey);
        if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null) return item[foundKey];
      }
      return null;
    };

    const getInt = (val) => (val === "" || val == null || isNaN(Number(val))) ? 0 : Number(val);
    const getFloat = (val) => (val === "" || val == null || isNaN(Number(val))) ? 0 : Number(val);
    const getString = (val) => (val === "" || val == null) ? null : String(val).trim();
    const getStringSafe = (val, def = '') => (val === "" || val == null) ? def : String(val).trim();
    const getDate = (val) => {
      if (!val) return new Date();
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date() : d;
    }

    // Batch Processing Configuration
    const BATCH_SIZE = 1000; // Process 1000 items at a time

    const processItem = async (item, index) => {
      try {
        const request = pool.request();

        // Map based on SP Params
        request.input('_DIVISION', sql.NVarChar(50), getStringSafe(findValue(item, ['DIVISION', 'Division']), 'Unknown'));
        request.input('_DEPARTMENT', sql.NVarChar(50), getStringSafe(findValue(item, ['DEPARTMENT', 'Department']), 'Unknown'));
        request.input('_ITEM_NO', sql.NVarChar(50), getStringSafe(findValue(item, ['ITEM_NO', 'Item No', 'Item No.']), 'Unknown'));
        request.input('_ITEM_NAME', sql.NVarChar(50), getStringSafe(findValue(item, ['ITEM_NAME', 'Item Name']), 'Unknown'));
        request.input('_SPEC', sql.NVarChar(50), getStringSafe(findValue(item, ['SPEC', 'Spec']), '-'));

        request.input('_PO_NO', sql.NVarChar(50), getString(findValue(item, ['PO_NO', 'PO No'])));
        request.input('_MO_NO', sql.NVarChar(50), getString(findValue(item, ['MO_NO', 'MO No'])));
        request.input('_ACCOUNT_CODE', sql.NVarChar(50), getString(findValue(item, ['ACCOUNT_CODE', 'Account Code'])));

        request.input('_QUANTITY', sql.Int, getInt(findValue(item, ['QUANTITY', 'Quantity', 'Qty'])));
        request.input('_AMOUNT', sql.Float, getFloat(findValue(item, ['AMOUNT', 'Amount'])));

        request.input('_VENDOR', sql.NVarChar(50), getString(findValue(item, ['VENDOR', 'VendorCode', 'Vendor'])));
        request.input('_VENDOR_NAME', sql.NVarChar(50), getString(findValue(item, ['VENDOR_NAME', 'Vendor Name'])));
        request.input('_DOCUMENT_NO', sql.NVarChar(50), getString(findValue(item, ['DOCUMENT_NO', 'Document No'])));

        request.input('_TRANSACTION_DATE', sql.DateTime, getDate(findValue(item, ['TRANSACTION_DATE', 'Transaction Date'])));

        request.input('_ORGANIZE_CODE', sql.NVarChar(50), getString(findValue(item, ['ORGANIZE_CODE', 'Organize Code'])));
        request.input('_ORGANIZE_NAME', sql.NVarChar(50), getString(findValue(item, ['ORGANIZE_NAME', 'Organize Name'])));

        request.input('_DATA_TYPE', sql.NVarChar(50), getStringSafe(findValue(item, ['DATA_TYPE', 'Data Type']), 'Upload'));
        request.input('_DATA_GROUP', sql.NVarChar(50), getStringSafe(findValue(item, ['DATA_GROUP', 'Data Group']), 'General'));

        request.input('_REPLY_DATE', sql.NVarChar(50), getStringSafe(findValue(item, ['REPLY_DATE', 'Reply Date']), '-'));
        request.input('_LAST_UPDATE_OPERATOR', sql.NVarChar(50), getStringSafe(findValue(item, ['LAST_UPDATE_OPERATOR', 'Operator', 'Update By']), 'System'));
        request.input('_DESC', sql.NVarChar(50), getString(findValue(item, ['DESC', 'Description', 'Remark'])));

        // Execute in db_Cost_Data_Centralized
        await request.execute('[db_Cost_Data_Centralized].[trans].[Stored_tb_FactorySupplyExpense_History_Insert]');
        successCount++;
      } catch (err) {
        console.error(`[Import IReport] Error at row ${index}:`, err);
        errorCount++;
        errors.push(`Row ${index + 1}: ${err.message}`);
      }
    };

    // Execute in batches
    for (let i = 0; i < totalItems; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((item, batchIndex) => processItem(item, i + batchIndex));
      await Promise.all(batchPromises);

      // Optional: Log progress
      if ((i + BATCH_SIZE) % 1000 < BATCH_SIZE) {
        console.log(`[Import IReport] Progress: ${Math.min(i + BATCH_SIZE, totalItems)}/${totalItems} finished.`);
      }
    }

    console.log(`[Import IReport] Finished. Success: ${successCount}, Errors: ${errorCount}`);

    if (errorCount > 0) {
      res.status(207).send({
        message: `Imported ${successCount} items. Failed ${errorCount} items.`,
        count: successCount,
        errors: errors
      });
    } else {
      res.status(200).send({ message: "Import successful", count: successCount });
    }

  } catch (err) {
    console.error("Import IReport Error:", err);
    res.status(500).send({ message: err.message || "Internal Server Error", error: err.message });
  }
};


exports.syncMasterToolingGM = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    await request.execute('[db_Tooling].[trans].[Stored_Mapping_All_GM_Tooling_Load]');

    res.status(200).json({ message: "GM Master Tooling synchronized successfully", success: true });
  } catch (err) {
    console.error("Sync Master Tooling GM Error:", err);
    res.status(500).json({ message: "Error syncing GM Master Tooling", error: err.message });
  }
};


exports.importMasterToolingPMC = async (req, res) => {
  try {
    let file = req.file;
    if (!file && req.files && req.files.file) {
      // Support for express-fileupload
      file = {
        buffer: req.files.file.data,
        originalname: req.files.file.name,
        mimetype: req.files.file.mimetype
      };
    }

    if (!file) {
      return res.status(400).send({ message: "No file uploaded." });
    }

    const pool = await poolPromise;
    const uploadedBy = req.body?.uploadedBy || 'System';

    // --- XLSX Parsing (Server Side) ---
    console.log(`[Import Master Tooling PMC] Reading file from buffer...`);
    const workbook = require('xlsx').read(file.buffer, { type: 'buffer' });

    // Assume data is in the first sheet or specific sheet
    let sheetName = workbook.SheetNames[0];
    if (workbook.SheetNames.includes('Forecast')) sheetName = 'Forecast';

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return res.status(400).send({ message: "Sheet not found" });
    }

    // --- Pre-process: Convert Excel error cells to text strings ---
    // Excel errors (#N/A, #DIV/0!, etc.) are stored as error type cells.
    // The xlsx library returns them as error codes (numbers) or undefined,
    // NOT as the literal strings "#N/A" / "#DIV/0!" that the SP expects.
    // This step converts error cells to their text representation.
    const XLSX = require('xlsx');
    const ERROR_MAP = {
      0x00: '#NULL!',
      0x07: '#DIV/0!',
      0x0F: '#VALUE!',
      0x17: '#REF!',
      0x1D: '#NAME?',
      0x24: '#NUM!',
      0x2A: '#N/A',
      0x2B: '#GETTING_DATA'
    };

    if (worksheet['!ref']) {
      const wsRange = XLSX.utils.decode_range(worksheet['!ref']);
      for (let R = wsRange.s.r; R <= wsRange.e.r; R++) {
        for (let C = wsRange.s.c; C <= wsRange.e.c; C++) {
          const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddr];
          if (cell && cell.t === 'e') {
            // Convert error cell to string type
            cell.t = 's';
            cell.v = cell.w || ERROR_MAP[cell.v] || '#ERROR';
            delete cell.w;
          }
        }
      }
      console.log('[Import Master Tooling PMC] Pre-processed Excel error cells to text strings.');
    }

    // Find Header Row Logic
    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    let headerRowIndex = 0;
    const keywords = ['item no', 'itemno', 'division'];

    for (let i = 0; i < Math.min(aoa.length, 20); i++) {
      const row = aoa[i];
      if (row && row.some(cell => {
        if (typeof cell !== 'string') return false;
        const val = cell.toLowerCase();
        return keywords.some(k => val.includes(k));
      })) {
        headerRowIndex = i;
        break;
      }
    }

    // Parse to JSON Array
    const items = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
    const totalItems = items.length;

    console.log(`[Import Master Tooling PMC] Parsed ${totalItems} items from Excel.`);

    if (totalItems === 0) {
      return res.status(400).send({ message: "File is empty or no data found." });
    }

    // Helper functions
    const findValue = (item, candidates) => {
      const itemKeys = Object.keys(item);
      for (const key of candidates) {
        if (item[key] !== undefined && item[key] !== null) return item[key];
      }
      for (const key of candidates) {
        const lowerKey = key.toLowerCase().trim();
        const foundKey = itemKeys.find(k => k.toLowerCase().trim() === lowerKey);
        if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null) return item[foundKey];
      }
      return null;
    };

    const getString = (val, maxLen = 250) => {
      if (val === "" || val == null) return null;
      let str = String(val).trim();
      // Clean non-printable garbage to avoid breaking DB columns
      str = str.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, "");
      return str.length > maxLen ? str.substring(0, maxLen) : str;
    };

    // Map items to plain JSON object with keys expected by SP
    // All values use getString() to pass raw Excel data โ€” SP handles cleansing
    const mappedItems = items.map((item, index) => {
      return {
        ExcelRow: index + 2,

        Spec: getString(findValue(item, ['Spec']), 200),
        PartNo: getString(findValue(item, ['PartNo', 'Part No', 'Part No.']), 50),
        ItemNo: getString(findValue(item, ['ItemNo', 'Item No', 'Item No.']), 50),
        Process: getString(findValue(item, ['Process']), 50),
        MC: getString(findValue(item, ['MC']), 50),
        DwgRev: getString(findValue(item, ['DwgRev', 'Dwg Rev']), 50),
        DwgUpdate: getString(findValue(item, ['DwgUpdate', 'Dwg Update']), 50),
        Usage_pcs: getString(findValue(item, ['Usage_pcs', 'Usage pcs']), 50),
        CT_sec: getString(findValue(item, ['CT_sec', 'CT sec']), 50),
        Position: getString(findValue(item, ['Position']), 50),
        Res: getString(findValue(item, ['Res.', 'Res']), 50),
        Date_update: getString(findValue(item, ['Date update', 'Date_update']), 100),
        Insert_Maker: getString(findValue(item, ['Insert Maker', 'Insert_Maker']), 100),
        Holder_Spec: getString(findValue(item, ['Holder Spec', 'Holder_Spec']), 100),
        Holder_No: getString(findValue(item, ['Holder No', 'Holder_No']), 50), // Screenshot: "Holder No"
        Holder_Maker: getString(findValue(item, ['Holder Maker', 'Holder_Maker']), 100), // Screenshot: "Holder Maker"
        Conner: getString(findValue(item, ['Conner']), 50), // Screenshot: "Conner"
        Usage_Conner: getString(findValue(item, ['Usage/Conner', 'Usage_Conner']), 50), // Screenshot: "Usage/Conner"
        Cutting_Layout_No: getString(findValue(item, ['Cutting Layout No.', 'Cutting_Layout_No']), 50), // Screenshot: "Cutting Layout No."
        Cutting_Layout_Rev: getString(findValue(item, ['Cutting Layout Rev.', 'Cutting_Layout_Rev']), 50), // Screenshot: "Cutting Layout Rev."
        Program_cutting_No: getString(findValue(item, ['Program cutting No.', 'Program_cutting_No']), 50), // Screenshot: "Program cutting No."
        Position_Code: getString(findValue(item, ['Position Code', 'Holder Position']), 50), // Screenshot: "Position Code"
        Fac: getString(findValue(item, ['Fac', 'Facility', 'FAC']), 50) // Added Fac mapping for new SP
      };
    });

    const jsonString = JSON.stringify(mappedItems);

    console.log(`[Import Master Tooling PMC] Sending JSON to SP [trans].[Stored_Import_Master_Tooling_PMC_JSON]...`);

    const request = pool.request();
    request.timeout = 300000; // 5 minutes timeout prevent db cancel
    request.input('JsonData', sql.NVarChar(sql.MAX), jsonString);
    request.input('UploadedBy', sql.NVarChar(100), uploadedBy);
    // ★ PHASE 9: Resolve Recorder_ID_Internal from Employee_ID string
    let recorderIdPMC = null;
    const empIdPMC = req.query?.employeeId;
    if (empIdPMC) {
      const empLookup = await pool.request()
        .input('EmpID', sql.NVarChar(50), empIdPMC)
        .query('SELECT ID_Employee FROM [dbo].[tb_CuttingTool_Employee] WHERE Employee_ID = @EmpID');
      if (empLookup.recordset.length > 0) recorderIdPMC = empLookup.recordset[0].ID_Employee;
    }
    console.log(`[DEBUG PMC] employeeId="${empIdPMC}" → Recorder_ID_Internal=${recorderIdPMC}`);
    request.input('Recorder_ID_Internal', sql.Int, recorderIdPMC);

    // Execute SP
    // SP now returns either:
    //   - Rows with { PartNo, Process, MC, ExcelRow } โ’ validation failed (unmatched parts)
    //   - Empty recordset โ’ import succeeded
    const result = await request.execute('[trans].[Stored_Import_Master_Tooling_PMC_JSON]');

    console.log(`[Import Master Tooling PMC] SP execution complete.`);

    const rows = result.recordset || [];

    if (rows.length > 0 && rows[0].PartNo !== undefined) {
      // Validation failed โ€” SP returned the list of all unmatched records
      // Distinct by PartNo for terminal log (first occurrence per PartNo)
      const distinctRows = [];
      const seen = new Set();
      for (const r of rows) {
        if (!seen.has(r.PartNo)) {
          seen.add(r.PartNo);
          distinctRows.push(r);
        }
      }
      console.warn(`[Import Master Tooling PMC] โ Validation failed: ${rows.length} row(s), ${distinctRows.length} distinct Part No. not found:`);
      // Group by Process for terminal log
      const grouped = new Map();
      for (const r of distinctRows) {
        const proc = r.Process || '(No Process)';
        if (!grouped.has(proc)) grouped.set(proc, []);
        grouped.get(proc).push(r);
      }
      let no = 1;
      for (const [proc, list] of grouped) {
        console.warn(`\n  โ”€โ”€ Process: ${proc} (${list.length} Part No.) โ”€โ”€`);
        list.forEach(r => {
          console.warn(`    ${String(no++).padStart(3)}. PartNo: ${r.PartNo} | MC: ${r.MC || '-'}`);
        });
      }
      console.warn(''); // blank line at end
      return res.status(200).send({
        message: `Import completed: Valid records imported successfully into Master Tooling. Warning: ${rows.length} row(s) with unregistered Part Numbers were skipped.`,
        totalInputRows: totalItems,
        unmatchedRows: rows  // full list to frontend: [{ PartNo, Process, MC, ExcelRow }, ...]
      });
    }

    // Success
    res.status(200).send({
      message: 'Import successful',
      totalInputRows: totalItems
    });

  } catch (err) {
    console.error("Import Master Tooling PMC Error:", err);

    // Check if it's our custom SQL Validation error
    if (err.message && err.message.includes('Upload Validation Failed')) {
      return res.status(400).send({
        message: err.message, // Send specific message to frontend
        error: "Validation Error"
      });
    }

    res.status(500).send({
      message: err.message || "Internal Server Error",
      error: err.message,
      code: err.code
    });
  }
};

// ===============================================
// GM Master Tooling Import
// ===============================================
exports.importMasterToolingGM = async (req, res) => {
  try {
    let file = req.file;
    if (!file && req.files && req.files.file) {
      // Support for express-fileupload
      file = {
        buffer: req.files.file.data,
        originalname: req.files.file.name,
        mimetype: req.files.file.mimetype
      };
    }

    if (!file) {
      return res.status(400).send({ message: "No file uploaded." });
    }

    const pool = await poolPromise;
    const uploadedBy = req.body?.uploadedBy || 'System';

    // --- XLSX Parsing (Server Side) ---
    console.log(`[Import Master Tooling GM] Reading file from buffer...`);
    const workbook = require('xlsx').read(file.buffer, { type: 'buffer' });

    // Assume data is in the first sheet or specific sheet
    let sheetName = workbook.SheetNames[0];
    if (workbook.SheetNames.includes('Forecast')) sheetName = 'Forecast';

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return res.status(400).send({ message: "Sheet not found" });
    }

    // --- Pre-process: Convert Excel error cells to text strings ---
    const XLSX = require('xlsx');
    const ERROR_MAP = {
      0x00: '#NULL!',
      0x07: '#DIV/0!',
      0x0F: '#VALUE!',
      0x17: '#REF!',
      0x1D: '#NAME?',
      0x24: '#NUM!',
      0x2A: '#N/A',
      0x2B: '#GETTING_DATA'
    };

    if (worksheet['!ref']) {
      const wsRange = XLSX.utils.decode_range(worksheet['!ref']);
      for (let R = wsRange.s.r; R <= wsRange.e.r; R++) {
        for (let C = wsRange.s.c; C <= wsRange.e.c; C++) {
          const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddr];
          if (cell && cell.t === 'e') {
            // Convert error cell to string type
            cell.t = 's';
            cell.v = cell.w || ERROR_MAP[cell.v] || '#ERROR';
            delete cell.w;
          }
        }
      }
      console.log('[Import Master Tooling GM] Pre-processed Excel error cells to text strings.');
    }

    // Find Header Row Logic
    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    let headerRowIndex = 0;
    const keywords = ['item no', 'itemno', 'division'];

    for (let i = 0; i < Math.min(aoa.length, 20); i++) {
      const row = aoa[i];
      if (row && row.some(cell => {
        if (typeof cell !== 'string') return false;
        const val = cell.toLowerCase();
        return keywords.some(k => val.includes(k));
      })) {
        headerRowIndex = i;
        break;
      }
    }

    // Parse to JSON Array
    const items = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
    const totalItems = items.length;

    console.log(`[Import Master Tooling GM] Parsed ${totalItems} items from Excel.`);

    if (totalItems === 0) {
      return res.status(400).send({ message: "File is empty or no data found." });
    }

    // Helper functions
    const findValue = (item, candidates) => {
      const itemKeys = Object.keys(item);
      for (const key of candidates) {
        if (item[key] !== undefined && item[key] !== null) return item[key];
      }
      for (const key of candidates) {
        const lowerKey = key.toLowerCase().trim();
        const foundKey = itemKeys.find(k => k.toLowerCase().trim() === lowerKey);
        if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null) return item[foundKey];
      }
      return null;
    };

    const getString = (val, maxLen = 250) => {
      if (val === "" || val == null) return null;
      let str = String(val).trim();
      str = str.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, "");
      return str.length > maxLen ? str.substring(0, maxLen) : str;
    };

    // Map items to plain JSON object with keys expected by SP
    const mappedItems = items.map((item, index) => {
      return {
        ExcelRow: index + 2,

        Spec: getString(findValue(item, ['Spec']), 200),
        PartNo: getString(findValue(item, ['PartNo', 'Part No', 'Part No.']), 50),
        ItemNo: getString(findValue(item, ['ItemNo', 'Item No', 'Item No.']), 50),
        Process: getString(findValue(item, ['Process']), 50),
        MC: getString(findValue(item, ['MC']), 50),
        DwgRev: getString(findValue(item, ['DwgRev', 'Dwg Rev']), 50),
        DwgUpdate: getString(findValue(item, ['DwgUpdate', 'Dwg Update']), 50),
        Usage_pcs: getString(findValue(item, ['Usage_pcs', 'Usage pcs']), 50),
        CT_sec: getString(findValue(item, ['CT_sec', 'CT sec']), 50),
        Position: getString(findValue(item, ['Position']), 50),
        Res: getString(findValue(item, ['Res.', 'Res']), 50),
        Date_update: getString(findValue(item, ['Date update', 'Date_update']), 100),
        Insert_Maker: getString(findValue(item, ['Insert Maker', 'Insert_Maker']), 100),
        Holder_Spec: getString(findValue(item, ['Holder Spec', 'Holder_Spec']), 100),
        Holder_No: getString(findValue(item, ['Holder No', 'Holder_No']), 50),
        Holder_Maker: getString(findValue(item, ['Holder Maker', 'Holder_Maker']), 100),
        Conner: getString(findValue(item, ['Conner']), 50),
        Usage_Conner: getString(findValue(item, ['Usage/Conner', 'Usage_Conner']), 50),
        Cutting_Layout_No: getString(findValue(item, ['Cutting Layout No.', 'Cutting_Layout_No']), 50),
        Cutting_Layout_Rev: getString(findValue(item, ['Cutting Layout Rev.', 'Cutting_Layout_Rev']), 50),
        Program_cutting_No: getString(findValue(item, ['Program cutting No.', 'Program_cutting_No']), 50),
        Position_Code: getString(findValue(item, ['Position Code', 'Holder Position']), 50),
        Fac: getString(findValue(item, ['Fac', 'Facility', 'FAC']), 50)
      };
    });

    const jsonString = JSON.stringify(mappedItems);

    console.log(`[Import Master Tooling GM] Sending JSON to SP [trans].[Stored_Import_Master_Tooling_GM_JSON]...`);

    const request = pool.request();
    request.timeout = 300000; // 5 minutes timeout prevent db cancel
    request.input('JsonData', sql.NVarChar(sql.MAX), jsonString);
    request.input('UploadedBy', sql.NVarChar(100), uploadedBy);
    // ★ PHASE 9: Resolve Recorder_ID_Internal from Employee_ID string
    let recorderIdGM = null;
    const empIdGM = req.query?.employeeId;
    if (empIdGM) {
      const empLookup = await pool.request()
        .input('EmpID', sql.NVarChar(50), empIdGM)
        .query('SELECT ID_Employee FROM [dbo].[tb_CuttingTool_Employee] WHERE Employee_ID = @EmpID');
      if (empLookup.recordset.length > 0) recorderIdGM = empLookup.recordset[0].ID_Employee;
    }
    request.input('Recorder_ID_Internal', sql.Int, recorderIdGM);

    // Execute SP
    // SP now returns either:
    //   - Rows with { PartNo, Process, MC, ExcelRow } โ†’ validation failed (unmatched parts)
    //   - Empty recordset โ†’ import succeeded
    const result = await request.execute('[trans].[Stored_Import_Master_Tooling_GM_JSON]');

    console.log(`[Import Master Tooling GM] SP execution complete.`);

    const rows = result.recordset || [];

    if (rows.length > 0 && rows[0].PartNo !== undefined) {
      // Validation failed โ€” SP returned the list of all unmatched records
      // Distinct by PartNo for terminal log (first occurrence per PartNo)
      const distinctRows = [];
      const seen = new Set();
      for (const r of rows) {
        if (!seen.has(r.PartNo)) {
          seen.add(r.PartNo);
          distinctRows.push(r);
        }
      }
      console.warn(`[Import Master Tooling GM] ❌ Validation failed: ${rows.length} row(s), ${distinctRows.length} distinct Part No. not found:`);
      // Group by Process for terminal log
      const grouped = new Map();
      for (const r of distinctRows) {
        const proc = r.Process || '(No Process)';
        if (!grouped.has(proc)) grouped.set(proc, []);
        grouped.get(proc).push(r);
      }
      let no = 1;
      for (const [proc, list] of grouped) {
        console.warn(`\n  ── Process: ${proc} (${list.length} Part No.) ──`);
        list.forEach(r => {
          console.warn(`    ${String(no++).padStart(3)}. PartNo: ${r.PartNo} | MC: ${r.MC || '-'}`);
        });
      }
      console.warn(''); // blank line at end
      return res.status(400).send({
        message: `Import failed: ${rows.length} row(s) could not be mapped to a valid Part No. Please verify the listed items in your Excel file and try again.`,
        unmatchedRows: rows  // full list to frontend: [{ PartNo, Process, MC, ExcelRow }, ...]
      });
    }

    // Success
    res.status(200).send({
      message: 'Import successful',
      totalInputRows: totalItems
    });

  } catch (err) {
    console.error("Import Master Tooling GM Error:", err);

    // Check if it's our custom SQL Validation error
    if (err.message && err.message.includes('Upload Validation Failed')) {
      return res.status(400).send({
        message: err.message, // Send specific message to frontend
        error: "Validation Error"
      });
    }

    res.status(500).send({
      message: err.message || "Internal Server Error",
      error: err.message,
      code: err.code
    });
  }
};

exports.importPartItem2 = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).send({ message: "No file uploaded." });
    }

    let pool = await poolPbgm8gPromise;
    if (!pool) {
      return res.status(503).send({ 
        message: "Unable to connect to PBGM8G CostReduction database server.",
        error: "PBGM8G Connection Offline"
      });
    }
    console.log(`[Import PartItem2] Using PBGM8G CostReduction database connection pool`);

    // 1. Fetch table schema dynamically
    console.log(`[Import PartItem2] Fetching columns for dbo.PartItem2...`);
    const schemaResult = await pool.request().query(`
      SELECT 
        c.COLUMN_NAME, 
        c.DATA_TYPE, 
        COLUMNPROPERTY(object_id(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = 'PartItem2'
    `);

    if (schemaResult.recordset.length === 0) {
      return res.status(404).send({ message: "Table dbo.PartItem2 not found in the database. Please verify the table exists." });
    }

    // Filter out identity columns
    const columns = schemaResult.recordset.filter(col => col.IS_IDENTITY !== 1);
    const dbColNames = columns.map(c => c.COLUMN_NAME);
    const dbColNamesClean = dbColNames.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // 2. Parse Excel
    const ext = file.originalname ? file.originalname.split('.').pop().toLowerCase() : '';
    console.log(`[Import PartItem2] Parsing workbook (extension: ${ext}) from buffer...`);
    
    // xlsx library automatically parses Excel (.xlsx, .xls) and CSV (.csv) from the buffer
    const workbook = require('xlsx').read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return res.status(400).send({ message: "Sheet data not found in uploaded file." });
    }

    const XLSX = require('xlsx');
    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Dynamic Header Detection: Scan the first 20 rows to find the row that matches database columns
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(aoa.length, 20); i++) {
      const row = aoa[i];
      if (row && Array.isArray(row)) {
        const matches = row.filter(cell => {
          if (cell === null || cell === undefined) return false;
          const valClean = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
          return dbColNamesClean.includes(valClean);
        });

        if (matches.length > 0) {
          headerRowIndex = i;
          console.log(`[Import PartItem2] Detected file header row at index: ${i} with ${matches.length} matching columns.`);
          break;
        }
      }
    }

    // Convert sheet to raw json rows starting from the detected header row
    const rawItems = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
    if (rawItems.length === 0) {
      return res.status(400).send({ message: "File contains no valid data rows." });
    }

    // Get input headers from parsed raw items
    const excelHeaders = Object.keys(rawItems[0]);
    console.log(`[Import PartItem2] File columns read:`, excelHeaders);
    console.log(`[Import PartItem2] Target Database columns:`, dbColNames);

    // Helper to find key in item case-insensitively and space-insensitively
    const findValue = (item, columnName) => {
      const keys = Object.keys(item);
      const cleanName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetClean = cleanName(columnName);

      const foundKey = keys.find(k => cleanName(k) === targetClean);
      if (foundKey !== undefined) {
        return item[foundKey];
      }
      return null;
    };

    // Helper functions to parse values safely into SQL compatible types
    const parseValue = (val, dataType) => {
      if (val === undefined || val === null || val === '') return null;
      
      const type = dataType.toLowerCase();
      if (type.includes('int') || type.includes('bigint') || type.includes('smallint') || type.includes('tinyint')) {
        const num = Number(val);
        return isNaN(num) ? null : Math.floor(num);
      }
      if (type.includes('float') || type.includes('decimal') || type.includes('numeric') || type.includes('real') || type.includes('double')) {
        const num = Number(val);
        return isNaN(num) ? null : num;
      }
      if (type.includes('date') || type.includes('time')) {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      }
      return String(val).trim();
    };

    // --- REINDEX & SCHEMA VALIDATION STEP ---
    // Standardize input rows: filter out excess columns and structure data specifically to match dbo.PartItem2 schema
    console.log(`[Import PartItem2] Reindexing and validating schema...`);
    const reindexedItems = rawItems.map(rawItem => {
      const cleanItem = {};
      columns.forEach(col => {
        const val = findValue(rawItem, col.COLUMN_NAME);
        const parsedVal = parseValue(val, col.DATA_TYPE);
        if (parsedVal !== null && parsedVal !== undefined) {
          cleanItem[col.COLUMN_NAME] = parsedVal;
        }
      });
      return cleanItem;
    }).filter(item => Object.keys(item).length > 0); // Keep only rows that mapped at least one field

    // Truncate table first to clean old data
    console.log(`[Import PartItem2] Truncating table dbo.PartItem2...`);
    await pool.request().query("TRUNCATE TABLE dbo.PartItem2");

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // 3. Insert rows dynamically
    console.log(`[Import PartItem2] Starting dynamic inserts with reindexed dataset...`);
    for (let index = 0; index < reindexedItems.length; index++) {
      const item = reindexedItems[index];
      try {
        const request = pool.request();
        const colsToInsert = [];
        const paramNames = [];
        
        columns.forEach((col, colIdx) => {
          const val = item[col.COLUMN_NAME];
          if (val !== undefined && val !== null) {
            const paramName = `val_${colIdx}`;
            colsToInsert.push(`[${col.COLUMN_NAME}]`);
            paramNames.push(`@${paramName}`);
            
            // Map parameter type
            const type = col.DATA_TYPE.toLowerCase();
            if (type.includes('int')) {
              request.input(paramName, sql.Int, val);
            } else if (type.includes('float') || type.includes('decimal') || type.includes('numeric') || type.includes('real') || type.includes('double')) {
              request.input(paramName, sql.Float, val);
            } else if (type.includes('date') || type.includes('time')) {
              request.input(paramName, sql.DateTime, val);
            } else {
              request.input(paramName, sql.NVarChar(sql.MAX), val);
            }
          }
        });

        if (colsToInsert.length > 0) {
          const query = `
            INSERT INTO dbo.PartItem2 (${colsToInsert.join(', ')})
            VALUES (${paramNames.join(', ')})
          `;
          await request.query(query);
          successCount++;
        }
      } catch (rowErr) {
        console.error(`[Import PartItem2] Error at row ${index}:`, rowErr);
        errorCount++;
        errors.push(`Row ${index + 2}: ${rowErr.message}`);
      }
    }

    console.log(`[Import PartItem2] Import completed. Success: ${successCount}, Errors: ${errorCount}`);

    if (successCount === 0) {
      return res.status(400).send({
        message: "No rows were imported because no column headers in the Excel file matched the database columns.",
        excelHeaders: excelHeaders,
        databaseColumns: dbColNames
      });
    }

    if (errorCount > 0) {
      res.status(207).send({
        message: `Imported ${successCount} items. Failed ${errorCount} items.`,
        success: true,
        count: successCount,
        errors: errors
      });
    } else {
      res.status(200).send({
        message: "Import successful",
        success: true,
        count: successCount
      });
    }
  } catch (err) {
    console.error("Import PartItem2 Error:", err);
    res.status(500).send({ message: err.message || "Internal Server Error", success: false });
  }
};

// Purge PartItem2 on PBGM8G CostReduction DB
exports.purgePartItem2 = async (req, res) => {
  try {
    const pool = await poolPbgm8gPromise;
    if (!pool) {
      return res.status(503).send({ 
        message: "Unable to connect to PBGM8G CostReduction database server.",
        error: "PBGM8G Connection Offline"
      });
    }
    console.log(`[Purge PartItem2] Truncating table dbo.PartItem2 on PBGM8G...`);
    await pool.request().query("TRUNCATE TABLE dbo.PartItem2");
    res.status(200).send({ message: "Table dbo.PartItem2 purged successfully.", success: true });
  } catch (err) {
    console.error("Purge PartItem2 Error:", err);
    res.status(500).send({ message: err.message || "Internal Server Error", success: false });
  }
};

// Get PartItem2 latest 100 rows and dynamic column schema
exports.getPartItem2 = async (req, res) => {
  try {
    const pool = await poolPbgm8gPromise;
    if (!pool) {
      return res.status(503).send({ 
        message: "Unable to connect to PBGM8G CostReduction database server.",
        error: "PBGM8G Connection Offline"
      });
    }

    // 1. Get column metadata
    console.log(`[Get PartItem2] Querying columns for dbo.PartItem2...`);
    const schemaResult = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, 
             COLUMNPROPERTY(object_id(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'PartItem2'
    `);

    if (schemaResult.recordset.length === 0) {
      return res.status(404).send({ message: "Table dbo.PartItem2 not found in the database. Please verify the table exists." });
    }

    const columns = schemaResult.recordset.map(col => col.COLUMN_NAME);

    // 2. Detect identity column to sort by latest
    const identityCol = schemaResult.recordset.find(col => col.IS_IDENTITY === 1);
    let orderQuery = "";
    if (identityCol) {
      orderQuery = `ORDER BY [${identityCol.COLUMN_NAME}] DESC`;
    }

    // 3. Fetch top 100 rows
    console.log(`[Get PartItem2] Fetching top 100 rows...`);
    const dataResult = await pool.request().query(`
      SELECT TOP 100 *
      FROM dbo.PartItem2
      ${orderQuery}
    `);

    res.status(200).json({
      columns: columns,
      data: dataResult.recordset
    });
  } catch (err) {
    console.error("Get PartItem2 Error:", err);
    res.status(500).send({ message: err.message || "Internal Server Error" });
  }
};

