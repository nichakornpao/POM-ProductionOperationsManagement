const fs = require('fs');
const path = './backend/src/controllers/DetailPurchaseRequestlist.controller.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Restore Mock Data Generation in Detail_Purchase
const mockSeedLogic = `
      // ====================================================================
      let testRecords = [];
      try {
        const { poolRequestIndirrecPromise } = require('../config/database');
        const indirrecTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
        const poolIndirrec = await Promise.race([poolRequestIndirrecPromise, indirrecTimeout]);
        
        if (poolIndirrec) {
          const countResult = await poolIndirrec.request().query(\`
            IF OBJECT_ID('[dbo].[TestPurchaseRequestList]', 'U') IS NOT NULL 
              SELECT COUNT(*) AS cnt FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-REQ-%' AND Status = 'Waiting'
            ELSE 
              SELECT -1 AS cnt
          \`);
          const cnt = countResult.recordset[0].cnt;
  
          if (cnt === -1) {
            await poolIndirrec.request().query(\`
              CREATE TABLE [dbo].[TestPurchaseRequestList] (
                [Public_Id] nvarchar(50) NOT NULL,
                [Division] nvarchar(50) NULL,
                [PartNo] nvarchar(100) NULL,
                [ItemNo] nvarchar(100) NULL,
                [MFGOrderNo] nvarchar(100) NULL,
                [DocNo] nvarchar(100) NULL,
                [MAIN_LOCATION] nvarchar(100) NULL,
                [MatLot] nvarchar(100) NULL,
                [QTY] int NULL,
                [STOCK_ON_HAND] int NULL,
                [Req_QTY] int NULL,
                [MCType] nvarchar(100) NULL,
                [MCNo] nvarchar(100) NULL,
                [Status] nvarchar(50) NULL,
                [AS400STATUS] nvarchar(50) NULL,
                [DateComplete] datetime NULL,
                [DateTime_Record] datetime NULL,
                [Remark] nvarchar(max) NULL,
                [Requester] nvarchar(100) NULL,
                [Process] nvarchar(100) NULL,
                [CASE] nvarchar(100) NULL
              )
            \`);
          }
  
          if (cnt <= 0) {
            await poolIndirrec.request().query(\`DELETE FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-REQ-%'\`);
            
            const insertQuery = \`
              INSERT INTO [dbo].[TestPurchaseRequestList] 
                ([Public_Id], [Division], [PartNo], [ItemNo], [MFGOrderNo], [DocNo], [MAIN_LOCATION], [MatLot], [QTY], [Req_QTY], [STOCK_ON_HAND], [MCType], [MCNo], [Status], [AS400STATUS], [DateTime_Record], [Remark], [Requester], [Process], [CASE])
              SELECT
                'TEST-REQ-' + RIGHT('000' + CAST(ROW_NUMBER() OVER (ORDER BY NEWID()) AS VARCHAR), 3),
                '71DZ',
                'TEST-PART-' + RIGHT('000' + CAST(ROW_NUMBER() OVER (ORDER BY NEWID()) AS VARCHAR), 3),
                item_no,
                'MFG-TEST',
                'DOC-TEST',
                stock_loc,
                'LOT-TEST',
                (ABS(CHECKSUM(NEWID())) % 5) + 1,
                (ABS(CHECKSUM(NEWID())) % 5) + 1,
                CAST(TRY_CAST(on_hand AS float) AS int),
                'BM165',
                '415',
                'Waiting',
                'Pending',
                GETDATE(),
                NULL,
                'TEST USER',
                'TURNING',
                'CUT'
              FROM (
                SELECT TOP 45 * FROM [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw] 
                WHERE (item_no LIKE '%A' OR item_no LIKE '%N') AND CAST(TRY_CAST(on_hand AS float) AS int) > 5 
                ORDER BY NEWID()
                UNION ALL
                SELECT TOP 5 * FROM [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw] 
                WHERE (item_no LIKE '%A' OR item_no LIKE '%N') AND CAST(TRY_CAST(on_hand AS float) AS int) = 0 
                ORDER BY NEWID()
              ) AS mixed_items
              ORDER BY NEWID()
            \`;
            await poolIndirrec.request().query(insertQuery);
          }
  
          const testResult = await poolIndirrec.request().query(\`
            SELECT
              Public_Id AS ID_Request,
              Public_Id,
              '' AS MR_No, MFGOrderNo, DocNo, Status, Requester, Division, '' AS Fac, [CASE], PartNo, ItemNo, MatLot, '' AS SPEC,
              Process, MCType, MCNo, ISNULL(STOCK_ON_HAND, 0) AS STOCK_ON_HAND, ISNULL(STOCK_ON_HAND, 0) AS ON_HAND, Req_QTY, QTY, GETDATE() AS DueDate, DateTime_Record, Remark, DateComplete, '' AS PhoneNo, '' AS ItemName,
              '' AS ACCOUNT, '' AS ToolingType,
              Public_Id AS OriginalID,
              AS400STATUS,
              ISNULL(MAIN_LOCATION, '') AS Stock_Location
            FROM [dbo].[TestPurchaseRequestList] WITH (NOLOCK)
            ORDER BY ItemNo ASC
          \`);
  
          testRecords = testResult.recordset.map(row => ({
            ...row,
            isMockTest: true,
            dataSource: 'TestPurchaseRequestList'
          }));
        }
      } catch (testErr) {
        console.warn('Failed to fetch test data for RequestList:', testErr.message);
      }
      
      const finalResult = [...testRecords, ...rows];
      res.json(finalResult);
`;
content = content.replace('    res.json(rows);', mockSeedLogic);

