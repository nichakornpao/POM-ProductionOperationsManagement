const sql = require('mssql');
const { poolRequestIndirrecPromise } = require('./src/config/database');

async function insertMockData() {
  try {
    const pool = await poolRequestIndirrecPromise;

    // First, let's update ALL existing TEST-CS items to have some stock just in case
    await pool.request().query(`
      UPDATE [dbo].[TestCaseSetupList]
      SET STOCK_ON_HAND = 100, MAIN_LOCATION = 'STORE-A'
      WHERE Public_Id LIKE 'TEST-CS-%'
    `);
    console.log('✅ Updated existing mock items to have stock.');

    // Now insert 30 new items
    for (let i = 1; i <= 30; i++) {
      const publicId = `TEST-CS-NEW-${Date.now()}-${i}`;
      const itemNo = `P13${Math.floor(1000 + Math.random() * 9000)}A`;
      
      const query = `
        INSERT INTO [dbo].[TestCaseSetupList] (
          Public_Id, ItemNo, PartNo, QTY, Req_QTY, Division, Process, MCNo, Requester, 
          Status, AS400STATUS, MAIN_LOCATION, STOCK_ON_HAND, DateTime_Record, MCType, [CASE]
        ) VALUES (
          @Public_Id, @ItemNo, 'PART-MOCK', 1, 1, 'PMC', 'CNC', 'MC-01', 'MockUser',
          'Waiting', 'Pending', 'LOT-CS${i}', 100, GETDATE(), 'Milling', 'NEW'
        )
      `;

      await pool.request()
        .input('Public_Id', sql.NVarChar, publicId)
        .input('ItemNo', sql.NVarChar, itemNo)
        .query(query);
    }

    console.log('✅ Successfully inserted 30 new mock items with ON HAND stock for Case Setup!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error inserting mock data:', err);
    process.exit(1);
  }
}

insertMockData();
