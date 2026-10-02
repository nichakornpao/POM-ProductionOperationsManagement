const { poolPromise, poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  try {
    const poolTooling = await poolPromise;
    const poolIndirrec = await poolRequestIndirrecPromise;

    // Fetch 50 Waiting items
    const waitingResult = await poolTooling.request().query(`
      SELECT TOP 50 
        'TEST-WAIT-' + CAST(ID_Request AS VARCHAR) AS Public_Id,
        Division, PartNo, ItemNo, 'TEST_' + MFGOrderNo AS MFGOrderNo, 'TEST_' + DocNo AS DocNo, 
        MatLot, QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, 
        Status, '' AS AS400STATUS, DueDate AS DateComplete, DateTime_Record, 
        Remark, 'TEST_' + Requester AS Requester, Process, [CASE]
      FROM [db_Tooling].[viewer].[View_IssueCuttingTool_Request_Document]
      WHERE Status = 'Waiting'
      ORDER BY ID_Request DESC
    `);

    // Fetch 50 Complete items
    const completeResult = await poolTooling.request().query(`
      SELECT TOP 50 
        'TEST-COMP-' + CAST(ID_Request AS VARCHAR) AS Public_Id,
        Division, PartNo, ItemNo, 'TEST_' + MFGOrderNo AS MFGOrderNo, 'TEST_' + DocNo AS DocNo, 
        MatLot, QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, 
        Status, AS400STATUS, DateComplete, DateTime_Record, 
        Remark, 'TEST_' + Requester AS Requester, Process, [CASE]
      FROM [db_Tooling].[viewer].[View_IssueCuttingTool_Request_Document]
      WHERE Status IN ('Complete', 'CompleteToExcel')
      ORDER BY ID_Request DESC
    `);

    const allItems = [...waitingResult.recordset, ...completeResult.recordset];
    console.log(`Found ${allItems.length} real items to copy.`);

    // Clear existing test data
    await poolIndirrec.request().query('TRUNCATE TABLE [dbo].[TestPurchaseRequestList]');
    console.log('Cleared existing mock data.');

    // Insert into mock table
    for (const item of allItems) {
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
      rq.input('AS400STATUS', item.AS400STATUS || 'Pending');
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

    console.log(`Successfully copied ${allItems.length} real items to the mock table.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
