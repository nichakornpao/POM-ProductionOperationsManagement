const { poolPromise, poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  try {
    const poolTooling = await poolPromise; // 155 (Read Only)
    const poolIndirrec = await poolRequestIndirrecPromise; // 8g (Write)

    console.log('Fetching 100 real items from 155 Case Setup...');
    
    // Fetch 100 items from real DB (155) SP
    const result = await poolTooling.request().execute('trans.Stored_Detail_CaseSetup');
    let items = result.recordset || [];
    
    // Only take top 100 Waiting items (or just top 100)
    items = items.filter(i => i.Status === 'Waiting').slice(0, 100);
    
    if (items.length < 100) {
      // If not enough waiting, just take anything to make 100
      const more = result.recordset.filter(i => i.Status !== 'Waiting').slice(0, 100 - items.length);
      items = [...items, ...more];
    }

    console.log(`Found ${items.length} real items to copy for Case Setup.`);

    // Create table in 8g if it doesn't exist
    await poolIndirrec.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TestCaseSetupList' AND xtype='U')
      CREATE TABLE [dbo].[TestCaseSetupList] (
        [Public_Id] VARCHAR(50) PRIMARY KEY,
        [Division] VARCHAR(50),
        [PartNo] VARCHAR(100),
        [ItemNo] VARCHAR(100),
        [ItemName] VARCHAR(255),
        [MFGOrderNo] VARCHAR(100),
        [DocNo] VARCHAR(100),
        [MatLot] VARCHAR(100),
        [QTY] INT,
        [STOCK_ON_HAND] INT,
        [Req_QTY] INT,
        [MCType] VARCHAR(100),
        [MCNo] VARCHAR(100),
        [Status] VARCHAR(50),
        [AS400STATUS] VARCHAR(50),
        [DateComplete] DATETIME,
        [DateTime_Record] DATETIME,
        [Remark] VARCHAR(255),
        [Requester] VARCHAR(100),
        [Process] VARCHAR(100),
        [CASE] VARCHAR(50),
        [SourceTable] VARCHAR(50),
        [OriginalID] INT
      )
    `);

    // Clear existing test data in 8g
    await poolIndirrec.request().query('TRUNCATE TABLE [dbo].[TestCaseSetupList]');
    console.log('Cleared existing mock data in 8g TestCaseSetupList.');

    // Insert into mock table on 8g
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Ensure all mock items have complete data for smooth dry run testing
      item.Remark = ''; // Keep remark empty so users can type their own
      item.STOCK_ON_HAND = 100; // Force On-Hand to 100
      item.QTY = 1; // Keep original QTY or force 1? Let's use 1 to avoid exceeding stock
      item.Status = 'Waiting';

      const publicId = 'TEST-CS-' + (item.OriginalID || i);

      const rq = poolIndirrec.request();
      rq.input('Public_Id', publicId);
      rq.input('Division', item.Division || '');
      rq.input('PartNo', item.PartNo || '');
      rq.input('ItemNo', item.ItemNo || '');
      rq.input('ItemName', item.ItemName || '');
      rq.input('MFGOrderNo', item.MFGOrderNo || '');
      rq.input('DocNo', item.DocNo || '');
      rq.input('MatLot', item.MatLot || '');
      rq.input('QTY', item.QTY || 1);
      rq.input('STOCK_ON_HAND', item.STOCK_ON_HAND || 100);
      rq.input('Req_QTY', item.Req_QTY || 1);
      rq.input('MCType', item.MCType || '');
      rq.input('MCNo', item.MCNo || '');
      rq.input('Status', item.Status);
      rq.input('AS400STATUS', '');
      rq.input('DateComplete', item.DateComplete || null);
      rq.input('DateTime_Record', item.DateTime_Record || new Date());
      rq.input('Remark', item.Remark || '');
      rq.input('Requester', 'TEST_' + (item.Requester || 'USER'));
      rq.input('Process', item.Process || '');
      rq.input('CASE', item.CASE || '');
      rq.input('SourceTable', item.SourceTable || '');
      rq.input('OriginalID', item.OriginalID || i);

      await rq.query(`
        INSERT INTO [dbo].[TestCaseSetupList] (
          Public_Id, Division, PartNo, ItemNo, ItemName, MFGOrderNo, DocNo, 
          MatLot, QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, Status, AS400STATUS,
          DateComplete, DateTime_Record, Remark, Requester, Process, [CASE],
          SourceTable, OriginalID
        ) VALUES (
          @Public_Id, @Division, @PartNo, @ItemNo, @ItemName, @MFGOrderNo, @DocNo, 
          @MatLot, @QTY, @STOCK_ON_HAND, @Req_QTY, @MCType, @MCNo, @Status, @AS400STATUS,
          @DateComplete, @DateTime_Record, @Remark, @Requester, @Process, @CASE,
          @SourceTable, @OriginalID
        )
      `);
    }

    console.log('Successfully inserted 100 mock Case Setup data into 8g.');
    process.exit(0);
  } catch (error) {
    console.error('Error generating mock data:', error);
    process.exit(1);
  }
}

run();
