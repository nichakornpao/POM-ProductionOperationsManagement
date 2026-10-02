const { poolRequestIndirrecPromise } = require('./src/config/database');

async function insertMocks() {
  try {
    const pool = await poolRequestIndirrecPromise;
    if (!pool) {
      console.error("Could not connect to database");
      process.exit(1);
    }
    
    console.log("Connected, inserting 10 mock records...");
    
    await pool.request().query(`
      DECLARE @i INT = 1;
      WHILE @i <= 10
      BEGIN
          INSERT INTO [RequestindirrecMaterial].[dbo].[TestPurchaseRequestList] (
              [Public_Id], [DocNo], [Status], [Requester], [Division], [CASE], 
              [PartNo], [ItemNo], [Req_QTY], [QTY], [STOCK_ON_HAND], [DateTime_Record]
          )
          VALUES (
              'TEST-' + CAST(NEWID() AS NVARCHAR(50)), 
              'TEST_DOC_' + CAST(@i AS VARCHAR), 
              'Waiting', 
              'TEST_USER', 
              '71DZ', 
              'SET', 
              'T7146AM2BT02', 
              'P12267' + CAST(@i AS VARCHAR), 
              5, 
              5, 
              0, 
              GETDATE()
          );
          SET @i = @i + 1;
      END
    `);
    console.log("Successfully inserted 10 records!");
    process.exit(0);
  } catch(err) {
    console.error("Error inserting data:", err);
    process.exit(1);
  }
}

insertMocks();
