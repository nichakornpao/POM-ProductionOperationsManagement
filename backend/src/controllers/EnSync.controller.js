const xlsx = require('xlsx');
const sql = require('mssql');
const { poolPromise, poolRequestIndirrecPromise } = require('../config/database');
const { 
    sanitizeScan, 
    SHORT_CODE_RE, 
    decodeShortCode, 
    parsePaperBarcode,
    formatShortCodeForItem,
    formatPipeBarcodeForItem,
    formatBarcodeForItem
} = require('../utils/barcodeCodec');
const dbConfig = {
    user: 'Cost_Team',
    password: 'Cost@User1',
    server: 'PBGM8G\\SQLEXPRESS',
    database: 'RequestindirrecMaterial',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const excelPath = '\\\\fs1\\GM\\blackamoor\\Issue-Return record1.xlsx';

async function performSync() {
    let pool;
    try {
        console.log('[EN SYNC CRON] Connecting to DB...');
        pool = await sql.connect(dbConfig);
        
        console.log('[EN SYNC CRON] Reading Excel file from EN...');
        // อ่านไฟล์เป็น Buffer เพื่อปิดการเชื่อมต่อไฟล์ทันที ป้องกันไฟล์ล็อค
        const fs = require('fs');
        const fileBuffer = fs.readFileSync(excelPath);
        const workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: true, dense: true });
        const sheetName = workbook.SheetNames[0]; // Sheet ชื่อ 'Database'
        
        // อ่านแบบ raw array (header:1) เพื่อ map ด้วย column index ตรงๆ
        const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: false });
        
        // Column index จากที่เราตรวจสอบแล้ว:
        // 0=Item, 1=Date/Time, 2=Subscript part no., 3=Process, 5=Machine No., 6=Location,
        // 7=Req. DWG., 9=Requestor, 10=Status, 14=DWG. Returned, 18=Product Group, 19=Master Part No.
        const COL = {
            item: 0, date: 1, subscriptPart: 2, process: 3,
            mcNo: 5, fac: 6,
            reqDwg: 7, requestor: 9, status: 10,
            dwgReturned: 14, returnBalance: 15, recordBy: 16, productGroup: 18, masterPart: 19
        };
        
        let upsertCount = 0;
        let skipCount = 0;
        
        const pathUpdates = {}; // เก็บ PartNo -> pathDwg mapping สำหรับอัพเดท tb_PC_Plan
        
        // เริ่มจาก row index 2 (ข้าม header row[0] และ asterisk row[1])
        for (let i = 2; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || !row[COL.item]) { skipCount++; continue; }
            
            const requestNo = row[COL.item].toString().trim();
            if (!requestNo || requestNo === '*') { skipCount++; continue; }
            
            const partNo        = row[COL.masterPart]   ? row[COL.masterPart].toString().trim()   : (row[COL.subscriptPart] ? row[COL.subscriptPart].toString().trim() : null);
            const status        = row[COL.status]        ? row[COL.status].toString().trim()        : null;
            const process       = row[COL.process]       ? row[COL.process].toString().trim()       : null;
            const mcNo          = row[COL.mcNo]          ? row[COL.mcNo].toString().trim()          : null;
            const fac           = row[COL.fac]           ? row[COL.fac].toString().trim()           : null;
            const productGroup  = row[COL.productGroup]  ? row[COL.productGroup].toString().trim()  : '';
            
            let division = 'GM';
            if (productGroup && productGroup.toUpperCase().includes('PMC')) {
                division = 'PMC';
            }
            
            const reqQty        = row[COL.reqDwg]        ? parseInt(row[COL.reqDwg])  || 0          : 0;
            const returnQty     = row[COL.dwgReturned]   ? parseInt(row[COL.dwgReturned]) || 0      : 0;
            const returnBalance = row[COL.returnBalance] !== null && row[COL.returnBalance] !== undefined
                                    ? parseInt(row[COL.returnBalance]) || 0
                                    : (reqQty - returnQty);
            const requestor     = row[COL.requestor]     ? row[COL.requestor].toString().trim()     : '';
            const recordBy      = row[COL.recordBy]      ? row[COL.recordBy].toString().trim()      : '';
            
            let requestDate = null;
            if (row[COL.date]) {
                requestDate = row[COL.date] instanceof Date ? row[COL.date] : new Date(row[COL.date]);
                if (isNaN(requestDate.getTime())) requestDate = null;
            }
            
            let pathDwg = '';
            if (productGroup && partNo) {
                pathDwg = `\\\\pbp083\\Public\\Process Engineer\\Doc. ENG\\DWG. Control\\${productGroup}\\${partNo}`;
                pathUpdates[partNo] = pathDwg;
            }
            
            await pool.request()
                .input('RequestNo',  sql.VarChar,  requestNo)
                .input('PartNo',     sql.VarChar,  partNo)
                .input('PathDwg',    sql.NVarChar, pathDwg)
                .input('PathLayout', sql.NVarChar, pathDwg)
                .input('Status',     sql.VarChar,  status)
                .input('ReqQty',       sql.Int,      reqQty)
                .input('ReturnQty',    sql.Int,      returnQty)
                .input('ReturnBalance',sql.Int,      returnBalance)
                .input('RequestDate',  sql.DateTime, requestDate)
                .input('Requestor',    sql.VarChar,  requestor)
                .input('RecordBy',     sql.NVarChar, recordBy)
                .input('Process',      sql.NVarChar, process)
                .input('Division',     sql.NVarChar, division)
                .input('MCNo',         sql.VarChar,  mcNo)
                .input('Fac',          sql.VarChar,  fac)
                .query(`
                    IF EXISTS (SELECT 1 FROM dbo.EngineerPMCpart WHERE RequestNo = @RequestNo)
                    BEGIN
                        UPDATE dbo.EngineerPMCpart 
                        SET Status = @Status, PartNo = @PartNo, PathDwg = @PathDwg, PathLayout = @PathLayout, 
                            ReqQty = @ReqQty, ReturnQty = @ReturnQty, ReturnBalance = @ReturnBalance,
                            RequestDate = @RequestDate, Requestor = @Requestor, RecordBy = @RecordBy,
                            Process = @Process, Division = @Division, MCNo = @MCNo, Fac = @Fac,
                            UpdatedAt = GETDATE()
                        WHERE RequestNo = @RequestNo
                    END
                    ELSE
                    BEGIN
                        INSERT INTO dbo.EngineerPMCpart (RequestNo, PartNo, PathDwg, PathLayout, Status, ReqQty, ReturnQty, ReturnBalance, RequestDate, Requestor, RecordBy, Process, Division, MCNo, Fac)
                        VALUES (@RequestNo, @PartNo, @PathDwg, @PathLayout, @Status, @ReqQty, @ReturnQty, @ReturnBalance, @RequestDate, @Requestor, @RecordBy, @Process, @Division, @MCNo, @Fac)
                    END
                `);
            upsertCount++;
            
            if (upsertCount % 500 === 0) {
                console.log(`[EN SYNC CRON] Progress: ${upsertCount} records synced...`);
            }
        }
        
        console.log(`[EN SYNC CRON] Done! Synced ${upsertCount} records. Skipped ${skipCount}.`);
        
        // Update paths in master.tb_PC_Plan - DISABLED (Switched to manual path entry)
        /*
        console.log(`[EN SYNC CRON] Updating paths in master.tb_PC_Plan...`);
        try {
            const mainPool = await poolPromise;
            const uniqueUpdates = Object.keys(pathUpdates).map(partNo => ({
                partNo,
                pathDwg: pathUpdates[partNo]
            }));
            
            let batchSql = '';
            for (let i = 0; i < uniqueUpdates.length; i++) {
                const { partNo, pathDwg } = uniqueUpdates[i];
                const safePartNo = partNo.replace(/'/g, "''");
                const safePath = pathDwg.replace(/'/g, "''");
                // อัพเดทเฉพาะแถวที่ยังไม่มี path หรือให้เขียนทับไปเลย
                batchSql += `
                    UPDATE [master].[tb_PC_Plan] 
                    SET Path_Dwg = CASE WHEN (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN '${safePath}' ELSE Path_Dwg END,
                        Path_Layout = CASE WHEN (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN '${safePath}' ELSE Path_Layout END,
                        Path_Dwg_Source = CASE WHEN (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN 'auto' ELSE Path_Dwg_Source END,
                        Path_Layout_Source = CASE WHEN (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN 'auto' ELSE Path_Layout_Source END
                    WHERE PartNo = '${safePartNo}'
                      AND (PlanDate >= DATEADD(month, -1, GETDATE()) OR PlanDate IS NOT NULL)
                      AND ((Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') OR (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual'));
                `;
                
                if ((i + 1) % 50 === 0 || i === uniqueUpdates.length - 1) {
                    await mainPool.request().query(batchSql);
                    batchSql = '';
                }
            }
            console.log(`[EN SYNC CRON] master.tb_PC_Plan updated successfully.`);
            
            // ─────────────────────────────────────────────────────────────────
            // NEW: Auto-Map Local PDF Files to Empty Paths in master.tb_PC_Plan
            // ─────────────────────────────────────────────────────────────────
            console.log(`[EN SYNC CRON] Starting Local PDF Auto-Mapping...`);
            try {
                const fs = require('fs');
                const path = require('path');
                const searchRoots = [
                    String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`,
                    String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`,
                    String.raw`\\pbgm06\D\PartEN PMC`
                ];
                
                function classifyByPath(filePath) {
                    const lower = filePath.toLowerCase();
                    if (['layout', 'lay'].some(k => lower.includes(k))) return 'layout';
                    return 'dwg'; // Fallback to DWG for standard process drawing PDFs
                }

                async function findPdfsDeepAsync(dir, signal, depth = 0) {
                    if (depth > 5 || (signal && signal.aborted)) return [];
                    let results = [];
                    try {
                        const fsPromises = require('fs').promises;
                        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                        for (const e of entries) {
                            if (signal && signal.aborted) return results;
                            const full = path.join(dir, e.name);
                            if (e.isDirectory()) {
                                if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
                                const subResults = await findPdfsDeepAsync(full, signal, depth + 1);
                                results = results.concat(subResults);
                            } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
                                results.push(full);
                            }
                        }
                    } catch (_) {}
                    return results;
                }

                const missingPathsResult = await mainPool.request().query("SELECT DISTINCT PartNo FROM master.tb_PC_Plan WHERE (Path_Dwg IS NULL OR Path_Layout IS NULL OR Path_Dwg = '' OR Path_Layout = '' OR Path_Dwg = '-' OR Path_Layout = '-') AND (PlanDate >= DATEADD(month, -1, GETDATE()) OR PlanDate IS NOT NULL)");
                
                let allPdfs = [];
                for (const r of searchRoots) {
                    if (fs.existsSync(r)) {
                        const found = await findPdfsDeepAsync(r, null);
                        allPdfs = allPdfs.concat(found);
                    }
                }
                let updatedCount = 0;
                let autoMapSql = '';

                for (let i = 0; i < missingPathsResult.recordset.length; i++) {
                    const row = missingPathsResult.recordset[i];
                    const searchKey = (row.PartNo || '').trim().toUpperCase();
                    if (!searchKey) continue;

                    const matchedPdfs = allPdfs.filter(pdf => {
                        return path.basename(pdf).toUpperCase().includes(searchKey) || pdf.toUpperCase().includes(searchKey);
                    });

                    if (matchedPdfs.length > 0) {
                        let foundDwg = null;
                        let foundLayout = null;
                        for (const pdf of matchedPdfs) {
                            const type = classifyByPath(pdf);
                            if (type === 'layout' && !foundLayout) foundLayout = pdf;
                            if (type === 'dwg' && !foundDwg) foundDwg = pdf;
                        }
                        // Strict matching: Only assign if explicit DWG or Layout keyword is present
                        
                        const safeDwg = foundDwg ? foundDwg.replace(/'/g, "''") : '';
                        const safeLayout = foundLayout ? foundLayout.replace(/'/g, "''") : '';
                        
                        autoMapSql += `
                            UPDATE [master].[tb_PC_Plan] 
                            SET Path_Dwg = CASE WHEN '${safeDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN '${safeDwg}' ELSE Path_Dwg END,
                                Path_Layout = CASE WHEN '${safeLayout}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN '${safeLayout}' ELSE Path_Layout END,
                                Path_Dwg_Source = CASE WHEN '${safeDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN 'auto' ELSE Path_Dwg_Source END,
                                Path_Layout_Source = CASE WHEN '${safeLayout}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN 'auto' ELSE Path_Layout_Source END
                            WHERE PartNo = '${searchKey.replace(/'/g, "''")}'
                              AND (PlanDate >= DATEADD(month, -1, GETDATE()) OR PlanDate IS NOT NULL)
                              AND ((Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') OR (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual'));
                        \n`;
                        updatedCount++;
                    }

                    // Execute batch every 50 records or at the end
                    if (autoMapSql && ((i + 1) % 50 === 0 || i === missingPathsResult.recordset.length - 1)) {
                        await mainPool.request().query(autoMapSql);
                        autoMapSql = '';
                    }
                }
                console.log(`[EN SYNC CRON] Auto-Mapped ${updatedCount} parts successfully.`);
            } catch (autoErr) {
                console.error(`[EN SYNC CRON] Error during Auto-Mapping:`, autoErr);
            }
            
        } catch (err) {
            console.error(`[EN SYNC CRON] Error updating master.tb_PC_Plan:`, err);
        }
        */
        
        return { success: true, count: upsertCount, message: `Synced ${upsertCount} records from EN (skipped ${skipCount} empty rows).` };
    } catch (err) {
        console.error('[EN SYNC CRON ERROR]', err);
        return { success: false, error: err.message };
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}


