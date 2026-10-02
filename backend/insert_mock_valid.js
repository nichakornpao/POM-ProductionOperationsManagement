const sql = require('mssql');
const { poolRequestIndirrecPromise } = require('./src/config/database');

async function insertMockData() {
  try {
    const pool = await poolRequestIndirrecPromise;

    // First delete the previous "NEW" ones that might be invisible
    await pool.request().query(`
      DELETE FROM [dbo].[TestCaseSetupList]
      WHERE Public_Id LIKE 'TEST-CS-NEW-%'
    `);
    console.log('✅ Deleted previous invisible mock items.');

    const validItemNos = ['P142385A', 'P130454A', 'P122824A', 'P113089A'];

    // Now insert 30 new items with VALID ItemNos
    for (let i = 1; i <= 30; i++) {
      const publicId = `TEST-CS-NEW-${Date.now()}-${i}`;
      const itemNo = validItemNos[i % validItemNos.length];
      
      const query = `
        INSERT INTO [dbo].[TestCaseSetupList] (
          Public_Id, ItemNo, PartNo, QTY, Req_QTY, Division, Process, MCNo, Requester, 
          Status, AS400STATUS, MAIN_LOCATION, STOCK_ON_HAND, DateTime_Record, MCType, [CASE]
        ) VALUES (
          @Public_Id, @ItemNo, 'PART-MOCK', 1, 1, '71DZ', 'CNC', 'MC-01', 'MockUser',
          'Waiting', 'Pending', 'LOT-CSNEW', 100, GETDATE(), 'Milling', 'NEW'
        )
      `;

      await pool.request()
        .input('Public_Id', sql.NVarChar, publicId)
        .input('ItemNo', sql.NVarChar, itemNo)
        .query(query);
    }

    console.log('✅ Successfully inserted 30 new mock items using VALID ItemNos with ON HAND stock for Case Setup!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error inserting mock data:', err);
    process.exit(1);
  }
}

insertMockData();
