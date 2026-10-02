const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'controllers', 'DetailPurchaseRequestlist.controller.js');
let code = fs.readFileSync(file, 'utf8');

const regex = /exports\.Detail_CaseSetup = async \(req, res\) => \{[\s\S]*?\}\s*;\s*(?=\/\*\*\s*\*\s*API: ค้นหารายการเครื่องมือทั้งหมดในคลัง)/;

const newFunc = `exports.Detail_CaseSetup = async (req, res) => {
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
        const countResult = await poolIndirrec.request().query(\`
          IF OBJECT_ID('[dbo].[TestCaseSetupList]', 'U') IS NOT NULL 
            SELECT COUNT(*) AS cnt FROM [dbo].[TestCaseSetupList] WHERE Public_Id LIKE 'TEST-CS-%' AND Status IN ('Waiting', 'Hold', 'In Progress')
          ELSE 
            SELECT -1 AS cnt
        \`);
        const cnt = countResult.recordset[0].cnt;
  
        if (cnt > 0) {
          const testResult = await poolIndirrec.request().query(\`
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
          \`);
  
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
    res.json(finalResult);

  } catch (error) {
    console.error("Error executing query:", error.stack);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
`;

if (regex.test(code)) {
  code = code.replace(regex, newFunc);
  fs.writeFileSync(file, code, 'utf8');
  console.log('Successfully fixed syntax error and cleaned up function!');
} else {
  console.log('Regex did not match!');
}
