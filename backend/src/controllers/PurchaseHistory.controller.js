const { sql, poolPromise, poolPurchaseAutoloadPromise } = require("../config/database");

/**
 * @api {GET} /Purchase_History
 * @description ดึงข้อมูล Purchase History ทั้งหมดจาก View
 * @uses SP: trans.Stored_Purchase_History
 */
let historyCacheData = null;
let lastHistoryFetchTime = 0;
const HISTORY_CACHE_TTL_MS = 15000; // 15 seconds cache

exports.Purchase_History = async (req, res) => {
  try {
    const now = Date.now();
    if (historyCacheData && historyCacheData.length > 0 && (now - lastHistoryFetchTime < HISTORY_CACHE_TTL_MS)) {
      return res.json(historyCacheData);
    }

    const pool = await poolPromise;
    
    // เรียกใช้ Stored Procedure ตัวกลาง [trans].[Stored_Get_IssueAS400_History]
    // จับคู่ On-Hand และ Location สดจาก iPBASS ให้พร้อมตั้งแต่แรก
    const historyResult = await pool.request()
      .input('Division', sql.NVarChar(50), req.query.division || null)
      .execute('trans.Stored_Get_IssueAS400_History');

    // === MOCK DATA INTERCEPTION ===
    let mockRecords = [];
    try {
      const { poolRequestIndirrecPromise } = require('../config/database');
      const indirrecTimeout = new Promise(resolve => setTimeout(() => resolve(null), 1000));
      const poolIndirrec = await Promise.race([poolRequestIndirrecPromise, indirrecTimeout]);
      
      if (poolIndirrec) {
        // Query only completed mock requests from 8g Test table
        const testResult = await poolIndirrec.request().query(`
          SELECT 
            T.Public_Id AS ID_Request,
            T.Public_Id AS OriginalID,
            '' AS MR_No, ISNULL(T.MFGOrderNo, '') AS MFGOrderNo, T.DocNo, T.Status, T.Requester, T.Division, '' AS Fac, ISNULL(T.[CASE], '') AS [CASE], T.PartNo, T.ItemNo, ISNULL(T.MatLot, '') AS MatLot, T.ItemNo AS SPEC,
            T.Process, T.MCType, T.MCNo, ISNULL(T.STOCK_ON_HAND, 0) AS ON_HAND, T.Req_QTY, T.QTY, T.DateTime_Record AS DueDate, T.DateTime_Record, ISNULL(T.Remark, '') AS Remark, T.DateComplete, '' AS PhoneNo, T.ItemNo AS ItemName,
            '' AS ACCOUNT, '' AS ToolingType,
            T.AS400STATUS,
            ISNULL(T.MAIN_LOCATION, '') AS Stock_Location,
            1 AS isMockTest,
            'RequestList' AS MockSource
          FROM [dbo].[TestPurchaseRequestList] T WITH (NOLOCK)
          WHERE T.Status IN ('Complete', 'CompleteToExcel')
            AND T.Public_Id LIKE 'TEST-%'
          UNION ALL
          SELECT 
            C.Public_Id AS ID_Request,
            C.Public_Id AS OriginalID,
            '' AS MR_No, ISNULL(C.MFGOrderNo, '') AS MFGOrderNo, C.DocNo, C.Status, C.Requester, C.Division, '' AS Fac, ISNULL(C.[CASE], '') AS [CASE], C.PartNo, C.ItemNo, ISNULL(C.MatLot, '') AS MatLot, C.ItemNo AS SPEC,
            C.Process, C.MCType, C.MCNo, ISNULL(C.STOCK_ON_HAND, 0) AS ON_HAND, C.Req_QTY, C.QTY, C.DateTime_Record AS DueDate, C.DateTime_Record, ISNULL(C.Remark, '') AS Remark, C.DateComplete, '' AS PhoneNo, C.ItemNo AS ItemName,
            '' AS ACCOUNT, '' AS ToolingType,
            C.AS400STATUS,
            ISNULL(C.MAIN_LOCATION, '') AS Stock_Location,
            1 AS isMockTest,
            'CaseSetup' AS MockSource
          FROM [dbo].[TestCaseSetupList] C WITH (NOLOCK)
          WHERE C.Status IN ('Complete', 'CompleteToExcel')
            AND C.Public_Id LIKE 'TEST-CS-%'
        `);
        mockRecords = testResult.recordset.map(row => ({
          ...row,
          isMockTest: true
        }));
      }
    } catch (testErr) {
      console.warn('Failed to fetch test data for History:', testErr.message);
    }
    
    // Combine real data with mock test data
    historyResult.recordset = [...mockRecords, ...historyResult.recordset];
    // ==================================

    // 2. Query MCNo6Digit mapping from database tables
    const mcMappingResult = await pool
      .request()
      .query(`
        SELECT Public_Id, MCNo6Digit FROM [dbo].[tb_IssueCuttingTool_Request_Document] WHERE Public_Id IS NOT NULL
        UNION ALL
        SELECT Public_Id, MCNo6Digit FROM [dbo].[tb_IssueSetupTool_Request_Document] WHERE Public_Id IS NOT NULL
      `);

    // The history stored procedure does not expose Comment_Status.
    // Read it from the source tables without changing the database object.
    const commentStatusResult = await pool
      .request()
      .query(`
        SELECT Public_Id, Comment_Status FROM [dbo].[tb_IssueCuttingTool_Request_Document] WHERE Public_Id IS NOT NULL
        UNION ALL
        SELECT Public_Id, Comment_Status FROM [dbo].[tb_IssueSetupTool_Request_Document] WHERE Public_Id IS NOT NULL
      `);

    // 3. Query MC_Code and MC_Name mappings from tb_Machine_Model
    const machineModelResult = await pool
      .request()
      .query(`
        SELECT MC_Code, MC_Name FROM [dbo].[tb_Machine_Model]
      `);

    // Create maps for fast lookup
    const mcMap = new Map();
    mcMappingResult.recordset.forEach(row => {
      if (row.Public_Id) {
        mcMap.set(row.Public_Id.trim(), row.MCNo6Digit);
      }
    });

    const commentStatusMap = new Map();
    commentStatusResult.recordset.forEach(row => {
      if (row.Public_Id) {
        commentStatusMap.set(row.Public_Id.trim(), row.Comment_Status || '');
      }
    });

    const modelMap = new Map();
    machineModelResult.recordset.forEach(row => {
      if (row.MC_Name) {
        modelMap.set(row.MC_Name.trim().toUpperCase(), row.MC_Code ? row.MC_Code.trim() : '');
      }
    });

    // 4. Map MCNo6Digit and MC_Code to history records
    const enrichedRecordset = historyResult.recordset.map(item => {
      const publicId = item.ID_Request || item.Public_Id;
      const cleanPublicId = publicId ? publicId.trim() : '';
      const mcTypeKey = item.MCType ? item.MCType.trim().toUpperCase() : '';
      const mcCode = modelMap.get(mcTypeKey) || '';

      return {
        ...item,
        MC_Code: mcCode,
        MCNo6Digit: mcMap.get(cleanPublicId) || item.MCNo6Digit || null,
        Comment_Status: (item.Comment_Status && item.Comment_Status.trim() !== '')
          ? item.Comment_Status
          : (commentStatusMap.get(cleanPublicId) || '')
      };
    });

    // 5. Sort by PartNo and ItemNo in the controller
    enrichedRecordset.sort((a, b) => {
      const partComp = (a.PartNo || '').toString().localeCompare((b.PartNo || '').toString(), undefined, { numeric: true, sensitivity: 'base' });
      if (partComp !== 0) return partComp;
      return (a.ItemNo || '').toString().localeCompare((b.ItemNo || '').toString(), undefined, { numeric: true, sensitivity: 'base' });
    });

    historyCacheData = enrichedRecordset;
    lastHistoryFetchTime = Date.now();

    res.json(enrichedRecordset);
  }
  catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * @api {PUT} /Purchase_History/update
 * @description Update MFGOrderNo and DocNo for a history record
 */
exports.Update_History_Fields = async (req, res) => {
  try {
    const { Public_Id, MFGOrderNo, DocNo, ItemNo, DateComplete, QTY, Remark } = req.body;
    if (!Public_Id) return res.status(400).json({ success: false, message: "Public_Id is required" });

    // === MOCK DATA INTERCEPTION ===
    if (Public_Id.startsWith('TEST-')) {
      const { poolRequestIndirrecPromise } = require('../config/database');
      const poolIndirrec = await poolRequestIndirrecPromise;
      
      const isCaseSetup = Public_Id.startsWith('TEST-CS-');
      const targetTestTable = isCaseSetup ? '[dbo].[TestCaseSetupList]' : '[dbo].[TestPurchaseRequestList]';

      const mockResult = await poolIndirrec.request()
        .input("Public_Id", sql.NVarChar, Public_Id)
        .input("MFGOrderNo", sql.NVarChar, MFGOrderNo || null)
        .input("DocNo", sql.NVarChar, DocNo || null)
        .input("ItemNo", sql.NVarChar, ItemNo || null)
        .input("DateComplete", sql.DateTime, DateComplete || null)
        .input("QTY", sql.Decimal(18, 2), QTY !== undefined ? QTY : null)
        .input("Remark", sql.NVarChar, Remark !== undefined ? Remark : null)
        .query(`
          UPDATE ${targetTestTable}
          SET MFGOrderNo = @MFGOrderNo,
              DocNo = @DocNo,
              ItemNo = @ItemNo,
              DateComplete = ISNULL(@DateComplete, DateComplete),
              QTY = ISNULL(@QTY, QTY),
              Remark = @Remark
          WHERE Public_Id = @Public_Id
        `);

      if (mockResult.rowsAffected[0] > 0) {
        historyCacheData = null; // Invalidate cache
        return res.json({ success: true, message: "Mock data updated successfully" });
      } else {
        return res.status(404).json({ success: false, message: "Mock record not found" });
      }
    }
    // ==================================

    const pool = await poolPromise;
    const isCutting = Public_Id.startsWith('C');
    const isSetup = Public_Id.startsWith('S');
    if (!isCutting && !isSetup) return res.status(400).json({ success: false, message: "Invalid Public_Id format" });

    const targetTable = isCutting
      ? '[dbo].[tb_IssueCuttingTool_Request_Document]'
      : '[dbo].[tb_IssueSetupTool_Request_Document]';

    const result = await pool.request()
      .input("Public_Id", sql.NVarChar, Public_Id)
      .input("MFGOrderNo", sql.NVarChar, MFGOrderNo || null)
      .input("DocNo", sql.NVarChar, DocNo || null)
      .input("ItemNo", sql.NVarChar, ItemNo || null)
      .input("DateComplete", sql.DateTime, DateComplete || null)
      .input("QTY", sql.Decimal(18, 2), QTY !== undefined ? QTY : null)
      .input("Remark", sql.NVarChar, Remark !== undefined ? Remark : null)
      .query(`
        UPDATE ${targetTable}
        SET MFGOrderNo = @MFGOrderNo,
            DocNo = @DocNo,
            ItemNo = @ItemNo,
            DateComplete = ISNULL(@DateComplete, DateComplete),
            QTY = ISNULL(@QTY, QTY),
            Remark = @Remark
        WHERE Public_Id = @Public_Id
      `);

    if (result.rowsAffected[0] > 0) {
      historyCacheData = null; // Invalidate cache
      res.json({ success: true, message: "Updated successfully" });
    } else {
      res.status(404).json({ success: false, message: "Record not found" });
    }
  } catch (error) {
    console.error("Update_History_Fields Error:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

exports.clearHistoryCache = () => {
  historyCacheData = null;
  lastHistoryFetchTime = 0;
};