// 2. Mock Logic for Update_Status_Purchase
const mockStatusLogic = `
      // === MOCK DATA INTERCEPTION ===
      const hasTestWord = idList.some(id => typeof id === 'string' && id.toUpperCase().includes('TEST')) || 
        Object.values(req.body).some(val => typeof val === 'string' && val.toUpperCase().includes('TEST'));
      
      if (hasTestWord) {
        try {
          const { poolRequestIndirrecPromise } = require('../config/database');
          const poolIndirrec = await poolRequestIndirrecPromise;
          const placeholders = idList.map((_, i) => \\\`@id\${i}\\\`).join(", ");
          const sqlReq = require('mssql');
          const rq = poolIndirrec.request();
          rq.input("Status", sqlReq.NVarChar, Status);
          idList.forEach((id, i) => rq.input(\\\`id\${i}\\\`, sqlReq.NVarChar, id));
  
          await rq.query(\`
            UPDATE [dbo].[TestPurchaseRequestList]
            SET Status = @Status,
                DateComplete = CASE WHEN @Status = N'Complete' THEN SYSDATETIME() ELSE DateComplete END,
                AS400STATUS = CASE WHEN @Status = N'Complete' THEN N'Pending' ELSE AS400STATUS END
            WHERE Public_Id IN (\${placeholders})
          \`);
          return res.json({ success: true, message: "Mock data status updated successfully", updatedRows: idList.length });
        } catch (mockErr) {
          return res.status(500).json({ success: false, message: "Failed to update mock data", error: mockErr.message });
        }
      }
      // ================================
`;
content = content.replace('      const rq = pool.request();\n      rq.input("Status", sql.NVarChar, Status);', mockStatusLogic + '\n      const rq = pool.request();\n      rq.input("Status", sql.NVarChar, Status);');

// 3. Mock Logic for Update_Request
const mockUpdateRequest = `
      // === MOCK DATA INTERCEPTION ===
      const hasTestWord = Object.values(req.body).some(val => typeof val === 'string' && val.toUpperCase().includes('TEST'));
      
      if (hasTestWord) {
        try {
          const { poolRequestIndirrecPromise } = require('../config/database');
          const poolIndirrec = await poolRequestIndirrecPromise;
          const sqlReq = require('mssql');
          const rq = poolIndirrec.request();
          
          rq.input("ID_Val", sqlReq.NVarChar, String(ID_Request || ''));
          rq.input("ItemNo", sqlReq.NVarChar, ItemNo || '');
          rq.input("QTY", sqlReq.Int, QTY || 0);
          rq.input("MatLot", sqlReq.NVarChar, MatLot || '');
          rq.input("Remark", sqlReq.NVarChar, Remark || '');
  
          await rq.query(\`
            UPDATE [dbo].[TestPurchaseRequestList]
            SET ItemNo = @ItemNo,
                QTY = @QTY,
                MatLot = @MatLot,
                Remark = @Remark
            WHERE Public_Id = @ID_Val
          \`);
  
          return res.json({ success: true, message: "Mock data updated successfully (PBGM8G)" });
        } catch (mockErr) {
          return res.status(500).json({ success: false, message: "Failed to update mock data", error: mockErr.message });
        }
      }
      // ================================
`;
content = content.replace('      const executeUpdate = async (type, idValue, isPublic = false) => {', mockUpdateRequest + '\n      const executeUpdate = async (type, idValue, isPublic = false) => {');

// 4. Mock Logic for DeleteItem
const mockDeleteLogic = `
      const hasTestWord = upperId.includes('TEST');
      if (hasTestWord) {
        try {
          const { poolRequestIndirrecPromise } = require('../config/database');
          const poolIndirrec = await poolRequestIndirrecPromise;
          const sqlReq = require('mssql');
          await poolIndirrec.request()
            .input("ID_Val", sqlReq.NVarChar, String(id))
            .query(\`DELETE FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id = @ID_Val\`);
          return res.json({ success: true, message: 'Mock data deleted successfully' });
        } catch (mockErr) {
          return res.status(500).json({ success: false, message: "Failed to delete mock data", error: mockErr.message });
        }
      }
`;
content = content.replace("      const isPublic = upperId.startsWith('C') || upperId.startsWith('S');", mockDeleteLogic + "\n      const isPublic = upperId.startsWith('C') || upperId.startsWith('S');");

fs.writeFileSync(path, content, 'utf8');
console.log('Patched DetailPurchaseRequestlist.controller.js');
