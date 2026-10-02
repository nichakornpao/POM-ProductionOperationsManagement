const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function testQCSubTabs() {
  try {
    const pool = await poolPromise;

    for (const subTab of ['ALL', 'Required', 'Upcoming', 'Completed']) {
      const req = pool.request()
        .input('Department', sql.NVarChar(10), 'Gague')
        .input('SubTab', sql.NVarChar(20), subTab)
        .input('PageNumber', sql.Int, 1)
        .input('PageSize', sql.Int, 100);
      const res = await req.execute('trans.Stored_PCPlan_Query');
      console.log(`SubTab [${subTab}] -> Rows: ${res.recordsets[0].length}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testQCSubTabs();
