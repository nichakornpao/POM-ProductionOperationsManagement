const { poolPromise, poolPurchaseAutoloadPromise } = require("../config/database");
const Type = require("mssql").TYPES;
const sql = require("mssql");
const { EVENT_TYPES, resolveDivisionId, resolveDivisionIdDb } = require('../utils/notification.constants');

// 1. Get Dropdown Division
exports.getDivisions = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .execute('trans.Stored_Get_Dropdown_Division'); // Updated SP
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

// 2. Get Facility by Division
exports.getFacilities = async (req, res) => {
    try {
        const { divisionId } = req.params;
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Profit_Center', sql.NVarChar, divisionId) // SP expects @Profit_Center (passed as param)
            .execute('trans.Stored_Get_Dropdown_Facility_By_Division');
        // SP returns only one recordset with FacilityShort and FacilityName
        res.status(200).json(result.recordset || []);
        // Note: Returns [Profit_Center_Name] and [FacilityName]
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

// 3. Get Process by Division
exports.getProcesses = async (req, res) => {
    try {
        const { divisionId } = req.params;
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Input_Division', sql.Int, divisionId)
            .execute('trans.Stored_Get_tb_Process');
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Backend - getProcesses Error:', err);
        res.status(500).send(err.message);
    }
};

// 4. Get PartNo Auto-complete
exports.getPartNo = async (req, res) => {
    try {
        const { divisionId } = req.query;
        const { partNo } = req.params;

        const pool = await poolPromise;
        const result = await pool.request()
            .input('Input_Division', sql.Int, divisionId)
            .input('Input_PartNo', sql.NVarChar, partNo)
            .execute('trans.Stored_Get_tb_PartNo');

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Backend - getPartNo Error:', err);
        res.status(500).send(err.message);
    }
};

// 5. Get Item Details (Auto-fill)
// 5. Get Item Details (Auto-fill or Autocomplete)
exports.getItemDetails = async (req, res) => {
    try {
        const { itemNo } = req.params;
        const { divisionId, isAutocomplete } = req.query;

        // ── Pre-process: resolve division to a clean INT before calling the SP ──
        // Frontend can send '71DZ', 'PMC', '7122', 'GM', '2', '3', etc.
        // The SP's view does unsafe CAST(nvarchar→int) — we resolve it here
        // so the SP always receives a clean integer.
        const divisionInt = await resolveDivisionIdDb(divisionId);
        if (divisionInt === null) {
            return res.status(400).json({
                message: `Unknown division: "${divisionId}". Expected a valid division code or numeric ID.`
            });
        }
        if (!itemNo || itemNo.trim().length === 0) {
            return res.status(400).json({ message: 'Item number is required' });
        }

        // === PRIMARY: pbp155 — db_Tooling via trans.Stored_Get_ItemDetail_AutoFill ===
        let result = null;
        try {
            const pool = await poolPromise;
            result = await pool.request()
                .input('Input_ItemNo', sql.NVarChar, itemNo.trim())
                .input('Input_Division', sql.Int, divisionInt)
                .input('Is_Autocomplete', sql.Bit, isAutocomplete === 'true' ? 1 : 0)
                .execute('trans.Stored_Get_ItemDetail_AutoFill');
            console.log(`[getItemDetails] pbp155 returned ${result.recordset ? result.recordset.length : 0} rows`);
        } catch (primaryErr) {
            console.error('[getItemDetails] pbp155 primary failed:', primaryErr.message);
        }

        // === FALLBACK: pbgm8g — PurchaseAutoload.Stored_Get_ItemDetail_AutoFill ===
        if (!result || !result.recordset || result.recordset.length === 0) {
            console.warn('[getItemDetails] pbp155 returned no data — falling back to pbgm8g PurchaseAutoload');
            const poolPbgm = await poolPurchaseAutoloadPromise;
            if (!poolPbgm) {
                return res.status(503).json({ message: 'Both pbp155 and pbgm8g PurchaseAutoload databases are unavailable' });
            }
            result = await poolPbgm.request()
                .input('Input_ItemNo', sql.NVarChar, itemNo.trim())
                .input('Input_Division', sql.Int, divisionInt)
                .input('Is_Autocomplete', sql.Bit, isAutocomplete === 'true' ? 1 : 0)
                .execute('dbo.Stored_Get_ItemDetail_AutoFill');
            console.log(`[getItemDetails] pbgm8g fallback returned ${result.recordset ? result.recordset.length : 0} rows`);
        }

        // Logic:
        // If Autocomplete=true -> Return Array (List of suggestions)
        // If Autocomplete=false -> Return Object (Single item details)
        if (isAutocomplete === 'true') {
            res.status(200).json(result.recordset); // Return List
        } else {
            if (result.recordset.length > 0) {
                res.status(200).json(result.recordset[0]); // Return Single Object
            } else {
                res.status(404).json({ message: 'Item not found' });
            }
        }

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};


// 6. Save Return Request
exports.saveReturnRequest = async (req, res) => {
    try {
        const { header, items } = req.body;
        // header: { divisionId, facility, process, phone, docNo, employeeId, returnBy }
        // items: Array of { partNo, itemNo, itemName, spec, qty, remark }

        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        try {
            for (const item of items) {
                // Skip empty rows
                if (!item.itemNo) continue;

                const request = new sql.Request(transaction);
                await request
                    .input('Doc_No', sql.NVarChar, header.docNo)
                    .input('Employee_ID', sql.NVarChar, header.employeeId)
                    .input('Return_By', sql.NVarChar, header.returnBy)
                    .input('Division', sql.NVarChar, header.divisionName)
                    .input('Process', sql.NVarChar, header.process)
                    .input('Facility', sql.NVarChar, header.facility)
                    .input('Phone_No', sql.NVarChar, header.phone)
                    .input('ItemNo', sql.NVarChar, item.itemNo)
                    .input('PartNo', sql.NVarChar, item.partNo)
                    .input('ItemName', sql.NVarChar, item.itemName)
                    .input('Spec', sql.NVarChar, item.spec)
                    .input('QTY', sql.Int, item.qty)
                    .input('Used_Qty', sql.Int, item.usedQty || 0) // New Parameter
                    .input('Remark', sql.NVarChar, item.remark)
                    .execute('trans.Stored_Save_Return_Request');
            }

            await transaction.commit();

            // === Link back to PlanList (Unique_Id) ===
            if (header.uniqueId) {
                try {
                    const now = new Date();
                    const returnUserStr = `${header.returnBy || header.employeeId || 'User'} ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})}`;
                    
                    // Update tb_Return_List to attach the Unique_Id for tracking
                    // Auto-adds the column if it doesn't exist yet to prevent crashes
                    const totalReturnQty = items.reduce((sum, item) => sum + (parseInt(item.qty) || 0), 0);

                    await pool.request()
                        .input('Doc_No', sql.NVarChar, header.docNo)
                        .input('Unique_Id', sql.NVarChar, header.uniqueId)
                        .input('ReturnBalance', sql.NVarChar, returnUserStr)
                        .input('ReturnQty', sql.Int, totalReturnQty)
                        .query(`
                            IF COL_LENGTH('[master].[tb_Return_List]', 'Unique_Id') IS NULL
                            BEGIN
                                ALTER TABLE [master].[tb_Return_List] ADD Unique_Id NVARCHAR(50) NULL;
                            END
                            IF COL_LENGTH('[master].[tb_PC_Plan]', 'Return Balance') IS NULL
                            BEGIN
                                ALTER TABLE [master].[tb_PC_Plan] ADD [Return Balance] NVARCHAR(100) NULL;
                            END
                            IF COL_LENGTH('[master].[tb_PC_Plan]', 'ReturnQty') IS NULL
                            BEGIN
                                ALTER TABLE [master].[tb_PC_Plan] ADD [ReturnQty] INT NULL DEFAULT 0;
                            END
                            
                            UPDATE [master].[tb_Return_List] 
                            SET Unique_Id = @Unique_Id 
                            WHERE Doc_No = @Doc_No;

                            UPDATE [master].[tb_PC_Plan]
                            SET Is_Return_OK = 1, 
                                [Return Balance] = @ReturnBalance,
                                [ReturnQty] = @ReturnQty
                            WHERE Unique_Id = @Unique_Id;
                        `);

                    // Tell PlanList clients to refresh so the returned row disappears instantly
                    const SSEManager = require('../utils/SSEManager');
                    SSEManager.broadcast({ type: 'PLANLIST_UPDATE' });
                } catch (linkErr) {
                    console.error('Error linking Unique_Id to Return:', linkErr);
                }
            }

            // === Notification Trigger (V2): RETURN_SENT ===
            try {
                const { emitNotification } = require('./Notification.controller');
                const userName = header.returnBy || header.employeeId || 'NITA Scanner';
                const docNo = header.docNo;
                const userRole = (req.user && req.user.Role) ? req.user.Role : 'Production';

                const divId = resolveDivisionId(header.divisionName || header.divisionId);
                await emitNotification(req, pool, {
                    eventType: EVENT_TYPES.RETURN_SENT,
                    subject: `🔴 [Action Required] Tooling Return Pending: ${docNo}`,
                    docNo: docNo,
                    actionBy: userName,
                    targetRoles: 'purchase',
                    ctaRoute: '/purchase/return-history',
                    division: header.divisionName,
                    divisionId: divId,
                    detailsJson: null
                });
            } catch (notifErr) {
                console.error('Notification Error (Return Sent):', notifErr);
            }

            res.status(200).json({
                message: 'Saved successfully',
                docNo: header.docNo,
                isLinked: !!header.uniqueId,
                returnBy: header.returnBy || header.employeeId || 'NITA Scanner'
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

// 7. Get Return List (History)
// @uses SP: trans.Stored_Get_ReturnList
exports.getReturnList = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .execute('trans.Stored_Get_ReturnList');

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

// 8. Get Next Doc No
exports.getNextDocNo = async (req, res) => {
    try {
        const { process, facility, division } = req.query; // Received division (71DZ, 7122, etc.)

        // Logic mapping
        // RET = RETURN
        // TN = PROCESS (TURNING = TN, RL หรือ F&BORING = RL)
        let processCode = 'XX';
        if (process) {
            const upProcess = process.toUpperCase();
            if (upProcess.includes('TURNING')) processCode = 'TN';
            else if (upProcess.includes('RL') || upProcess.includes('BORING')) processCode = 'RL';
            else processCode = upProcess.substring(0, 2);
        }

        // 6 = FAC ( extract from F.1, F.4, F.6 )
        let facCode = '0';
        if (facility) {
            const match = facility.match(/\d+/);
            if (match) facCode = match[0];
        }

        // MONTH 12
        const now = new Date();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        const prefix = `RET${processCode}${facCode}${month}`;

        const pool = await poolPromise;
        const result = await pool.request()
            .input('Division', sql.NVarChar, division)
            .input('MonthPattern', sql.NVarChar, '______' + month + '____') // RET(3) + Proc(2) + Fac(1) = 6 chars before Month
            .query(`
                SELECT TOP 1 Doc_No 
                FROM [master].[tb_Return_List] 
                WHERE Division = @Division 
                  AND Doc_No LIKE @MonthPattern
                ORDER BY RIGHT(Doc_No, 4) DESC
            `);

        let nextSeq = 1;
        if (result.recordset.length > 0) {
            const lastDocNo = result.recordset[0].Doc_No;
            const lastSeq = parseInt(lastDocNo.substring(lastDocNo.length - 4));
            if (!isNaN(lastSeq)) {
                nextSeq = lastSeq + 1;
            }
        }

        const docNo = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
        res.status(200).json({ docNo });

    } catch (err) {
        console.error('getNextDocNo Error:', err);
        res.status(500).send(err.message);
    }
};

// 9. Update Return Status
exports.updateReturnStatus = async (req, res) => {
    try {
        const { id, status, docNo } = req.body; // Expects { id, status, docNo? }

        const pool = await poolPromise;
        const result = await pool.request()
            .input('Return_ID', sql.Int, id)
            .input('Status', sql.NVarChar, status)
            .execute('trans.Stored_Update_Return_Status');

        // === Notification Trigger (V2): RETURN_COMPLETED ===
        if (status && status.toLowerCase() === 'completed') {
            try {
                let userDivision = '';
                if (id) {
                    const divQuery = await pool.request()
                        .input('Query_Return_ID', sql.Int, id)
                        .query('SELECT TOP 1 Division FROM [db_Tooling].[master].[tb_Return_List] WHERE Return_ID = @Query_Return_ID');
                    userDivision = divQuery.recordset[0]?.Division || '';
                }

                const { emitNotification } = require('./Notification.controller');
                const refDocNo = docNo || String(id);

                const divId = resolveDivisionId(userDivision);
                await emitNotification(req, pool, {
                    eventType: EVENT_TYPES.RETURN_COMPLETED,
                    subject: `🟢 [Completed] Tooling Return Confirmed: ${refDocNo}`,
                    docNo: refDocNo,
                    actionBy: 'Purchase',
                    targetRoles: 'production',
                    ctaRoute: '/production/return-history',
                    division: userDivision,
                    divisionId: divId,
                    detailsJson: null
                });
            } catch (notifErr) {
                console.error('Notification Error (Return Completed):', notifErr);
            }
        }

        res.status(200).json({ message: 'Update status success' });

    } catch (err) {
        console.error('updateReturnStatus Error:', err);
        res.status(500).send(err.message);
    }
};

// 10. Link Plan OK (Mark as returned without items)
exports.linkPlanOk = async (req, res) => {
    try {
        const { uniqueId } = req.body;
        if (!uniqueId) return res.status(400).send("No uniqueId provided");

        const pool = await poolPromise;
        const now = new Date();
        const userName = (req.user && req.user.Employee_ID) ? req.user.Employee_ID : 'User';
        const returnUserStr = `${userName} ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})}`;

        await pool.request()
            .input('Unique_Id', sql.NVarChar, uniqueId)
            .input('ReturnBalance', sql.NVarChar, returnUserStr)
            .query(`
                IF COL_LENGTH('[master].[tb_PC_Plan]', 'Is_Return_OK') IS NULL
                BEGIN
                    ALTER TABLE [master].[tb_PC_Plan] ADD Is_Return_OK BIT NOT NULL DEFAULT 0;
                END
                IF COL_LENGTH('[master].[tb_PC_Plan]', 'Return Balance') IS NULL
                BEGIN
                    ALTER TABLE [master].[tb_PC_Plan] ADD [Return Balance] NVARCHAR(100) NULL;
                END
                
                -- Simple flag update to hide from Return tab without deleting or affecting other tabs
                UPDATE [master].[tb_PC_Plan]
                SET Is_Return_OK = 1, [Return Balance] = @ReturnBalance
                WHERE Unique_Id = @Unique_Id;
            `);

        // Tell PlanList clients to refresh so the returned row disappears instantly
        const SSEManager = require('../utils/SSEManager');
        SSEManager.broadcast({ type: 'PLANLIST_UPDATE' });

        res.status(200).json({ success: true, message: 'Plan marked as OK' });
    } catch (err) {
        console.error('linkPlanOk Error:', err);
        res.status(500).send(err.message); // Updated from message: "error" to be clearer
    }
};

// 11. Get Document Details by Paper Barcode (RequestNo, Unique_Id, GroupId, Plan_ID)
exports.getDocBarcodeDetails = async (req, res) => {
    try {
        const { barcode } = req.params;
        if (!barcode || barcode.trim().length === 0) {
            return res.status(400).json({ found: false, message: 'Barcode is required' });
        }

        const cleanBarcode = barcode.trim();
        const cleanNoPlan = cleanBarcode.replace(/^PLAN-/i, '').replace(/^REQ-/i, '').trim();
        let numId = 0;
        const matchDigits = cleanBarcode.match(/\d+/);
        if (matchDigits) {
            numId = parseInt(matchDigits[0], 10);
        }

        const pool = await poolPromise;

        // Query tb_PC_Plan by RequestNo, Unique_Id, GroupId, Plan_ID, or extracted digits
        let planResult = await pool.request()
            .input('Barcode', sql.NVarChar, cleanBarcode)
            .input('CleanNoPlan', sql.NVarChar, cleanNoPlan)
            .input('NumId', sql.Int, numId)
            .query(`
                SELECT 
                    Plan_ID, 
                    CAST(Unique_Id AS NVARCHAR(100)) AS Unique_Id, 
                    CAST(RequestNo AS NVARCHAR(100)) AS RequestNo, 
                    CAST(GroupId AS NVARCHAR(100)) AS GroupId, 
                    Division, Facility, Process, PartNo, Before_Part, MC_No, QTY, Comment,
                    [Return Balance], Is_Return_OK
                FROM master.tb_PC_Plan
                WHERE CAST(RequestNo AS NVARCHAR(100)) = @Barcode 
                   OR CAST(Unique_Id AS NVARCHAR(100)) = @Barcode 
                   OR CAST(GroupId AS NVARCHAR(100)) = @Barcode
                   OR (RequestNo IS NOT NULL AND CAST(RequestNo AS NVARCHAR(100)) LIKE '%' + @Barcode + '%')
                   OR (@NumId > 0 AND Plan_ID = @NumId)
                   OR (@CleanNoPlan <> '' AND CAST(RequestNo AS NVARCHAR(100)) = @CleanNoPlan)
                   OR (@CleanNoPlan <> '' AND CAST(GroupId AS NVARCHAR(100)) = @CleanNoPlan)
                   OR (@CleanNoPlan <> '' AND RequestNo IS NOT NULL AND CAST(RequestNo AS NVARCHAR(100)) LIKE '%' + @CleanNoPlan + '%')
            `);

        // If a row was matched by Plan_ID or partial barcode, expand to include all sibling rows with the same GroupId or RequestNo
        if (planResult.recordset && planResult.recordset.length > 0) {
            const firstMatch = planResult.recordset[0];
            const matchedGroupId = (firstMatch.GroupId || '').trim();
            const matchedRequestNo = (firstMatch.RequestNo || '').trim();

            if (matchedGroupId !== '' || matchedRequestNo !== '') {
                try {
                    const groupResult = await pool.request()
                        .input('GroupId', sql.NVarChar, matchedGroupId)
                        .input('RequestNo', sql.NVarChar, matchedRequestNo)
                        .query(`
                            SELECT 
                                Plan_ID, 
                                CAST(Unique_Id AS NVARCHAR(100)) AS Unique_Id, 
                                CAST(RequestNo AS NVARCHAR(100)) AS RequestNo, 
                                CAST(GroupId AS NVARCHAR(100)) AS GroupId, 
                                Division, Facility, Process, PartNo, Before_Part, MC_No, QTY, Comment,
                                [Return Balance], Is_Return_OK
                            FROM master.tb_PC_Plan
                            WHERE (@GroupId <> '' AND CAST(GroupId AS NVARCHAR(100)) = @GroupId)
                               OR (@RequestNo <> '' AND CAST(RequestNo AS NVARCHAR(100)) = @RequestNo)
                        `);
                    if (groupResult.recordset && groupResult.recordset.length > 0) {
                        planResult.recordset = groupResult.recordset;
                    }
                } catch (groupErr) {
                    console.error('Error fetching sibling group items:', groupErr);
                }
            }
        }

        if (planResult.recordset && planResult.recordset.length > 0) {
            const rows = planResult.recordset;
            const first = rows[0];

            let divId = 2; // Default PMC
            const divStr = (first.Division || '').toString().toUpperCase();
            if (divStr === '7122' || divStr === '3' || divStr === 'GM') divId = 3;
            else if (divStr === '71DZ' || divStr === '2' || divStr === 'PMC') divId = 2;

            let facFormatted = first.Facility || '';
            if (/^\d+$/.test(facFormatted.trim())) {
                facFormatted = `F.${facFormatted.trim()}`;
            }

            const items = [];
            for (const r of rows) {
                const targetCode = (r.PartNo || r.Before_Part || '').trim();
                let itemName = targetCode;
                let itemNo = targetCode;
                let spec = r.Before_Part ? `Part Before: ${r.Before_Part}` : '';

                if (targetCode) {
                    try {
                        const toolRes = await pool.request()
                            .input('Code', sql.NVarChar, targetCode)
                            .input('Div', sql.Int, divId)
                            .query(`
                                SELECT TOP 1 ItemNo, ItemName, SPEC 
                                FROM master.tb_Master_Tooling 
                                WHERE (ItemNo = @Code OR PartNo = @Code) 
                                  AND (Division_Id = @Div OR @Div IS NULL)
                            `);
                        if (toolRes.recordset && toolRes.recordset.length > 0) {
                            const t = toolRes.recordset[0];
                            if (t.ItemNo) itemNo = t.ItemNo;
                            if (t.ItemName) itemName = t.ItemName;
                            if (t.SPEC) spec = t.SPEC;
                        }
                    } catch (e) {
                        // ignore enrichment failure
                    }
                }

                items.push({
                    partNo: r.PartNo || '',
                    itemNo: itemNo,
                    itemName: itemName,
                    spec: spec,
                    qty: Math.max(1, Math.round(Number(r.QTY) || 1)),
                    usedQty: null,
                    remark: r.Comment || ''
                });
            }

            return res.status(200).json({
                found: true,
                type: 'DOCUMENT',
                uniqueId: first.Unique_Id || null,
                requestNo: first.RequestNo || `PLAN-${first.Plan_ID}`,
                divisionId: divId,
                divisionName: divId === 3 ? 'GM' : 'PMC',
                profitCenter: divId === 3 ? '7122' : '71DZ',
                facility: facFormatted,
                process: first.Process || '',
                items: items
            });
        }

        return res.status(200).json({ found: false, message: 'No document matched barcode' });

    } catch (err) {
        console.error('Error in getDocBarcodeDetails:', err);
        return res.status(500).json({ found: false, message: err.message });
    }
};