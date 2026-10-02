const { poolPromise, poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  try {
    const poolTooling = await poolPromise; // 155 (Read Only)
    const poolIndirrec = await poolRequestIndirrecPromise; // 8g (Write)

    console.log('Fetching 100 real Waiting items from 155 (db_Tooling)...');
    
    // Fetch 100 Waiting items from real DB (155)
    const result = await poolTooling.request().query(`
      SELECT TOP 100 
        'TEST-RT-' + CAST(ID_Request AS VARCHAR) AS Public_Id,
        Division, PartNo, ItemNo, MFGOrderNo, DocNo, 
        MatLot, QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, 
        Status, '' AS AS400STATUS, DueDate AS DateComplete, DateTime_Record, 
        Remark, 'TEST_' + Requester AS Requester, Process, [CASE]
      FROM [db_Tooling].[viewer].[View_IssueCuttingTool_Request_Document]
      WHERE Status = 'Waiting'
      ORDER BY ID_Request DESC
    `);

    const items = result.recordset;
    console.log(`Found ${items.length} real items to copy.`);

    // Clear existing test data in 8g
    await poolIndirrec.request().query('TRUNCATE TABLE [dbo].[TestPurchaseRequestList]');
    console.log('Cleared existing mock data in 8g TestPurchaseRequestList.');

    // Insert into mock table on 8g
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Ensure all mock items have complete data for smooth dry run testing
      item.Remark = ''; // Keep remark empty so users can type their own
      item.STOCK_ON_HAND = 100; // Force On-Hand to 100
      item.QTY = 1; // Maybe force QTY to 1 to ensure it's less than 100? No, just keep original QTY.


      const rq = poolIndirrec.request();
      rq.input('Public_Id', item.Public_Id);
      rq.input('Division', item.Division || '');
      rq.input('PartNo', item.PartNo || '');
      rq.input('ItemNo', item.ItemNo || '');
      rq.input('MFGOrderNo', item.MFGOrderNo || '');
      rq.input('DocNo', item.DocNo || '');
      rq.input('MatLot', item.MatLot || '');
      rq.input('QTY', item.QTY || 0);
      rq.input('STOCK_ON_HAND', item.STOCK_ON_HAND || 0);
      rq.input('Req_QTY', item.Req_QTY || 0);
      rq.input('MCType', item.MCType || '');
      rq.input('MCNo', item.MCNo || '');
      rq.input('Status', item.Status || '');
      rq.input('AS400STATUS', 'Pending');
      rq.input('DateComplete', item.DateComplete || new Date());
      rq.input('DateTime_Record', item.DateTime_Record || new Date());
      rq.input('Remark', item.Remark || '');
      rq.input('Requester', item.Requester || '');
      rq.input('Process', item.Process || '');
      rq.input('CASE', item.CASE || '');

      await rq.query(`
        INSERT INTO [dbo].[TestPurchaseRequestList] (
          Public_Id, Division, PartNo, ItemNo, MFGOrderNo, DocNo,
          MatLot, QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo,
          Status, AS400STATUS, DateComplete, DateTime_Record,
          Remark, Requester, Process, [CASE]
        ) VALUES (
          @Public_Id, @Division, @PartNo, @ItemNo, @MFGOrderNo, @DocNo,
          @MatLot, @QTY, @STOCK_ON_HAND, @Req_QTY, @MCType, @MCNo,
          @Status, @AS400STATUS, @DateComplete, @DateTime_Record,
          @Remark, @Requester, @Process, @CASE
        )
      `);
    }

    console.log(`Successfully inserted ${items.length} mock real-time data into 8g.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