// API endpoint for "Sync Now" button
exports.syncNow = async (req, res) => {
    console.log('[API] Force EN Sync requested by user...');
    const result = await performSync();
    if (result.success) {
        return res.status(200).json(result);
    } else {
        return res.status(500).json(result);
    }
};

// Export performSync to run on intervals
exports.performSync = performSync;

// ─────────────────────────────────────────────────────────────────────────────
// API: GET /api/en-sync/auto-path?partNo=OT-1234
// ค้นหาไฟล์ PDF DWG และ Layout ใน LOCAL FOLDER: backend/uploads/en-drawings/{partNo}/
// EN เพียงแค่ copy โฟลเดอร์ PartNo มาวางไว้ที่นี่ ระบบจะหาให้อัตโนมัติ
// ─────────────────────────────────────────────────────────────────────────────
exports.autoFindPath = async (req, res) => {
    const fs   = require('fs');
    const path = require('path');

    try {
        const { partNo, mcNo, groupId, planId } = req.query;
        if (!partNo && !mcNo) {
            return res.status(400).json({ error: 'partNo or mcNo is required' });
        }

        const searchKey = (partNo || mcNo || '').trim();

        const searchRoots = [
            String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`,
            String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`,
            String.raw`\\pbgm06\D\PartEN PMC`
        ];

        // Filename/Path keywords for classification
        const DWG_KEYWORDS    = ['dwg', 'drawing', 'process'];
        const LAYOUT_KEYWORDS = ['layout', 'lay'];

        function classifyByPath(filePath) {
            const lower = filePath.toLowerCase();
            if (LAYOUT_KEYWORDS.some(k => lower.includes(k))) return 'layout';
            if (DWG_KEYWORDS.some(k => lower.includes(k)))    return 'dwg';
            return 'unknown';
        }

        // Deep search for PDFs (max depth 5) using async with AbortSignal
        async function findPdfsDeepAsync(dir, signal, depth = 0) {
            if (depth > 5 || (signal && signal.aborted)) return [];
            let results = [];
            try {
                const fsPromises = require('fs').promises;
                const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (signal && signal.aborted) return results;
                    const full = path.join(dir, e.name);
                    if (e.isDirectory()) {
                        // Skip obsolete folders to avoid wrong files
                        if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
                        const subResults = await findPdfsDeepAsync(full, signal, depth + 1);
                        results = results.concat(subResults);
                    }
                    else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
                        results.push(full);
                    }
                }
            } catch (_) {}
            return results;
        }

        // Check if user manually cleared/deleted paths for this specific row in tb_PC_Plan
        let dwgIsManualCleared = false;
        let layoutIsManualCleared = false;

        if (groupId || planId) {
            const pool = await poolPromise;
            const reqDb = pool.request();
            let whereClause = '';
            if (groupId) {
                reqDb.input('GroupId', sql.NVarChar, groupId);
                whereClause = 'GroupId = @GroupId';
            } else {
                reqDb.input('PlanId', sql.Int, planId);
                whereClause = 'Plan_ID = @PlanId';
            }
            const manualCheck = await reqDb.query(`
                SELECT 
                    MAX(CASE WHEN Path_Dwg_Source = 'manual' AND (Path_Dwg IS NULL OR Path_Dwg = '' OR Path_Dwg = '-') THEN 1 ELSE 0 END) AS DwgIsManualCleared,
                    MAX(CASE WHEN Path_Layout_Source = 'manual' AND (Path_Layout IS NULL OR Path_Layout = '' OR Path_Layout = '-') THEN 1 ELSE 0 END) AS LayoutIsManualCleared
                FROM [master].[tb_PC_Plan]
                WHERE ${whereClause}
            `);
            dwgIsManualCleared = manualCheck.recordset[0]?.DwgIsManualCleared === 1;
            layoutIsManualCleared = manualCheck.recordset[0]?.LayoutIsManualCleared === 1;
        }

        if (dwgIsManualCleared && layoutIsManualCleared) {
            return res.status(200).json({
                pathDwg: null,
                pathLayout: null,
                autoFound: false,
                searchKey,
                absPathDwg: null,
                absPathLayout: null,
                message: 'Paths were manually cleared by user for this item - skipping auto find'
            });
        }

        // 2. Find all PDFs in the search folders (with 4 second timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        
        let allPdfs = [];
        try {
            for (const rootDir of searchRoots) {
                if (fs.existsSync(rootDir)) {
                    const pdfsInRoot = await findPdfsDeepAsync(rootDir, controller.signal);
                    allPdfs = allPdfs.concat(pdfsInRoot);
                }
            }
            clearTimeout(timeoutId);
        } catch (err) {
            clearTimeout(timeoutId);
        }
        
        if (controller.signal.aborted) {
            console.log('[AUTO PATH] Search aborted due to timeout.');
            return res.status(504).json({ error: 'Scan timed out - manual entry required' });
        }

        // 3. Filter PDFs that match the Part No / search key
        const matchedPdfs = allPdfs.filter(pdf => {
            const filename = path.basename(pdf).toUpperCase();
            const fullUpper = pdf.toUpperCase();
            const key = searchKey.toUpperCase();
            // Match filename or the parent folder name
            return filename.includes(key) || fullUpper.includes(key);
        });

        // Natural numeric sort descending (03g > 02g > 01g -> picks latest 03g)
        matchedPdfs.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

        // 4. Classify matched PDFs
        for (const pdf of matchedPdfs) {
            const type = classifyByPath(pdf);
            if (type === 'layout' && !foundLayout) foundLayout = pdf;
            if (type === 'dwg'    && !foundDwg)    foundDwg    = pdf;
        }

        // Fallback if classification failed
        if (!foundDwg && !foundLayout && matchedPdfs.length > 0)  foundDwg    = matchedPdfs[0];
        if (!foundLayout && matchedPdfs.length > 1)               foundLayout = matchedPdfs[1];
        if (!foundDwg    && matchedPdfs.length > 0)               foundDwg    = matchedPdfs[0];

        // Zero out if marked as manual cleared
        if (dwgIsManualCleared) foundDwg = null;
        if (layoutIsManualCleared) foundLayout = null;

        // Convert absolute paths → API URL paths for serving
        const toApiUrl = (absPath) => {
            if (!absPath) return null;
            const rel = path.relative(uploadsRoot, absPath).replace(/\\/g, '/');
            return `/api/en-files?file=${encodeURIComponent(rel)}`;
        };

        return res.status(200).json({
            pathDwg:    toApiUrl(foundDwg),
            pathLayout: toApiUrl(foundLayout),
            autoFound:  !!(foundDwg || foundLayout),
            searchKey,
            // Also expose absolute paths for direct DB storage (backward compat)
            absPathDwg:    foundDwg    || null,
            absPathLayout: foundLayout || null,
        });

    } catch (err) {
        console.error('[AUTO PATH ERROR]', err);
        return res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// API: GET /api/en-files?file=...
// Serve PDF files stored locally in uploads/en-drawings/
// ─────────────────────────────────────────────────────────────────────────────
exports.serveLocalFile = (req, res) => {
    const fs   = require('fs');
    const path = require('path');
    const uploadsRoot = String.raw`\\pbgm06\D\PartEN PMC`;

    // Get the relative path from the query parameter
    const relPath = req.query.file; 
    if (!relPath) return res.status(400).json({ error: 'file query parameter required' });

    const absPath = path.resolve(uploadsRoot, relPath);

    // Security: must stay inside uploadsRoot
    if (!absPath.startsWith(uploadsRoot)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(absPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(absPath)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.removeHeader('X-Frame-Options');
    res.sendFile(absPath);
};

// API endpoint to fetch history data for frontend
exports.getHistory = async (req, res) => {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT RequestNo, PartNo, ReqQty, ReturnQty, RequestDate, Requestor, Status, PathDwg, PathLayout, RecordBy, Process, Division, MCNo, Fac
            FROM dbo.EngineerPMCpart
            ORDER BY RequestDate DESC
        `);
        
        let historyData = result.recordset;


        res.status(200).json(historyData);
    } catch(err) {
        console.error('[EN SYNC GET ERROR]', err);
        res.status(500).json({error: err.message});
    } finally {
        if(pool) await pool.close();
    }
};

// API endpoint for Barcode Scanning
exports.scanBarcode = async (req, res) => {
    const { requestNo, scannedBy } = req.body;
    if (!requestNo) return res.status(400).json({ error: 'Barcode is required' });

    let pool;
    try {
        pool = await sql.connect(dbConfig);
        
        const partResult = await pool.request()
            .input('RequestNo', sql.VarChar, requestNo)
            .query(`SELECT PartNo FROM dbo.EngineerPMCpart WHERE RequestNo = @RequestNo`);
            
        const partNo = partResult.recordset.length > 0 ? partResult.recordset[0].PartNo : 'Unknown';

        await pool.request()
            .input('DocumentID', sql.VarChar, requestNo)
            .input('PartNo', sql.VarChar, partNo)
            .input('ActionType', sql.VarChar, 'Return')
            .input('ScannedBy', sql.VarChar, scannedBy || 'PC')
            .query(`
                INSERT INTO dbo.Engineer_Return (DocumentID, PartNo, ActionType, ScannedBy)
                VALUES (@DocumentID, @PartNo, @ActionType, @ScannedBy)
            `);
            
        res.status(200).json({ success: true, message: `สแกนคืนสำเร็จ: ${requestNo}` });
    } catch (err) {
        console.error('[SCAN ERROR]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (pool) await pool.close();
    }
};


// API endpoint for Monthly Stats (last 6 months)
exports.getMonthlyStats = async (req, res) => {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT 
                FORMAT(RequestDate, 'yyyy-MM') AS YearMonth,
                COUNT(*) AS TotalRecords,
                SUM(CASE WHEN Status = 'Wait Issue' THEN 1 ELSE 0 END) AS WaitIssue,
                SUM(CASE WHEN Status = 'Issue Completed' THEN 1 ELSE 0 END) AS IssueCompleted
            FROM dbo.EngineerPMCpart
            WHERE RequestDate >= DATEADD(MONTH, -5, GETDATE())
            GROUP BY FORMAT(RequestDate, 'yyyy-MM')
            ORDER BY YearMonth DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('[MONTHLY STATS ERROR]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (pool) await pool.close();
    }
};

// API endpoint for Dashboard Stats (ข้อมูลจาก EN ทั้งหมด)
exports.getStats = async (req, res) => {
    let pool;
    try {
        pool = await sql.connect(dbConfig);
        
        const statsResult = await pool.request().query(`
            SELECT 
                COUNT(*) AS TotalAll,
                SUM(CASE WHEN Status = 'Wait Issue' THEN 1 ELSE 0 END) AS TotalWaitIssue,
                SUM(CASE WHEN Status = 'Issue Completed' THEN 1 ELSE 0 END) AS TotalIssueCompleted
            FROM dbo.EngineerPMCpart
        `);

        const s = statsResult.recordset[0];
        res.status(200).json({
            TotalAll: s.TotalAll || 0,
            TotalWaitIssue: s.TotalWaitIssue || 0,
            TotalIssueCompleted: s.TotalIssueCompleted || 0
        });
    } catch (err) {
        console.error('[STATS ERROR]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (pool) await pool.close();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Engineer_Return APIs (PBGM8G [RequestindirrecMaterial].[dbo].[Engineer_Return])
// ─────────────────────────────────────────────────────────────────────────────

// Helper function to get database connection for RequestindirrecMaterial
async function getIndirrecPool() {
    if (poolRequestIndirrecPromise) {
        const p = await poolRequestIndirrecPromise;
        if (p && p.connected) return { pool: p, shouldClose: false };
    }
    const directPool = await sql.connect(dbConfig);
    return { pool: directPool, shouldClose: true };
}

// GET /api/engineer-return
exports.getEngineerReturnList = async (req, res) => {
    let poolRef;
    try {
        poolRef = await getIndirrecPool();
        const result = await poolRef.pool.request().query(`
            SELECT 
                r.id,
                r.DocumentID,
                r.PartNo,
                r.ActionType,
                r.ScanTime,
                r.ScannedBy,
                r.Remarks,
                p.Process,
                p.Division,
                p.MCNo,
                p.Fac,
                p.PathDwg,
                p.PathLayout,
                p.ReqQty,
                p.ReturnQty
            FROM dbo.Engineer_Return r
            LEFT JOIN dbo.EngineerPMCpart p ON r.DocumentID = p.RequestNo
            ORDER BY r.ScanTime DESC
        `);
        res.status(200).json(result.recordset || []);
    } catch (err) {
        console.error('[GET ENGINEER RETURN ERROR]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (poolRef && poolRef.shouldClose) {
            await poolRef.pool.close();
        }
    }
};

// GET /api/engineer-return/stats
exports.getEngineerReturnStats = async (req, res) => {
    let poolRef;
    try {
        poolRef = await getIndirrecPool();
        const result = await poolRef.pool.request().query(`
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN ActionType = 'Issue' THEN 1 ELSE 0 END) AS totalIssue,
                SUM(CASE WHEN ActionType = 'Return' THEN 1 ELSE 0 END) AS totalReturn,
                SUM(CASE WHEN CAST(ScanTime AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS todayCount
            FROM dbo.Engineer_Return
        `);
        const s = result.recordset[0] || {};
        res.status(200).json({
            total: s.total || 0,
            totalIssue: s.totalIssue || 0,
            totalReturn: s.totalReturn || 0,
            todayCount: s.todayCount || 0
        });
    } catch (err) {
        console.error('[GET RETURN STATS ERROR]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (poolRef && poolRef.shouldClose) {
            await poolRef.pool.close();
        }
    }
};

// POST /api/engineer-return
exports.createEngineerReturn = async (req, res) => {
    const { documentId, partNo, actionType, scannedBy, remarks } = req.body;
    if (!documentId && !partNo) {
        return res.status(400).json({ error: 'Document ID or Part No is required' });
    }

    let poolRef;
    try {
        poolRef = await getIndirrecPool();

        let finalPartNo = partNo;
        // If PartNo not provided, try to find it from EngineerPMCpart
        if (!finalPartNo && documentId) {
            const partResult = await poolRef.pool.request()
                .input('RequestNo', sql.VarChar, documentId.trim())
                .query(`SELECT PartNo FROM dbo.EngineerPMCpart WHERE RequestNo = @RequestNo`);
            if (partResult.recordset.length > 0) {
                finalPartNo = partResult.recordset[0].PartNo;
            }
        }

        const insertResult = await poolRef.pool.request()
            .input('DocumentID', sql.VarChar, documentId ? documentId.trim() : null)
            .input('PartNo', sql.VarChar, finalPartNo ? finalPartNo.trim() : 'Unknown')
            .input('ActionType', sql.VarChar, actionType || 'Return')
            .input('ScannedBy', sql.VarChar, scannedBy || 'EN')
            .input('Remarks', sql.NVarChar, remarks ? remarks.trim() : null)
            .query(`
                INSERT INTO dbo.Engineer_Return (DocumentID, PartNo, ActionType, ScannedBy, Remarks, ScanTime)
                OUTPUT INSERTED.*
                VALUES (@DocumentID, @PartNo, @ActionType, @ScannedBy, @Remarks, GETDATE())
            `);

        res.status(201).json({
            success: true,
            message: `บันทึกรายการ ${actionType || 'Return'} สำเร็จ`,
            data: insertResult.recordset[0]
        });
    } catch (err) {
        console.error('[CREATE RETURN ERROR]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (poolRef && poolRef.shouldClose) {
            await poolRef.pool.close();
        }
    }
};

// DELETE /api/engineer-return/:id
exports.deleteEngineerReturn = async (req, res) => {
    const { id } = req.params;
    let poolRef;
    try {
        poolRef = await getIndirrecPool();
        await poolRef.pool.request()
            .input('id', sql.Int, id)
            .query(`DELETE FROM dbo.Engineer_Return WHERE id = @id`);
        res.status(200).json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        console.error('[DELETE RETURN ERROR]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (poolRef && poolRef.shouldClose) {
            await poolRef.pool.close();
        }
    }
};

// GET /api/engineer-return/history - Combined Engineer History & Document Return
exports.getEngineerHistory = async (req, res) => {
    try {
        const { poolPromise, poolRequestIndirrecPromise } = require("../config/database");
        const pool155 = await poolPromise;
        const poolIndirrec = await poolRequestIndirrecPromise;

        // 1. Schema migration is managed via backend/src/migrations/ensure_return_columns.js

        // 2. Query PBP155 db_Tooling master.tb_PC_Plan
        const planResult = await pool155.request().query(`
            SELECT 
                p.Plan_ID,
                p.PlanDate AS PlanDate,
                p.DateTime_Record AS DateTime_Record,
                CONVERT(varchar, p.DateTime_Record, 120) AS DateTimeRecordStr,
                p.Division,
                p.MC_Type AS MCType,
                p.Facility AS Fac,
                p.Process,
                p.Before_Part AS PartBefore,
                p.MC_No AS MCNo,
                p.PartNo,
                p.Revision,
                p.Path_Dwg_Rev AS PathDwgRev,
                p.Path_Layout_Rev AS PathLayoutRev,
                p.QTY AS ReqQty,
                p.ReturnQty,
                p.[Return Balance] AS ReturnBalance,
                p.Return_By AS ReturnBy,
                p.Comment,
                p.Path_Dwg AS PathDwg,
                p.Path_Layout AS PathLayout,
                p.Path_IIQC AS PathIIQC,
                p.PlanStatus AS Status,
                CAST(ISNULL(p.RequestNo, ISNULL(p.Unique_Id, CAST(p.Plan_ID AS NVARCHAR(50)))) AS NVARCHAR(100)) AS DocID
            FROM master.tb_PC_Plan p
            WHERE p.PlanStatus != 'Cancelled' OR p.PlanStatus IS NULL
            ORDER BY ISNULL(p.DateTime_Record, p.PlanDate) DESC, p.Plan_ID DESC
        `);

        const pcPlans = planResult.recordset || [];

        // Known DWG Revisions visually verified from physical drawing title blocks & sheets
        const KNOWN_DWG_REVS = {
            'T7071-G1BS01': 'O',
            'A5D21-2-G1A': 'NR',
            'A5B34-1-G1A': 'NR',
            'A5C21-2CG1A': 'C',
            'A5C62-2-F1A': 'C',
            'A5C68-1-G1AS01': 'A',
            'A5D19-4-03F1B': 'A',
            'A5D46-2-G1C': 'B',
            'A6701-1-G1A': 'A',
            'T6001-01G1A': 'NR',
            'T7018AG1A': 'D',
            'T7025JG2AS01-T1': 'NR',
            'T7025JG3A-TN1': 'NR',
            'T7067AG2A': 'G',
            'T7067AG2AT01': 'B',
            'T7067AG2BT01': 'M',
            'T7068-G2A': 'NR',
            'T7069-G1B': 'G',
            'T7070-G1C': 'K',
            'T7070-G1CT01': 'A',
            'T7070-G1D': 'C',
            'T7070-G1DS02': 'C',
            'T7071-G1ES03': 'O',
            'T7071-G1ET01': 'NR',
            'T7071-G1ET02': 'NR',
            'T7099AM1A': 'NR',
            'T7140-F2A': 'A',
            'T7205-F1A': 'B',
            'T9503AG1A': 'D'
        };

        // Helper: Extract Single Document Revision (Rev "a", "b", "01", "A", etc.)
        function extractSingleRev(revCol, filePath) {
            const clean = (revCol || '').toString().trim();
            if (clean && clean !== '-') return clean;

            if (!filePath) return '-';
            const cleanPath = filePath.replace(/["']/g, '');
            const filename = cleanPath.split(/[/\\]/).pop() || '';
            const baseName = filename.replace(/\.pdf$/i, '').trim();

            if (KNOWN_DWG_REVS[baseName]) {
                return KNOWN_DWG_REVS[baseName];
            }

            const m = filename.match(/(?:[(_\s-]|^)Rev\.?\s*([A-Za-z0-9_-]+)/i);
            if (m && m[1]) {
                const captured = m[1].replace(/[)]$/, '').replace(/\.+$/, '').trim();
                if (captured.toLowerCase() !== 'pdf') return captured;
            }
            return '-';
        }

        // 2. Query PBGM8G RequestindirrecMaterial.dbo.Engineer_Return & auto-sync missing records
        let returnList = [];
        if (poolIndirrec) {
            // Auto sync missing records into dbo.Engineer_Return
            for (const item of pcPlans) {
                const docId = item.DocID || `PLAN-${item.Plan_ID}`;
                try {
                    const checkRes = await poolIndirrec.request()
                        .input('DocID', sql.VarChar, docId)
                        .query(`SELECT TOP 1 id FROM dbo.Engineer_Return WHERE DocumentID = @DocID`);

                    if (checkRes.recordset.length === 0) {
                        await poolIndirrec.request()
                            .input('DocumentID', sql.VarChar, docId)
                            .input('PartNo', sql.VarChar, item.PartNo || 'Unknown')
                            .input('ActionType', sql.VarChar, (item.ReturnBalance || '').toLowerCase() === 'complete' ? 'Return' : 'Issue')
                            .input('ScannedBy', sql.VarChar, (item.ReturnBy && item.ReturnBy !== 'SYSTEM') ? item.ReturnBy : 'SYSTEM')
                            .input('Remarks', sql.NVarChar, item.Comment || 'Imported from PC_Plan')
                            .input('ScanTime', sql.DateTime, item.PlanDate ? new Date(item.PlanDate) : new Date())
                            .query(`
                                INSERT INTO dbo.Engineer_Return (DocumentID, PartNo, ActionType, ScannedBy, Remarks, ScanTime)
                                VALUES (@DocumentID, @PartNo, @ActionType, @ScannedBy, @Remarks, ISNULL(@ScanTime, GETDATE()))
                            `);
                    }
                } catch (syncErr) {
                    // Ignore duplicate key or sync error
                }
            }

            const retResult = await poolIndirrec.request().query(`SELECT * FROM dbo.Engineer_Return ORDER BY ScanTime DESC`);
            returnList = retResult.recordset || [];
        }

        // Build return map by PartNo / DocumentID, prioritizing actual user scan over SYSTEM
        const returnMap = new Map();
        for (const ret of returnList) {
            const pKey = (ret.PartNo || '').trim().toUpperCase();
            const dKey = (ret.DocumentID || '').trim().toUpperCase();

            if (pKey) {
                if (!returnMap.has(pKey) || (returnMap.get(pKey).ScannedBy === 'SYSTEM' && ret.ScannedBy && ret.ScannedBy !== 'SYSTEM')) {
                    returnMap.set(pKey, ret);
                }
            }
            if (dKey) {
                if (!returnMap.has(dKey) || (returnMap.get(dKey).ScannedBy === 'SYSTEM' && ret.ScannedBy && ret.ScannedBy !== 'SYSTEM')) {
                    returnMap.set(dKey, ret);
                }
            }
        }

        // 3. Map PC Plans with Return status and Separate DWG / Layout Revisions
        const mergedList = pcPlans.map(p => {
            let divStr = (p.Division || '').toString().trim().toUpperCase();
            if (divStr === '2' || divStr === '71DZ' || divStr === 'PMC') divStr = 'PMC';
            else if (divStr === '3' || divStr === '71D1' || divStr === 'GM') divStr = 'GM';

            const dwgRev = extractSingleRev(p.PathDwgRev, p.PathDwg);
            const layoutRev = extractSingleRev(p.PathLayoutRev, p.PathLayout);
            const matchRet = returnMap.get((p.DocID || '').trim().toUpperCase()) || returnMap.get((p.PartNo || '').trim().toUpperCase());
            const userWhoScanned = (p.ReturnBy && p.ReturnBy !== 'SYSTEM') 
                ? p.ReturnBy 
                : (matchRet && matchRet.ScannedBy && matchRet.ScannedBy !== 'SYSTEM' ? matchRet.ScannedBy : (matchRet ? matchRet.ScannedBy : ''));

            return {
                ...p,
                Division: divStr,
                PathDwgRev: dwgRev,
                PathLayoutRev: layoutRev,
                pathDwgRev: dwgRev,
                pathLayoutRev: layoutRev,
                docRevision: dwgRev !== '-' ? dwgRev : layoutRev,
                ActionType: matchRet ? matchRet.ActionType : ((p.ReturnBalance || '').toLowerCase() === 'complete' ? 'Return' : 'Issue'),
                ScannedBy: userWhoScanned,
                ReturnBy: userWhoScanned,
                ScanTime: matchRet ? matchRet.ScanTime : (p.DateTime_Record || p.PlanDate),
                DateTime_Record: p.DateTime_Record,
                DateTimeRecordStr: p.DateTimeRecordStr,
                PlanDate: p.PlanDate
            };
        }).filter(p => p.Division === 'PMC' || p.Division === 'GM');

        // 4. Aggregate identical sets: PartNo + DwgRev + LayoutRev + Comment (Setup) + MCType + MCNo
        const groupMap = new Map();
        for (const item of mergedList) {
            const part = (item.PartNo || '').trim().toUpperCase();
            const dwgRev = (item.pathDwgRev || '-').toString().trim().toUpperCase();
            const layoutRev = (item.pathLayoutRev || '-').toString().trim().toUpperCase();
            const setup = (item.Comment || '').trim().toUpperCase();
            const mc = (item.MCType || '').trim().toUpperCase();
            const mcNo = (item.MCNo || '').trim().toUpperCase();

            const groupKey = `${part}|${dwgRev}|${layoutRev}|${setup}|${mc}|${mcNo}`;

            const isReturned = (item.ReturnBalance || '').toLowerCase() === 'complete' 
                            || (item.ActionType || '').toLowerCase() === 'return'
                            || (item.ReturnQty && Number(item.ReturnQty) > 0)
                            || (item.ReturnBy && item.ReturnBy !== 'SYSTEM' && item.ReturnBy !== '');

            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, {
                    ...item,
                    PlanDocCount: 1,
                    ReturnedDocCount: isReturned ? 1 : 0,
                    planIds: item.Plan_ID ? [item.Plan_ID] : [],
                    items: [item]
                });
            } else {
                const existing = groupMap.get(groupKey);
                existing.PlanDocCount += 1;
                if (isReturned) {
                    existing.ReturnedDocCount = (existing.ReturnedDocCount || 0) + 1;
                }
                existing.ReqQty = (existing.ReqQty || 0) + (item.ReqQty || 0);
                if (item.ScannedBy && item.ScannedBy !== 'SYSTEM' && (!existing.ScannedBy || existing.ScannedBy === 'SYSTEM')) {
                    existing.ScannedBy = item.ScannedBy;
                    existing.ReturnBy = item.ScannedBy;
                }
                if (isReturned && (existing.ReturnBalance || '').toLowerCase() !== 'complete') {
                    existing.ReturnBalance = 'Complete';
                }
                if (item.Plan_ID && !existing.planIds.includes(item.Plan_ID)) {
                    existing.planIds.push(item.Plan_ID);
                }
                existing.items.push(item);
            }
        }

        // Post-process groups: if ReturnBalance is Complete or ReturnBy is present, ensure ReturnedDocCount matches PlanDocCount
        for (const group of groupMap.values()) {
            const isGroupComplete = (group.ReturnBalance || '').toLowerCase() === 'complete' 
                                 || (group.ReturnBy && group.ReturnBy !== 'SYSTEM' && group.ReturnBy !== '');
            if (isGroupComplete && (group.ReturnedDocCount || 0) < group.PlanDocCount) {
                group.ReturnedDocCount = group.PlanDocCount;
            }
        }

        const aggregatedList = Array.from(groupMap.values());
        // เรียงจากวันใหม่ล่าสุดไปวันเก่า (ตามเวลาจริงที่ PC บันทึก DateTime_Record)
        aggregatedList.sort((a, b) => {
            const timeA = new Date(a.DateTime_Record || a.ScanTime || a.PlanDate || 0).getTime() || 0;
            const timeB = new Date(b.DateTime_Record || b.ScanTime || b.PlanDate || 0).getTime() || 0;
            if (timeB !== timeA) return timeB - timeA;
            return (b.Plan_ID || 0) - (a.Plan_ID || 0);
        });
        res.status(200).json(aggregatedList);
    } catch (err) {
        console.error('[GET ENGINEER HISTORY ERROR]', err);
        res.status(500).json({ error: err.message });
    }
};




// GET /api/engineer-return/barcode-image?text=...
exports.getBarcodeImage = async (req, res) => {
    try {
        let text = req.query.text;
        if (!text) {
            return res.status(400).send('Text parameter is required');
        }
        text = text.trim();

        // แปลงปี 2026 เป็น 26 และตัด '-' ออกเพื่อให้บาร์โค้ดสั้น สแกนติดง่าย
        if (text.includes('|')) {
            text = text.split('|').map((part, idx) => {
                if (idx <= 1) {
                    let p = part.replace(/-/g, '');
                    if (p.length === 8 && p.startsWith('20')) {
                        p = p.substring(2); // '20260918' -> '260918'
                    }
                    return p;
                }
                return part;
            }).join('|');
        }

        const scale = parseInt(req.query.scale, 10) || 2;
        const height = parseInt(req.query.height, 10) || 30;

        let bwipjs;
        try {
            bwipjs = require('bwip-js');
        } catch (e) {
            return res.status(500).send('bwip-js not found');
        }

        const png = await bwipjs.toBuffer({
            bcid: 'code128',
            text: text,
            scale: scale,
            height: height,         // แท่งบาร์โค้ดสูงสวย สแกนติดง่าย สไตล์สินค้า
            includetext: true,      // แสดงตัวหนังสือใต้บาร์โค้ด
            textxalign: 'center',   // จัดกึ่งกลาง
            textsize: scale >= 3 ? 9 : 7,            // ขนาดตัวอักษร
            textmargin: scale >= 3 ? 7 : 4,          // เว้นระยะห่างระหว่างแท่งกับตัวหนังสือไม่ให้ทับกัน
            backgroundcolor: 'ffffff',
            barcolor: '000000',     // สีแท่งดำสนิท คอนทราสต์สูงสุด
            paddingtop: scale >= 3 ? 14 : 6,
            paddingbottom: scale >= 3 ? 14 : 6,
            paddingleft: scale >= 3 ? 24 : 10,
            paddingright: scale >= 3 ? 24 : 10
        });

        res.type('image/png');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(png);
    } catch (err) {
        console.error('[BARCODE IMAGE ERROR]', err);
        res.status(500).send('Failed to generate barcode: ' + err.message);
    }
};

// POST /api/engineer-return/process-return - Process Return by Barcode & Update DB 155 [Return Balance] = 'Complete'
exports.processBarcodeReturn = async (req, res) => {
    let { 
        barcode, 
        rawBarcode,
        scannedBy, 
        planIds, 
        status,
        actionType,
        remarks 
    } = req.body;

    const actualRawBarcode = (rawBarcode || barcode || '').trim();
    if (!actualRawBarcode && (!planIds || planIds.length === 0)) {
        return res.status(400).json({ error: 'Barcode หรือ Plan ID จำเป็นสำหรับการบันทึกการคืน' });
    }

    // 1. Sanitize input and extract baseBarcode (strip -R if paper barcode)
    const cleanUpper = sanitizeScan(actualRawBarcode);
    const parsedPaper = parsePaperBarcode(cleanUpper);
    const cleanBaseCode = parsedPaper.baseBarcode || cleanUpper;

    let poolRef;
    try {
        const { poolPromise } = require("../config/database");
        const pool155 = await poolPromise;
        if (!pool155) {
            return res.status(500).json({ error: 'ไม่สามารถเชื่อมต่อฐานข้อมูล master.tb_PC_Plan ได้' });
        }

        // 2. Read plan row(s) from master.tb_PC_Plan based on planIds
        const validPlanIds = Array.isArray(planIds) ? planIds.map(Number).filter(n => !isNaN(n) && n > 0) : [];
        let planRows = [];

        if (validPlanIds.length > 0) {
            const planReq = pool155.request();
            const planRes = await planReq.query(`
                SELECT Plan_ID, PartNo, Revision, Path_Dwg_Rev, Path_Layout_Rev, MC_Type, MC_No, Comment, PlanDate, DateTime_Record, Process, [Return Balance], Return_By
                FROM master.tb_PC_Plan
                WHERE Plan_ID IN (${validPlanIds.join(',')})
            `);
            planRows = planRes.recordset || [];
        } else {
            // Fallback if planIds wasn't supplied directly: find by matching generated barcode
            const lookupReq = pool155.request();
            const lookupRes = await lookupReq.query(`
                SELECT TOP 50 Plan_ID, PartNo, Revision, Path_Dwg_Rev, Path_Layout_Rev, MC_Type, MC_No, Comment, PlanDate, DateTime_Record, Process, [Return Balance], Return_By
                FROM master.tb_PC_Plan
                ORDER BY Plan_ID DESC
            `);
            for (const r of lookupRes.recordset) {
                const sCode = formatShortCodeForItem(r);
                const pCode = formatPipeBarcodeForItem(r);
                if (sCode === cleanBaseCode || pCode === cleanBaseCode || sCode === cleanUpper || pCode === cleanUpper) {
                    planRows.push(r);
                    validPlanIds.push(r.Plan_ID);
                    break;
                }
            }
        }

        if (planRows.length === 0) {
            return res.status(400).json({ 
                error: 'ไม่พบรายการแผนงานที่ระบุในระบบ (master.tb_PC_Plan)' 
            });
        }

        // 3. "สร้างบาร์โค้ดจากข้อมูลแผน" ด้วยฟังก์ชันเดียวกับที่ใช้สร้างบาร์โค้ดบนหน้าจอ (formatBarcodeForItem) แล้วเทียบกับ base ที่ส่งมา ไม่ตรง → 400
        const planRow = planRows[0];
        const expectedShort = formatShortCodeForItem(planRow);
        const expectedPipe = formatPipeBarcodeForItem(planRow);
        const isMatch = (cleanBaseCode === expectedShort) || (cleanBaseCode === expectedPipe)
                     || (cleanUpper === expectedShort) || (cleanUpper === expectedPipe);
        if (!isMatch) {
            return res.status(400).json({
                error: `บาร์โค้ดไม่ตรงกับแผนงานในระบบ! (สแกนได้: ${cleanBaseCode}, แผนในระบบ: ${expectedShort})`
            });
        }

        // 4. MCType / MCNo / PlanDate ที่ INSERT ให้เอาจากแถวแผนใน DB โดยตรง (PlanDate ส่งเป็น sql.Date)
        const finalPartNo = planRow.PartNo || 'Unknown';
        const finalMCType = planRow.MC_Type || null;
        const finalMCNo = planRow.MC_No || null;
        let finalPlanDate = null;
        if (planRow.PlanDate) {
            const d = new Date(planRow.PlanDate);
            if (!isNaN(d.getTime())) {
                finalPlanDate = d;
            }
        }
        const dwgRevVal = planRow.Path_Dwg_Rev || planRow.Revision || '-';
        const layoutRevVal = planRow.Path_Layout_Rev || '-';

        // 5. ตรวจซ้ำด้วยคอลัมน์ ReturnID (ไม่ใช่ id)
        poolRef = await getIndirrecPool();
        if (poolRef && poolRef.pool) {
            const dupCheckReq = poolRef.pool.request();
            dupCheckReq.input('RawBarcode', sql.NVarChar, actualRawBarcode);
            dupCheckReq.input('CleanBarcode', sql.NVarChar, cleanUpper);
            dupCheckReq.input('BaseBarcode', sql.NVarChar, cleanBaseCode);
            const dupCheckRes = await dupCheckReq.query(`
                SELECT TOP 1 ReturnID, id, RawBarcode, PartNo, ScanTime, ScannedBy 
                FROM dbo.Engineer_Return
                WHERE (RawBarcode = @RawBarcode OR RawBarcode = @CleanBarcode OR RawBarcode = @BaseBarcode 
                       OR DocumentID = @RawBarcode OR DocumentID = @CleanBarcode OR DocumentID = @BaseBarcode)
                  AND Status = 'Completed'
                ORDER BY COALESCE(ReturnID, id) DESC
            `);
            if (dupCheckRes.recordset.length > 0) {
                const existing = dupCheckRes.recordset[0];
                return res.status(409).json({
                    error: `บาร์โค้ดนี้ได้รับการบันทึกส่งคืนเรียบร้อยแล้ว (สแกนซ้ำโดย ${existing.ScannedBy || '-'} เมื่อ ${existing.ScanTime ? new Date(existing.ScanTime).toLocaleString('th-TH') : '-'})`,
                    isDuplicate: true,
                    existingRecord: existing
                });
            }
        }

        // 6. UPDATE DB 155 [master].[tb_PC_Plan] FIRST
        const req155 = pool155.request();
        req155.input('ScannedBy', sql.NVarChar, (scannedBy || '').trim() || 'EN User');
        const updateResult = await req155.query(`
            UPDATE master.tb_PC_Plan
            SET [Return Balance] = 'Complete', Is_Return_OK = 1, Return_By = @ScannedBy
            WHERE Plan_ID IN (${validPlanIds.join(',')})
        `);

        const affectedCount = updateResult.rowsAffected ? updateResult.rowsAffected.reduce((a, b) => a + b, 0) : 0;
        if (affectedCount === 0) {
            return res.status(400).json({ 
                error: 'ไม่สามารถอัปเดต master.tb_PC_Plan ได้' 
            });
        }

        // 7. Insert into dbo.Engineer_Return ONLY after DB 155 successfully closed the plan
        if (poolRef && poolRef.pool) {
            const remarksText = remarks || `Dual Verification Return: ${actualRawBarcode || cleanBaseCode}`;
            const tx = new sql.Transaction(poolRef.pool);
            await tx.begin();
            try {
                const insertReq = tx.request();
                insertReq.input('RawBarcode', sql.NVarChar(100), actualRawBarcode || null);
                insertReq.input('PartNo', sql.NVarChar(50), finalPartNo);
                insertReq.input('MCType', sql.NVarChar(20), finalMCType);
                insertReq.input('MCNo', sql.NVarChar(20), finalMCNo);
                insertReq.input('PlanDate', sql.Date, finalPlanDate);
                insertReq.input('Status', sql.NVarChar(20), status || 'Completed');
                insertReq.input('DocumentID', sql.VarChar(150), (actualRawBarcode || `RETURN-DWG-${dwgRevVal}`).trim());
                insertReq.input('ActionType', sql.VarChar(50), actionType || 'Return');
                insertReq.input('ScannedBy', sql.VarChar(100), (scannedBy || 'EN User').trim());
                insertReq.input('Remarks', sql.NVarChar(sql.MAX), remarksText);

                await insertReq.query(`
                    INSERT INTO dbo.Engineer_Return 
                        (RawBarcode, PartNo, MCType, MCNo, PlanDate, ReturnDate, Status, DocumentID, ActionType, ScanTime, ScannedBy, Remarks)
                    VALUES 
                        (@RawBarcode, @PartNo, @MCType, @MCNo, @PlanDate, GETDATE(), @Status, @DocumentID, @ActionType, GETDATE(), @ScannedBy, @Remarks)
                `);

                await tx.commit();
            } catch (txErr) {
                await tx.rollback();
                console.error('[Engineer_Return Transaction Error]', txErr);
                throw txErr;
            }
        }

        // Broadcast SSE update
        try {
            const SSEManager = require('../utils/SSEManager');
            if (SSEManager && SSEManager.broadcast) {
                SSEManager.broadcast({ 
                    type: 'PLANLIST_UPDATE',
                    action: 'RETURN_COMPLETE',
                    targetDocType: 'DWG',
                    partNo: finalPartNo,
                    pathDwgRev: dwgRevVal,
                    pathLayoutRev: layoutRevVal,
                    docRevision: dwgRevVal,
                    revision: dwgRevVal,
                    mcType: finalMCType,
                    mcNo: finalMCNo,
                    comment: planRow.Comment,
                    scannedBy: scannedBy || 'EN User',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (_) {}

        return res.status(200).json({
            success: true,
            message: `บันทึกการส่งคืน Drawing (DWG Rev: ${dwgRevVal}) เรียบร้อยแล้ว`,
            data: {
                rawBarcode: actualRawBarcode,
                barcode: actualRawBarcode,
                partNo: finalPartNo,
                targetDocType: 'DWG',
                pathDwgRev: dwgRevVal,
                pathLayoutRev: layoutRevVal,
                docRevision: dwgRevVal,
                revision: dwgRevVal,
                mcType: finalMCType,
                mcNo: finalMCNo,
                planDate: finalPlanDate ? finalPlanDate.toISOString().split('T')[0] : null,
                comment: planRow.Comment,
                scannedBy: scannedBy || 'EN User',
                returnBy: scannedBy || 'EN User',
                planDocCount: planRows.length,
                returnedDocCount: planRows.length,
                isReturnComplete: true
            }
        });
    } catch (err) {
        console.error('[PROCESS BARCODE RETURN ERROR]', err);
        return res.status(500).json({ error: err.message });
    } finally {
        if (poolRef && poolRef.shouldClose) {
            await poolRef.pool.close();
        }
    }
};


