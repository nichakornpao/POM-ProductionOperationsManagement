const fs = require('fs');

function restore() {
  let c = fs.readFileSync('src/controllers/DetailPurchaseRequestlist.controller.js', 'utf8');
  
  c = c.replace(/const testResult = await poolIndirrec\.request\(\)\.query\(`\s*SELECT \s*`\);/g, 
    `const testResult = await poolIndirrec.request().query(\`
          SELECT 
            T.Public_Id, T.OriginalID AS ID_Request, T.DateTime_Record, T.DateTime_Record AS DueDate, 
            T.ItemNo AS Req_ItemNo, T.ItemNo, T.PartNo, T.ItemNo AS SPEC, T.ItemName, T.QTY, T.Req_QTY,
            T.Division, T.Process, T.MCNo, T.Requester AS Req_By,
            CASE WHEN T.Status = 'Waiting' THEN 'Waiting' ELSE T.Status END AS Status,
            T.AS400STATUS,
            ISNULL(T.STOCK_ON_HAND, 0) AS STOCK_ON_HAND,
            ISNULL(T.STOCK_ON_HAND, 0) AS ON_HAND,
            ISNULL(T.MAIN_LOCATION, '') AS MAIN_LOCATION,
            ISNULL(T.MAIN_LOCATION, '') AS Stock_Location,
            ISNULL(T.MatLot, '') AS MatLot,
            ISNULL(T.Remark, '') AS Remark,
            T.MCType, T.MFGOrderNo, T.DocNo, T.[CASE] AS [CASE]
          FROM [dbo].[TestCaseSetupList] T WITH (NOLOCK)
          WHERE T.Status IN ('Waiting', 'Hold', 'In Progress')
            AND T.Public_Id LIKE 'TEST-CS-%'
          ORDER BY T.ItemNo ASC
        \`);`);
  fs.writeFileSync('src/controllers/DetailPurchaseRequestlist.controller.js', c);
  console.log('Restored');
}

restore();
