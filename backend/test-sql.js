const { poolRequestIndirrecPromise } = require('./src/config/database');
poolRequestIndirrecPromise.then(pool => 
  pool.request().query(`
    SELECT 
      T.Public_Id AS ID_Request,
      T.Public_Id AS OriginalID,
      '' AS MR_No, ISNULL(T.MFGOrderNo, '') AS MFGOrderNo, T.DocNo, T.Status, T.Requester, T.Division, '' AS Fac, ISNULL(T.[CASE], '') AS [CASE], T.PartNo, T.ItemNo, ISNULL(T.MatLot, '') AS MatLot, T.ItemNo AS SPEC,
      T.Process, T.MCType, T.MCNo, ISNULL(T.STOCK_ON_HAND, 0) AS ON_HAND, T.Req_QTY, T.QTY, T.DateTime_Record AS DueDate, T.DateTime_Record, ISNULL(T.Remark, '') AS Remark, T.DateComplete, '' AS PhoneNo, T.ItemNo AS ItemName,
      '' AS ACCOUNT, '' AS ToolingType,
      T.AS400STATUS,
      ISNULL(T.MAIN_LOCATION, '') AS Stock_Location,
      1 AS isMockTest
    FROM [dbo].[TestPurchaseRequestList] T WITH (NOLOCK)
    WHERE T.Status IN ('Complete', 'CompleteToExcel')
  `)
  .then(res => { console.log('Rows:', res.recordset.length); process.exit(0); })
  .catch(e => { console.error('SQL Error:', e.message); process.exit(1); })
);
