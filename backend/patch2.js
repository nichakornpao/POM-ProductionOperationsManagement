const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'controllers', 'DetailPurchaseRequestlist.controller.js');
let code = fs.readFileSync(file, 'utf8');

const regex = /const performUpdate = async \(type, ids\) => \{[\s\S]*?return selectResult\.recordset;\s*\};/g;

const newCode = `const performUpdate = async (type, ids) => {
      const targetTable = type === 'Setup' ? 'dbo.tb_IssueSetupTool_Request_Document' : 'dbo.tb_IssueCuttingTool_Request_Document';
      const isPublicId = typeof ids[0] === 'string';
      const idColumn = isPublicId ? 'Public_Id' : (type === 'Setup' ? 'ID_RequestSetupTool' : 'ID_Request');

      const rq = pool.request();
      rq.input("Status", sql.NVarChar, Status);

      let whereClause = "";
      if (isPublicId) {
        const placeholders = ids.map((_, i) => \`@id\${i}\`).join(", ");
        ids.forEach((id, i) => rq.input(\`id\${i}\`, sql.NVarChar, id));
        whereClause = \`\${idColumn} IN (\${placeholders})\`;
      } else {
        const numericIds = ids.map(Number);
        const placeholders = numericIds.map((_, i) => \`@id\${i}\`).join(", ");
        numericIds.forEach((id, i) => rq.input(\`id\${i}\`, sql.Int, id));
        whereClause = \`\${idColumn} IN (\${placeholders})\`;
      }

      // === PRE-CHECK FOR REAL DATA ZERO STOCK ===
      if (Status === 'Complete') {
        const checkRq = pool.request();
        if (isPublicId) {
          ids.forEach((id, i) => checkRq.input(\`id\${i}\`, sql.NVarChar, id));
        } else {
          ids.forEach((id, i) => checkRq.input(\`id\${i}\`, sql.Int, Number(id)));
        }
        
        const checkRes = await checkRq.query(\`
          SELECT \${idColumn}, ISNULL(STOCK_ON_HAND, 0) AS STOCK_ON_HAND 
          FROM \${targetTable} 
          WHERE \${whereClause}
        \`);
        
        const zeroStockItems = checkRes.recordset.filter(r => Number(r.STOCK_ON_HAND) <= 0);
        
        if (zeroStockItems.length > 0) {
           const zeroPlaceholders = zeroStockItems.map((_, i) => \`@z\${i}\`).join(", ");
           const zeroRq = pool.request();
           zeroStockItems.forEach((r, i) => zeroRq.input(\`z\${i}\`, isPublicId ? sql.NVarChar : sql.Int, r[idColumn]));
           await zeroRq.query(\`
             UPDATE \${targetTable}
             SET Status = 'Hold', AS400STATUS = NULL
             WHERE \${idColumn} IN (\${zeroPlaceholders})
           \`);
           
           // Exclude zero stock items from being processed as 'Complete'
           const zeroIds = zeroStockItems.map(r => r[idColumn]);
           whereClause += \` AND \${idColumn} NOT IN (\${zeroIds.map(v => typeof v === 'string' ? \\\`'\${v}'\\\` : v).join(",")})\`;
        }
      }

      // 1. Perform Update (with duplicate prevention)
      await rq.query(\`
        UPDATE d
        SET d.Status = @Status,
            d.DateComplete = CASE WHEN @Status = N'Complete' THEN SYSDATETIME() ELSE d.DateComplete END,
            d.AS400STATUS = CASE WHEN @Status = N'Complete' THEN N'Pending' ELSE d.AS400STATUS END
        FROM \${targetTable} d
        WHERE \${whereClause}
          AND (d.Status != N'Complete' OR @Status != N'Complete')
          AND (d.AS400STATUS IS NULL OR d.AS400STATUS = N'' OR d.AS400STATUS NOT IN (N'Pending', N'DONE'));
      \`);

      // 2. Fetch Updated Rows (Safe approach without OUTPUT)
      const idCol = type === 'Setup' ? 'ID_RequestSetupTool' : 'ID_Request';
      const selectResult = await rq.query(\`
        SELECT \${idCol}, Requester, DocNo, PartNo, Division, ItemNo, SPEC, Process, MCType, MCNo, [CASE], Unique_Id, Public_Id,
               QTY, ISNULL(STOCK_ON_HAND, 0) AS STOCK_ON_HAND, Stock_Location, MatLot, MFGOrderNo, MC6Digit, AS400STATUS
        FROM \${targetTable}
        WHERE \${whereClause.replace(/d\\./g, '')};
      \`);

      return selectResult.recordset;
    };`;

code = code.replace(regex, newCode);

const regex2 = /if \(result && result\.rowsAffected\[0\] > 0\) \{\s*res\.json\(\{ success: true, message: "Updated successfully" \}\);\s*\} else \{/g;
const newCode2 = `if (result && result.rowsAffected[0] > 0) {
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
                "ON_HAND": req.STOCK_ON_HAND || 0,
                "DOCNo": req.DocNo || "",
                "TransactionYear": d.getFullYear().toString(),
                "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
                "TransactionDay": d.getDate().toString().padStart(2, '0'),
                "WareHouse": warehouseVal,
                "StockControl": "",
                "StockLocation": req.Stock_Location || "",
                "MaterialLot": req.MatLot || "",
                "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFGOrderNo || "") : (req.PartNo || ""),
                "Vendor": "",
                "EmpID": "",
                "Pcname": "",
                "MCNo6Digit": req.MC6Digit || "",
                "MC_No": req.MCNo || "",
                "MCType": req.MCType || "",
                "Public_Id": req.Public_Id,
                "isMockTest": false
              };
            });

            const reqMock = { body: { division: div, data: mappedData } };
            const resMock = { 
              status: (code) => ({ json: (data) => console.log(\`[Auto AS400 Real] Status \${code}:\`, data) }),
              json: (data) => console.log(\`[Auto AS400 Real] Success:\`, data)
            };
            
            setTimeout(() => {
                console.log(\`[Auto AS400 Real] Auto-triggering AS400 Export for Division \${div} (\${mappedData.length} items)\`);
                as400Controller.postAS400(reqMock, resMock).catch(err => console.error('[Auto AS400 Real] Error:', err));
            }, 1000);
          }
        }
      }
      // ==========================================
    } else {`;

code = code.replace(regex2, newCode2);
fs.writeFileSync(file, code, 'utf8');
console.log('Patched with Regex!');
