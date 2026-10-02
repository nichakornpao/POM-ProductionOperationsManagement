const { poolPromise, poolPurchaseAutoloadPromise } = require("../config/database");
const sql = require("mssql");
// Email system removed — all notifications now handled via Web Socket/DB only
const { emitNotification } = require("./Notification.controller");
const { EVENT_TYPES, resolveDivisionId } = require('../utils/notification.constants');

// In-memory cache for Stock FreshQty & ItemNo Master to dramatically reduce DB I/O and query latency
let globalStockMapCache = new Map();
let lastStockFetchTime = 0;
const STOCK_CACHE_TTL_MS = 30000; // 30 seconds

async function fetchFreshQtyStockMap(pool, itemNos) {
  const now = Date.now();
  if (now - lastStockFetchTime < STOCK_CACHE_TTL_MS && globalStockMapCache.size > 0) {
    const stockMap = {};
    itemNos.forEach(no => {
      stockMap[no] = globalStockMapCache.get(no) || 0;
    });
    return stockMap;
  }

  if (!itemNos || itemNos.length === 0) return {};

  try {
    const stockRequest = pool.request();
    const itemNoListStr = itemNos.map((no, idx) => {
      const paramName = `itemNo${idx}`;
      stockRequest.input(paramName, sql.NVarChar, no);
      return `@${paramName}`;
    }).join(',');

    const stockTimeout = new Promise(resolve => setTimeout(() => resolve(null), 500));
    const stockQueryPromise = stockRequest.query(`
      SELECT ToolingName, SUM(FreshQty) as FreshQty
      FROM (
        SELECT ToolingName, FreshQty FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack] WHERE ToolingName IN (${itemNoListStr})
        UNION ALL
        SELECT ToolingName, FreshQty FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack] WHERE ToolingName IN (${itemNoListStr})
      ) S
      GROUP BY ToolingName;
    `);

    const stockResult = await Promise.race([stockQueryPromise, stockTimeout]);

    const newStockMap = {};
    const freshCache = new Map();
    if (stockResult && stockResult.recordset) {
      stockResult.recordset.forEach(s => {
        if (s.ToolingName) {
          freshCache.set(s.ToolingName, s.FreshQty || 0);
          newStockMap[s.ToolingName] = s.FreshQty || 0;
        }
      });
      globalStockMapCache = freshCache;
      lastStockFetchTime = now;
    }
    return newStockMap;
  } catch (err) {
    console.error('[fetchFreshQtyStockMap] Error fetching stock:', err.message);
    return {};
  }
}

let itemNoCacheData = null;
let lastItemNoFetchTime = 0;
const ITEM_NO_CACHE_TTL_MS = 60000; // 60 seconds

// In-memory cache for Requester -> PhoneNo
let globalRequesterPhoneMap = new Map();
let lastPhoneMapFetchTime = 0;
const PHONE_CACHE_TTL_MS = 60000; // 60 seconds

async function fillRequesterPhoneFallback(pool, rows) {
  if (!rows || rows.length === 0) return;
  const now = Date.now();
  if (now - lastPhoneMapFetchTime > PHONE_CACHE_TTL_MS || globalRequesterPhoneMap.size === 0) {
    try {
      const phoneRes = await pool.request().query(`
        SELECT Requester, MAX(PhoneNo) as PhoneNo
        FROM (
          SELECT Requester, PhoneNo FROM [db_Tooling].[dbo].[tb_IssueCuttingTool_Request_Document] WHERE PhoneNo IS NOT NULL AND PhoneNo != ''
          UNION ALL
          SELECT Requester, PhoneNo FROM [db_Tooling].[dbo].[tb_IssueSetupTool_Request_Document] WHERE PhoneNo IS NOT NULL AND PhoneNo != ''
        ) t
        GROUP BY Requester
      `);
      const newMap = new Map();
      if (phoneRes && phoneRes.recordset) {
        phoneRes.recordset.forEach(p => {
          if (p.Requester && p.PhoneNo) {
            newMap.set(p.Requester, p.PhoneNo);
          }
        });
      }
      globalRequesterPhoneMap = newMap;
      lastPhoneMapFetchTime = now;
    } catch (e) {
      console.warn('[fillRequesterPhoneFallback] Error caching phone map:', e.message);
    }
  }

  rows.forEach(r => {
    if (!r.PhoneNo || String(r.PhoneNo).trim() === '') {
      r.PhoneNo = globalRequesterPhoneMap.get(r.Requester) || '';
    }
  });
}

/**
 * API: ดึงข้อมูลรายการเบิกเครื่องมือตัด (Cutting Tool)
 * หน้าที่: ดึงรายการสั่งซื้อ Cutting Tool ที่พนักงานเบิกค้างอยู่ (Waiting) มาแสดงให้ PH ดู
 */
exports.Detail_Purchase = async (req, res) => {
  let rows = [];
  try {
    console.log('[Detail_Purchase] Starting SP call...');
    const pool = await poolPromise;
    console.log('[Detail_Purchase] Pool acquired, executing trans.Stored_Detail_Purchase');

    const result = await pool.request().execute('trans.Stored_Detail_Purchase');
    rows = result.recordset || [];
    console.log(`[Detail_Purchase] SP returned ${rows.length} rows`);

    if (rows.length > 0) {
      // Fetch FreshQty dynamically from stock (using 30s TTL cache)
      const itemNos = [...new Set(rows.map(r => r.ItemNo).filter(Boolean))];
      if (itemNos.length > 0) {
        try {
          const stockMap = await fetchFreshQtyStockMap(pool, itemNos);
          rows.forEach(r => {
            r.FreshQty = stockMap[r.ItemNo] || 0;
          });
        } catch (stockErr) {
          console.error('[Detail_Purchase] Error fetching FreshQty stock:', stockErr.message);
        }
      }
      // Log Division + Status + CASE distribution to diagnose GM visibility
      const divStatusCounts = {};
      rows.forEach(r => {
        const key = `${r.Division}|${r.Status}`;
        divStatusCounts[key] = (divStatusCounts[key] || 0) + 1;
      });
      console.log('[Detail_Purchase] Division|Status distribution:', JSON.stringify(divStatusCounts));
      // Log CASE values for GM rows — frontend filters out CASE='SET'
      const gmRows = rows.filter(r => r.Division === '7122');
      const gmCaseCounts = {};
      gmRows.forEach(r => { gmCaseCounts[r.CASE || '(null)'] = (gmCaseCounts[r.CASE || '(null)'] || 0) + 1; });
      console.log('[Detail_Purchase] GM CASE distribution:', JSON.stringify(gmCaseCounts));
    } else {
      // Diagnostic: try a direct table count
      try {
        const countResult = await pool.request().query(`
          SELECT COUNT(*) AS cnt FROM [dbo].[tb_IssueCuttingTool_Request_Document]
          WHERE Status IN ('Waiting','In Progress','Complete','CompletetoExcel')
        `);
        console.log('[Detail_Purchase] ⚠️ SP returned 0 rows. Direct table count (Waiting/InProgress/Complete):', countResult.recordset[0].cnt);

        const viewCheck = await pool.request().query(`
          SELECT TOP 1 * FROM INFORMATION_SCHEMA.VIEWS
          WHERE TABLE_SCHEMA = 'viewer' AND TABLE_NAME = 'View_IssueCuttingTool_Request_Document'
        `);
        console.log('[Detail_Purchase] View exists?', viewCheck.recordset.length > 0 ? 'YES' : '❌ NO — View not found!');
      } catch (diagErr) {
        console.error('[Detail_Purchase] Diagnostic query failed:', diagErr.message);
      }
    }
  } catch (error) {
    console.error("[Detail_Purchase] ❌ Error fetching real data:", error.message);
  }

  // ====================================================================
  // MOCK DATA INTERCEPTION
  let testRecords = [];
  try {
    const { poolRequestIndirrecPromise } = require('../config/database');
    const indirrecTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
    const poolIndirrec = await Promise.race([poolRequestIndirrecPromise, indirrecTimeout]);

    if (poolIndirrec) {
      const countResult = await poolIndirrec.request().query(`
        IF OBJECT_ID('[dbo].[TestPurchaseRequestList]', 'U') IS NOT NULL 
          SELECT COUNT(*) AS cnt FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-%' AND Status IN ('Waiting', 'Hold', 'In Progress')
        ELSE 
          SELECT -1 AS cnt
      `);
      const cnt = countResult.recordset[0].cnt;

      if (cnt > 0) {
        const testResult = await poolIndirrec.request().query(`
          SELECT 
            T.Public_Id, 1 AS ID_Request, T.DateTime_Record, T.DateTime_Record AS DueDate, 
            T.ItemNo AS Req_ItemNo, T.ItemNo, T.PartNo, T.ItemNo AS SPEC, T.ItemNo AS ItemName, T.QTY, T.Req_QTY,
            T.Division, T.Process, T.MCNo, T.Requester AS Req_By,
            CASE WHEN T.Status = 'Waiting' THEN 'Waiting' ELSE T.Status END AS Status,
            T.AS400STATUS, ISNULL(T.MAIN_LOCATION, '') AS Stock_Location,
            ISNULL(T.STOCK_ON_HAND, 0) AS STOCK_ON_HAND,
            ISNULL(T.STOCK_ON_HAND, 0) AS ON_HAND,
            ISNULL(T.MatLot, '') AS MatLot,
            ISNULL(T.Remark, '') AS Remark,
            ISNULL(T.FreshQty, 0) AS FreshQty,
            T.MCType, T.MFGOrderNo, T.DocNo, T.[CASE] AS [CASE]
          FROM [dbo].[TestPurchaseRequestList] T WITH (NOLOCK)
          WHERE T.Status IN ('Waiting', 'Hold', 'In Progress')
            AND T.Public_Id LIKE 'TEST-%'
          ORDER BY T.ItemNo ASC
        `);

        testRecords = testResult.recordset.map(row => ({
          ...row,
          isMockTest: true,
          dataSource: 'TestPurchaseRequestList'
        }));
      }
    }
  } catch (testErr) {
    console.warn('Failed to fetch test data for RequestList:', testErr.message);
  }

  const finalResult = [...testRecords, ...rows];

  if (finalResult.length > 0) {
    try {
      const pool = await poolPromise; // ensure pool is available
      const stockResult = await pool.request().query(`
        SELECT ToolingName, SUM(FreshQty) as FreshQty
        FROM (
          SELECT ToolingName, FreshQty FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack] WITH (NOLOCK)
          UNION ALL
          SELECT ToolingName, FreshQty FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack] WITH (NOLOCK)
        ) S
        GROUP BY ToolingName;
      `);

      const stockMap = {};
      (stockResult.recordset || []).forEach(s => {
        stockMap[s.ToolingName] = s.FreshQty;
      });

      finalResult.forEach(r => {
        if (!r.isMockTest) {
          r.FreshQty = stockMap[r.ItemNo] || 0;
        }
      });
    } catch (stockErr) {
      console.error('[Detail_Purchase] Error fetching FreshQty stock for finalResult:', stockErr.message);
    }
  }

  try {
    const pool = await poolPromise;
    await fillRequesterPhoneFallback(pool, finalResult);
  } catch (phoneErr) {
    console.warn('[Detail_Purchase] Phone fallback error:', phoneErr.message);
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private'); res.json(finalResult);
};

/**
 * API: ดึงข้อมูลรายการเบิกเครื่องมือติดตั้ง (Setup Tool)
 * หน้าที่: ดึงรายการสั่งซื้อ Setup Tool ที่ค้างอยู่ (Waiting) เพื่อแยกเป็นอีกตารางหนึ่งให้ PH ทำงาน
 */
exports.Detail_Purchase_Setup = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().execute('trans.Stored_Detail_Purchase_Setup');
    const rows = result.recordset || [];

    if (rows.length > 0) {
      await fillRequesterPhoneFallback(pool, rows);
      return res.json(rows);
    }

    // Direct fallback query if SP returns 0
    const fallback = await pool.request().query(`
      SELECT *
      FROM [db_Tooling].[viewer].[View_IssueSetupTool_Request_Document]
      WHERE Status IN ('Waiting','In Progress', 'Complete', 'CompletetoExcel')
        AND DateTime_Record >= DATEADD(day, -90, GETDATE())
      ORDER BY DateTime_Record ASC
    `);
    const fallbackRows = fallback.recordset || [];
    await fillRequesterPhoneFallback(pool, fallbackRows);
    return res.json(fallbackRows);
  } catch (error) {
    console.error("[Detail_Purchase_Setup] ❌ Error:", error.message);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ดึงข้อมูลรายการ Case Setup
 * หน้าที่: ดึงรายการขอ Case Setup ที่ค้างอยู่ มาแสดงโดยเรียงตามวันที่ที่ต้องใช้ของ (DueDate) เพื่อให้รู้ว่างานไหนรีบ
 */
exports.Detail_CaseSetup = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().execute('trans.Stored_Detail_CaseSetup');
    const rows = result.recordset || [];

    if (rows.length > 0) {
      // Fetch FreshQty dynamically from stock (using 30s TTL cache)
      const itemNos = [...new Set(rows.map(r => r.ItemNo).filter(Boolean))];
      if (itemNos.length > 0) {
        try {
          const stockMap = await fetchFreshQtyStockMap(pool, itemNos);
          rows.forEach(r => {
            r.FreshQty = stockMap[r.ItemNo] || 0;
          });
        } catch (stockErr) {
          console.error('[Detail_CaseSetup] Error fetching FreshQty stock:', stockErr.message);
        }
      }
    }

    // ====================================================================
    // MOCK DATA INTERCEPTION FOR CASE SETUP
    let testRecords = [];
    try {
      const { poolRequestIndirrecPromise } = require('../config/database');
      const indirrecTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
      const poolIndirrec = await Promise.race([poolRequestIndirrecPromise, indirrecTimeout]);
  
      if (poolIndirrec) {
        const countResult = await poolIndirrec.request().query(`
          IF OBJECT_ID('[dbo].[TestCaseSetupList]', 'U') IS NOT NULL 
            SELECT COUNT(*) AS cnt FROM [dbo].[TestCaseSetupList] WHERE Public_Id LIKE 'TEST-CS-%' AND Status IN ('Waiting', 'Hold', 'In Progress')
          ELSE 
            SELECT -1 AS cnt
        `);
        const cnt = countResult.recordset[0].cnt;
  
        if (cnt > 0) {
          const testResult = await poolIndirrec.request().query(`
            SELECT 
              C.Public_Id, 1 AS ID_RequestSetupTool, C.DateTime_Record, C.DateTime_Record AS DueDate, 
              C.ItemNo AS Req_ItemNo, C.ItemNo, C.PartNo, C.ItemNo AS SPEC, C.ItemNo AS ItemName, C.QTY, C.Req_QTY,
              C.Division, C.Process, C.MCNo, C.Requester AS Req_By,
              CASE WHEN C.Status = 'Waiting' THEN 'Waiting' ELSE C.Status END AS Status,
              C.AS400STATUS, ISNULL(C.MAIN_LOCATION, '') AS Stock_Location,
              ISNULL(C.STOCK_ON_HAND, 0) AS STOCK_ON_HAND,
              ISNULL(C.STOCK_ON_HAND, 0) AS ON_HAND,
              ISNULL(C.MatLot, '') AS MatLot,
              ISNULL(C.Remark, '') AS Remark,
              C.MCType, C.MFGOrderNo, C.DocNo, C.[CASE] AS [CASE]
            FROM [dbo].[TestCaseSetupList] C WITH (NOLOCK)
            WHERE C.Status IN ('Waiting', 'Hold', 'In Progress')
              AND C.Public_Id LIKE 'TEST-CS-%'
            ORDER BY C.ItemNo ASC
          `);
  
          testRecords = testResult.recordset.map(row => ({
            ...row,
            isMockTest: true,
            TableType: 'Setup',
            dataSource: 'TestCaseSetupList'
          }));
        }
      }
    } catch (testErr) {
      console.warn('Failed to fetch test data for CaseSetupList:', testErr.message);
    }
  
    const finalResult = [...testRecords, ...rows];
    try {
      await fillRequesterPhoneFallback(pool, finalResult);
    } catch (phoneErr) {
      console.warn('[Detail_CaseSetup] Phone fallback error:', phoneErr.message);
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private'); res.json(finalResult);

  } catch (error) {
    console.error("Error executing query:", error.stack);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
/**
 * API: ค้นหารายการเครื่องมือทั้งหมดในคลัง (Item Master)
 * หน้าที่: เอาไว้ใช้ในระบบค้นหา (Search) คลังสินค้าบนหน้าเว็บแบบพิมพ์แล้วแสดงรายชื่อเครื่องมือที่ตรงกันขึ้นมาให้ User เลือก
 *
 * Reads [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw] on pbgm8g directly (kept fresh by
 * auto_load_item_master.py) instead of trans.Stored_Get_ItemNo, which selected from
 * [db_Tooling].[viewer].[View_tb_Master_Purchase_SUM_ALL] (pbp155) — primary source.
 * Falls back to [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw] (pbgm8g) only if SP returns 0 rows.
 */
const getItemsQuery = async (req, res) => {
  try {
    const now = Date.now();
    if (itemNoCacheData && (now - lastItemNoFetchTime < ITEM_NO_CACHE_TTL_MS)) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(itemNoCacheData);
    }

    let items = [];
    const pbgmTimeout = new Promise(resolve => setTimeout(() => resolve(null), 500));
    const poolPbgm = await Promise.race([poolPurchaseAutoloadPromise, pbgmTimeout]);

    if (poolPbgm) {
      try {
        const queryPromise = poolPbgm.request().query(`
          SELECT item_no, item_name, spec, stock_loc, on_hand, filter_range, account_code
          FROM [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw]
          WHERE item_no IS NOT NULL
        `);
        const result = await Promise.race([queryPromise, pbgmTimeout]);

        if (result && result.recordset) {
          items = result.recordset.map(row => ({
            ItemNo: row.item_no,
            ItemName: row.item_name,
            SPEC: row.spec,
            MAIN_LOCATION: row.stock_loc,
            ON_HAND: row.on_hand,
            ACCOUNT: row.account_code,
            Division_Id: (row.filter_range || '').toString().includes('T271DZ') ? 2 : 3
          }));
        }
      } catch (pbgmErr) {
        console.error('[getItemsQuery] Error fetching from PurchaseAutoload:', pbgmErr.message);
      }
    }

    if (items.length === 0) {
      const pool = await poolPromise;
      const result = await pool.request().execute('trans.Stored_Get_ItemNo');
      items = result.recordset || [];
    }

    itemNoCacheData = JSON.stringify(items);
    lastItemNoFetchTime = now;

    res.setHeader('Content-Type', 'application/json');
    return res.send(itemNoCacheData);
  } catch (error) {
    console.error("Error executing query:", error.stack);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

exports.Get_ItemNo = getItemsQuery;
exports.get_ItemNo = getItemsQuery;

// sendCompletionEmail removed — email system decommissioned

/**
 * API: เปลี่ยนสถานะรายการขอเบิก
 * หน้าที่: ทำงานเวลากดปุ่มเปลี่ยนสถานะตามตาราง เช่น เปลี่ยนจาก "Waiting" ไปเป็น "Complete"
 * รองรับการเปลี่ยนทีละหลายๆ แถวพร้อมกันได้เลย
 */
exports.Update_Status_Purchase = async (req, res) => {
  try {
    const { ID_Request, Status, TableType } = req.body || {};

    let idList = Array.isArray(ID_Request) ? ID_Request : (ID_Request !== undefined ? [ID_Request] : []);

    if (!idList.length) return res.status(400).json({ success: false, message: "No valid ID_Request" });
    if (!Status) return res.status(400).json({ success: false, message: "Status is required" });

    const pool = await poolPromise;
    const usesPublicId = typeof idList[0] === 'string';

    // === MOCK DATA INTERCEPTION ===
    const hasTestWord = idList.some(id => typeof id === 'string' && id.toUpperCase().includes('TEST')) ||
      Object.values(req.body).some(val => typeof val === 'string' && val.toUpperCase().includes('TEST'));

    if (hasTestWord) {
      try {
        const { poolRequestIndirrecPromise } = require('../config/database');
        const poolIndirrec = await poolRequestIndirrecPromise;
        const placeholders = idList.map((_, i) => `@id${i}`).join(", ");
        const sqlReq = require('mssql');
        const rq = poolIndirrec.request();
        rq.input("Status", sqlReq.NVarChar, Status);
        idList.forEach((id, i) => rq.input(`id${i}`, sqlReq.NVarChar, id));

        await rq.query(`
          UPDATE [dbo].[TestPurchaseRequestList]
          SET Status = @Status,
              DateComplete = CASE WHEN @Status = N'Complete' THEN SYSDATETIME() ELSE DateComplete END,
              AS400STATUS = CASE WHEN @Status = N'Complete' THEN N'Pending' ELSE AS400STATUS END
          WHERE Public_Id IN (${placeholders})
        `);
        return res.json({ success: true, message: "Mock data status updated successfully", updatedRows: idList.length });
      } catch (mockErr) {
        return res.status(500).json({ success: false, message: "Failed to update mock data", error: mockErr.message });
      }
    }
    // ================================

    const performUpdate = async (type, ids) => {
      const targetTable = type === 'Setup' ? 'dbo.tb_IssueSetupTool_Request_Document' : 'dbo.tb_IssueCuttingTool_Request_Document';
      const isPublicId = typeof ids[0] === 'string';
      const idColumn = isPublicId ? 'Public_Id' : (type === 'Setup' ? 'ID_RequestSetupTool' : 'ID_Request');

      const rq = pool.request();
      rq.input("Status", sql.NVarChar, Status);

      let whereClause = "";
      if (isPublicId) {
        const placeholders = ids.map((_, i) => `@id${i}`).join(", ");
        ids.forEach((id, i) => rq.input(`id${i}`, sql.NVarChar, id));
        whereClause = `${idColumn} IN (${placeholders})`;
      } else {
        const numericIds = ids.map(Number);
        const placeholders = numericIds.map((_, i) => `@id${i}`).join(", ");
        numericIds.forEach((id, i) => rq.input(`id${i}`, sql.Int, id));
        whereClause = `${idColumn} IN (${placeholders})`;
      }



      // 1. Perform Update (with duplicate prevention)
      await rq.query(`
        UPDATE d
        SET d.Status = @Status,
            d.DateComplete = CASE WHEN @Status = N'Complete' THEN SYSDATETIME() ELSE d.DateComplete END,
            d.AS400STATUS = CASE WHEN @Status = N'Complete' THEN N'Pending' ELSE d.AS400STATUS END
        FROM ${targetTable} d
        WHERE ${whereClause}
          AND (d.Status != N'Complete' OR @Status != N'Complete')
          AND (d.AS400STATUS IS NULL OR d.AS400STATUS = N'' OR d.AS400STATUS NOT IN (N'Pending', N'DONE'));
      `);

      // 2. Fetch Updated Rows (Safe approach without OUTPUT)
      const idCol = type === 'Setup' ? 'ID_RequestSetupTool' : 'ID_Request';
      const selectResult = await rq.query(`
        SELECT ${idCol}, Requester, DocNo, PartNo, Division, ItemNo, SPEC, Process, MCType, MCNo, [CASE], Unique_Id, Public_Id,
               QTY, ISNULL(ON_HAND, 0) AS ON_HAND, MatLot, MFGOrderNo, MCNo6Digit, AS400STATUS
        FROM ${targetTable}
        WHERE ${whereClause.replace(/d\./g, '')};
      `);

      return selectResult.recordset;
    };

    let allUpdatedRows = [];
    let rowsUpdatedCount = 0;
    let finalTableType = TableType;

    const processNotification = async (rows, type) => {
      if (!rows || rows.length === 0 || Status !== "Complete") return;

      const processedUniqueIds = new Set();
      const processedDocNos = new Set();

      for (const row of rows) {
        try {
          const uniqueId = row.Unique_Id;

          // CASE 1: Grouped Notification (CaseSet)
          if (uniqueId && uniqueId !== 'NULL') {
            if (processedUniqueIds.has(uniqueId)) continue;
            processedUniqueIds.add(uniqueId);

            const partNo = row.PartNo || '-';
            // Fetch all items in this set across BOTH tables
            const setQuery = `
              SELECT Public_Id, PartNo, ItemNo, ItemName, SPEC, Status, DocNo, QTY, DueDate, After_DueDate
              FROM dbo.tb_IssueCuttingTool_Request_Document WHERE Unique_Id = @uid
              UNION ALL
              SELECT Public_Id, PartNo, ItemNo, ItemName, SPEC, Status, DocNo, QTY, DueDate, After_DueDate
              FROM dbo.tb_IssueSetupTool_Request_Document WHERE Unique_Id = @uid
            `;
            const setRes = await pool.request().input('uid', sql.NVarChar, uniqueId).query(setQuery);
            const allItems = setRes.recordset;

            const total = allItems.length;
            const completeItems = allItems.filter(it => it.Status === 'Complete');
            const complete = completeItems.length;
            const isAllFinished = total === complete && total > 0;
            const progressStr = `(${complete}/${total})`;

            const divId = resolveDivisionId(row.Division);
            await emitNotification(req, pool, {
              eventType: EVENT_TYPES.REQUEST_COMPLETED,
              subject: `${isAllFinished ? '✅' : '⏳'} [Grouped] Tooling for Part ${partNo} progress ${progressStr}`,
              docNo: uniqueId,
              actionBy: (req.user && req.user.Name) ? req.user.Name : 'Purchase',
              targetRoles: row.Requester,
              ctaRoute: '/production/request-history',
              division: row.Division,
              divisionId: divId,
              detailsJson: { uniqueId: uniqueId, lookupType: 'uniqueId', items: allItems, type: 'grouped_request_completed', total: total, complete: complete, isFinished: isAllFinished, PartNo: partNo }
            });
          }
          // CASE 2: Grouped Notification by DocNo (Standalone items grouped by PC Request)
          else {
            const docNo = row.DocNo;
            const publicId = row.Public_Id;
            const groupKey = docNo || publicId;

            if (processedDocNos.has(groupKey)) continue;
            processedDocNos.add(groupKey);

            const lookupCol = docNo ? 'DocNo' : 'Public_Id';
            const lookupVal = groupKey;

            const groupQuery = `
              SELECT Public_Id, PartNo, ItemNo, ItemName, SPEC, Status, DocNo, QTY, DueDate, After_DueDate
              FROM dbo.tb_IssueCuttingTool_Request_Document WHERE ${lookupCol} = @lookup
              UNION ALL
              SELECT Public_Id, PartNo, ItemNo, ItemName, SPEC, Status, DocNo, QTY, DueDate, After_DueDate
              FROM dbo.tb_IssueSetupTool_Request_Document WHERE ${lookupCol} = @lookup
            `;
            const groupRes = await pool.request().input('lookup', sql.NVarChar, lookupVal).query(groupQuery);
            const groupItems = groupRes.recordset;

            const total = groupItems.length;
            const completeItems = groupItems.filter(it => it.Status === 'Complete');
            const complete = completeItems.length;
            const isAllFinished = total === complete && total > 0;

            const progressStr = total > 1 ? ` (${complete}/${total})` : '';
            const statusIcon = isAllFinished ? '✅' : '⏳';
            const subject = total > 1
              ? `${statusIcon} [Confirmed] Request ${groupKey} progress${progressStr}`
              : `✅ [Confirmed] Request ${groupKey} is ready.`;

            const divId = resolveDivisionId(row.Division);

            await emitNotification(req, pool, {
              eventType: EVENT_TYPES.REQUEST_COMPLETED,
              subject: subject,
              docNo: groupKey,
              actionBy: (req.user && req.user.Name) ? req.user.Name : 'Purchase',
              targetRoles: `${row.Requester},production`,
              ctaRoute: '/production/request-history',
              division: row.Division,
              divisionId: divId,
              detailsJson: {
                docNo: docNo || null,
                publicId: !docNo ? publicId : null,
                lookupType: docNo ? 'docNo' : 'publicId',
                items: groupItems,
                type: 'grouped_request_completed',
                total: total,
                complete: complete,
                isFinished: isAllFinished,
                PartNo: row.PartNo || '-'
              }
            });
          }
        } catch (notifErr) {
          console.error('[Notification] Failed to emit for row:', row.DocNo || row.Public_Id, notifErr);
        }
      }
    };

    if (usesPublicId) {
      const cuttingIds = idList.filter(id => id.startsWith('C'));
      const setupIds = idList.filter(id => id.startsWith('S'));

      if (cuttingIds.length) {
        const rows = await performUpdate('Cutting', cuttingIds);
        if (rows.length > 0) {
          rowsUpdatedCount += rows.length;
          finalTableType = 'Cutting';
          if (Status === "Complete") {
            await processNotification(rows, 'Cutting');
          }
        }
      }
      if (setupIds.length) {
        const rows = await performUpdate('Setup', setupIds);
        if (rows.length > 0) {
          rowsUpdatedCount += rows.length;
          finalTableType = 'Setup';
          if (Status === "Complete") {
            await processNotification(rows, 'Setup');
          }
        }
      }
    } else {
      if (['Cutting', 'Setup'].includes(TableType)) {
        const rows = await performUpdate(TableType, idList);
        rowsUpdatedCount = rows.length;
        if (rowsUpdatedCount > 0 && Status === "Complete") {
          await processNotification(rows, TableType);
        }
      } else {
        const cutRows = await performUpdate('Cutting', idList);
        if (cutRows.length > 0) {
          finalTableType = 'Cutting';
          rowsUpdatedCount += cutRows.length;
          if (Status === "Complete") {
            await processNotification(cutRows, 'Cutting');
          }
        } else {
          const setupRows = await performUpdate('Setup', idList);
          if (setupRows.length > 0) {
            finalTableType = 'Setup';
            rowsUpdatedCount += setupRows.length;
            if (Status === "Complete") {
              await processNotification(setupRows, 'Setup');
            }
          }
        }
      }
    }

    try {
      const SSEManager = require('../utils/SSEManager');
      SSEManager.broadcast({ type: 'PLANLIST_UPDATE', message: 'Request status updated' });
    } catch (sseErr) { console.error('SSE Error:', sseErr); }

    return res.json({ success: true, message: `Updated ${rowsUpdatedCount} item(s) in ${finalTableType || 'unknown'} table` });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Update failed", error: err.message });
  }
};

/**
 * API: แก้ไขรายละเอียดตัวหนังสือในตาราง
 * หน้าที่: ทำงานเมื่อ PH พิมพ์ช่องว่างๆ ในตารางเพื่อแก้ไขรายละเอียด เช่น เปลี่ยนจำนวน (QTY), ใส่คอมเมนต์ (Remark), ล็อต แล้วตารางจะเซฟลงฐานข้อมูล
 */
exports.Update_Request = async (req, res) => {
  try {
    const {
      ID_Request, DocNo, Status, Requester, Fac, CASE, PartNo, ItemNo, Process, MCType,
      Req_QTY, Remark, ON_HAND, DueDate, PathDwg, PathLayout, QTY, PhoneNo, MatLot,
      MR_No, MFGOrderNo, ItemName, SPEC, TableType
    } = req.body;

    const cleanPhoneNo = (PhoneNo != null && String(PhoneNo).trim() !== '') ? String(PhoneNo).replace(/\D/g, '') : null;

    // --- MOCK INTERCEPTION ---
    // Broad check: If ANY property contains 'TEST'
    const publicId = req.body.Public_Id || ID_Request;
    const hasTestWord = Object.values(req.body).some(val => typeof val === 'string' && val.toUpperCase().includes('TEST')) ||
      (typeof publicId === 'string' && publicId.toUpperCase().includes('TEST'));
    if (hasTestWord) {
      const { poolRequestIndirrecPromise } = require('../config/database');
      const poolIndirrec = await poolRequestIndirrecPromise;
      if (poolIndirrec) {
        const rq = poolIndirrec.request()
          .input("Public_Id", sql.NVarChar, publicId)
          .input("DocNo", sql.NVarChar, DocNo || null)
          .input("Requester", sql.NVarChar, Requester || req.body.Req_By || null)
          .input("PartNo", sql.NVarChar, PartNo || null)
          .input("ItemNo", sql.NVarChar, ItemNo || null)
          .input("Process", sql.NVarChar, Process || null)
          .input("MCType", sql.NVarChar, MCType || null)
          .input("ON_HAND", sql.Int, ON_HAND || 0)
          .input("STOCK_ON_HAND", sql.Int, ON_HAND || 0)
          .input("QTY", sql.Int, QTY || 0)
          .input("Req_QTY", sql.Int, Req_QTY || 0)
          .input("CASE", sql.NVarChar, CASE || null)
          .input("Remark", sql.NVarChar, Remark || null)
          .input("MatLot", sql.NVarChar, MatLot || null)
          .input("MR_No", sql.NVarChar, MR_No || null)
          .input("MFGOrderNo", sql.NVarChar, MFGOrderNo || null)
          .input("SPEC", sql.NVarChar, SPEC || null)
          .input("MCNo", sql.NVarChar, req.body.MCNo || req.body.MCQTY || null);

        const testResult = await rq.query(`
          UPDATE [dbo].[TestPurchaseRequestList]
          SET DocNo = @DocNo,
              Requester = @Requester,
              PartNo = @PartNo,
              ItemNo = @ItemNo,
              Process = @Process,
              MCType = @MCType,
              QTY = @QTY,
              Req_QTY = @Req_QTY,
              [CASE] = @CASE,
              Remark = @Remark,
              MatLot = @MatLot,
              MFGOrderNo = @MFGOrderNo,
              MCNo = @MCNo,
              STOCK_ON_HAND = @STOCK_ON_HAND
          WHERE Public_Id = @Public_Id
        `);
        return res.json({ success: true, message: "Updated mock successfully" });
      }
    }
    // -------------------------

    const pool = await poolPromise;

    const executeUpdate = async (type, idValue, isPublic = false) => {
      const isCutting = type === 'Cutting';
      const targetTable = isCutting ? '[dbo].[tb_IssueCuttingTool_Request_Document]' : '[dbo].[tb_IssueSetupTool_Request_Document]';
      const idCol = isPublic ? "Public_Id" : (isCutting ? "ID_Request" : "ID_RequestSetupTool");

      const rq = pool.request()
        .input("ID_Val", isPublic ? sql.NVarChar : sql.Int, idValue)
        .input("DocNo", sql.NVarChar, DocNo || null)
        .input("Requester", sql.NVarChar, Requester || req.body.Req_By || null)
        .input("PartNo", sql.NVarChar, PartNo || null)
        .input("ItemNo", sql.NVarChar, ItemNo || null)
        .input("SPEC", sql.NVarChar, SPEC || null)
        .input("Process", sql.NVarChar, Process || null)
        .input("MCType", sql.NVarChar, MCType || null)
        .input("Fac", sql.Int, Fac || null)
        .input("ON_HAND", sql.Int, ON_HAND || 0)
        .input("Req_QTY", sql.Int, Req_QTY || 0)
        .input("QTY", sql.Int, QTY || 0)
        .input("DueDate", sql.DateTime, DueDate ? new Date(DueDate) : null)
        .input("CASE", sql.NVarChar, CASE || null)
        .input("Status", sql.NVarChar, Status || null)
        .input("Remark", sql.NVarChar, Remark !== undefined ? Remark : null)
        .input("PhoneNo", sql.NVarChar, cleanPhoneNo || null)
        .input("MatLot", sql.NVarChar, MatLot || null)
        .input("MR_No", sql.NVarChar, MR_No || null)
        .input("MFGOrderNo", sql.NVarChar, MFGOrderNo || null)
        .input("ItemName", sql.NVarChar, (ItemName || '').substring(0, 255) || null)
        .input("MCNo", sql.NVarChar, req.body.MCNo || req.body.MCQTY || null);

      if (isCutting) {
        rq.input("PathDwg", sql.NVarChar, PathDwg);
        rq.input("PathLayout", sql.NVarChar, PathLayout);
      }

      return await rq.query(`
          UPDATE ${targetTable}
          SET DocNo = COALESCE(@DocNo, DocNo),
              Requester = COALESCE(@Requester, Requester),
              PartNo = COALESCE(@PartNo, PartNo),
              ItemNo = COALESCE(@ItemNo, ItemNo),
              SPEC = COALESCE(@SPEC, SPEC),
              Process = COALESCE(@Process, Process),
              MCType = COALESCE(@MCType, MCType),
              Fac = COALESCE(@Fac, Fac),
              ${isCutting ? 'PathDwg = @PathDwg, PathLayout = @PathLayout,' : ''}
              ON_HAND = @ON_HAND,
              Req_QTY = @Req_QTY,
              QTY = @QTY,
              DueDate = @DueDate,
              [CASE] = COALESCE(@CASE, [CASE]),
              Status = COALESCE(@Status, Status),
              Remark = @Remark,
              PhoneNo = COALESCE(NULLIF(@PhoneNo, ''), PhoneNo),
              MatLot = @MatLot,
              MR_No = COALESCE(@MR_No, MR_No),
              MFGOrderNo = COALESCE(@MFGOrderNo, MFGOrderNo),
              ItemName = COALESCE(@ItemName, ItemName),
              MCNo = COALESCE(@MCNo, MCNo)
          WHERE ${idCol} = @ID_Val
      `);
    };

    let result;
    const reqPublicId = req.body.Public_Id;
    const isPublicIdStr = typeof ID_Request === 'string' && (ID_Request.startsWith('C') || ID_Request.startsWith('S'));
    const hasPublicIdProp = typeof reqPublicId === 'string' && (reqPublicId.startsWith('C') || reqPublicId.startsWith('S'));

    if (isPublicIdStr || hasPublicIdProp) {
      const targetPublicId = isPublicIdStr ? ID_Request : reqPublicId;
      const type = targetPublicId.startsWith('C') ? 'Cutting' : 'Setup';
      result = await executeUpdate(type, targetPublicId, true);
    } else {
      if (['Cutting', 'Setup'].includes(TableType)) {
        result = await executeUpdate(TableType, ID_Request, false);
      } else {
        result = await executeUpdate('Cutting', ID_Request, false);
        if (!result || result.rowsAffected[0] === 0) {
          result = await executeUpdate('Setup', ID_Request, false);
        }
      }
    }

    if (result && result.rowsAffected[0] > 0) {
      res.json({ success: true, message: "Updated successfully" });

      // ==========================================
      // AUTO AS400 REAL-TIME CUT (REAL DATA)
      // ==========================================
      if (Status === 'Complete' && allUpdatedRows && allUpdatedRows.length > 0) {
        const pendingRows = allUpdatedRows.filter(r => r.AS400STATUS === 'Pending');
        if (pendingRows.length > 0) {
          const groupedByDiv = pendingRows.reduce((acc, row) => {
            const div = row.Division;
            if (!acc[div]) acc[div] = [];
            acc[div].push(row);
            return acc;
          }, {});

          const as400Controller = require('./as400.controller');
          
          for (const [div, rows] of Object.entries(groupedByDiv)) {
            const mappedData = rows.map(req => {
              const d = new Date();
              let warehouseVal = "";
              const divCode = (div || '').toString().trim();
              if (divCode === '7122' || divCode === 'GM') {
                warehouseVal = "A";
              } else if (divCode === '71DZ' || divCode === 'PMC') {
                const isSetup = req.Public_Id && req.Public_Id.startsWith('S');
                const isCutting = req.Public_Id && req.Public_Id.startsWith('C');
                if (isSetup) warehouseVal = "F";
                else if (isCutting) warehouseVal = "C";
                else warehouseVal = "C";
              }

              return {
                "ItemNo": req.ItemNo || "",
                "ItemRevision": "",
                "Quantity": req.QTY || 0,
                "ON_HAND": req.ON_HAND || 0,
                "DOCNo": req.DocNo || "",
                "TransactionYear": d.getFullYear().toString(),
                "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
                "TransactionDay": d.getDate().toString().padStart(2, '0'),
                "WareHouse": warehouseVal,
                "StockControl": "",
                "StockLocation": "",
                "MaterialLot": req.MatLot || "",
                "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFGOrderNo || "") : (req.PartNo || ""),
                "Vendor": "",
                "EmpID": "",
                "Pcname": "",
                "MCNo6Digit": req.MCNo6Digit || "",
                "MC_No": req.MCNo || "",
                "MCType": req.MCType || "",
                "Public_Id": req.Public_Id,
                "isMockTest": false
              };
            });

            const reqMock = { body: { division: div, data: mappedData } };
            const resMock = { 
              status: (code) => ({ json: (data) => console.log(`[Auto AS400 Real] Status ${code}:`, data) }),
              json: (data) => console.log(`[Auto AS400 Real] Success:`, data)
            };
            
            setTimeout(() => {
                console.log(`[Auto AS400 Real] Auto-triggering AS400 Export for Division ${div} (${mappedData.length} items)`);
                as400Controller.postAS400(reqMock, resMock).catch(err => console.error('[Auto AS400 Real] Error:', err));
            }, 1000);
          }
        }
      }
      // ==========================================
    } else {
      res.status(404).json({ success: false, message: "Record not found or no changes" });
    }

  } catch (error) {
    console.error("Update_Request Error:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};


/**
 * API: ลบรายการขอเบิกเครื่องมือ
 * หน้าที่: เอาไว้ลบรายการที่พนักงานคีย์ผิดทิ้งออกจากระบบ (รองรับทั้งเครื่องมือตัดและเครื่องมือติดตั้ง ทั้งรหัส Public_Id และ ID ตัวเลข)
 */
exports.DeleteItem = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    const cleanId = String(id).trim();
    const upperId = cleanId.toUpperCase();

    // --- MOCK INTERCEPTION ---
    if (upperId.includes('TEST')) {
      const { poolRequestIndirrecPromise } = require('../config/database');
      const poolIndirrec = await poolRequestIndirrecPromise;
      if (poolIndirrec) {
        await poolIndirrec.request()
          .input("Public_Id", sql.NVarChar, cleanId)
          .query(`DELETE FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id = @Public_Id`);
        return res.status(200).json({ success: true, message: 'Successfully deleted mock data' });
      } else {
        return res.status(500).json({ success: false, message: 'Failed to connect to 8G database' });
      }
    }
    // -------------------------

    const executeDelete = async (type, idValue, isPublic = false) => {
      const isCutting = type === 'Cutting';
      const targetTable = isCutting ? '[dbo].[tb_IssueCuttingTool_Request_Document]' : '[dbo].[tb_IssueSetupTool_Request_Document]';
      const idCol = isPublic ? "Public_Id" : (isCutting ? "ID_Request" : "ID_RequestSetupTool");

      return await pool.request()
        .input("ID_Val", isPublic ? sql.NVarChar : sql.Int, isPublic ? idValue : Number(idValue))
        .query(`DELETE FROM ${targetTable} WHERE ${idCol} = @ID_Val`);
    };

    const isPublic = upperId.startsWith('C') || upperId.startsWith('S');

    if (isPublic) {
      const type = upperId.startsWith('C') ? 'Cutting' : 'Setup';
      await executeDelete(type, cleanId, true);
    } else {
      // For numeric ID, try deleting from Cutting first, then Setup if not found/affected
      const result = await executeDelete('Cutting', cleanId, false);
      if (!result || result.rowsAffected[0] === 0) {
        await executeDelete('Setup', cleanId, false);
      }
    }

    res.status(200).json({ success: true, message: 'Successfully deleted' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};

/**
 * API: สร้างรายการขอเบิกใหม่พร้อมกันเยอะๆ (Add ลงตะกร้าแล้วกดรวดเดียว)
 * หน้าที่: เอาไว้รับตะกร้าที่คนเบิกกดเลือกเครื่องมือหลายๆ ชิ้นมารวดเดียว เพื่อเซฟลงฐานข้อมูลพร้อมกัน ทำให้เซฟได้สะดวกรวดเร็วกว่าคลิกทีละอัน
 */
exports.Add_New_Request_Bulk = async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Invalid input: Expected an array of request items." });
    }

    // --- MOCK INTERCEPTION ---
    const hasTestWord = items.some(item =>
      Object.values(item).some(val => typeof val === 'string' && val.toUpperCase().includes('TEST'))
    );

    if (hasTestWord) {
      // For bulk insert of test data, route to 8G TestPurchaseRequestList
      // Since this is just a simulation, we simulate success to prevent inserting to real DB.
      return res.status(200).json({
        message: 'Mock items processed successfully (Intercepted)',
        details: { totalInserted: items.length, caseSetupInserted: 0, cuttingInserted: 0 }
      });
    }
    // -------------------------

    const pool = await poolPromise;
    const result = await pool.request()
      .input("ItemsJson", sql.NVarChar(sql.MAX), JSON.stringify(items))
      .execute("trans.Stored_Insert_Request_Bulk");

    let totalInserted = result.recordset[0].InsertedCount;
    let totalCaseSetup = result.recordset[0].CaseSetupCount || 0;
    let totalCutting = result.recordset[0].CuttingCount || 0;
    let totalSetup = result.recordset[0].SetupCount || 0;

    res.status(201).json({
      message: 'Bulk insert completed successfully',
      successCount: totalInserted,
      failCount: items.length - totalInserted,
      CaseSetupCount: totalCaseSetup,
      CuttingCount: totalCutting,
      SetupCount: totalSetup
    });

    try {
      const SSEManager = require('../utils/SSEManager');
      SSEManager.broadcast({ type: 'PLANLIST_UPDATE', message: 'New requests created' });
    } catch (sseErr) { console.error('SSE Error:', sseErr); }

    // --- Send Notification ---
    try {
      if (totalInserted > 0 && items.length > 0) {
        const firstItem = items[0];
        const userName = (req.user && req.user.Name) ? req.user.Name : (firstItem.Requester || 'System');
        const countStr = String(totalInserted);

        // Build a clean item snapshot for the notification
        const itemSnapshot = items.map(i => ({
          ItemNo: i.ItemNo || '-',
          ItemName: i.ItemName || '-',
          PartNo: i.PartNo || '-',
          SPEC: i.SPEC || '-',
          Process: i.Process || '-',
          MCType: i.MCType || '-',
          QTY: i.QTY || 0,
          ToolType: i.ToolType || '-',
          DueDate: i.DueDate || '',
          Status: 'Waiting'
        }));

        const divId = resolveDivisionId(firstItem.Division);

        // CREATE A STRICTLY UNIQUE DOC NO FOR THE ENTIRE BULK TO PREVENT DATABASE UPSERT OVERWRITES
        const uniqueDocNo = 'BULK-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000).toString(36);

        await emitNotification(req, pool, {
          eventType: EVENT_TYPES.REQUEST_SENT,
          subject: `🔴 [Action Required] New Tooling Request: ${countStr} items`,
          docNo: uniqueDocNo,
          actionBy: userName,
          targetRoles: 'purchase',
          ctaRoute: '/purchase/request-list',
          division: firstItem.Division,
          divisionId: divId,
          detailsJson: { items: itemSnapshot, totalItems: itemSnapshot.length, type: 'new_request' }
        });
      }
    } catch (notifErr) {
      console.error('[Notification] Error in Add_New_Request_Bulk:', notifErr);
    }

  } catch (error) {
    console.error('Error in Add_New_Request_Bulk:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
