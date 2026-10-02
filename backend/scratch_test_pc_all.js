const { sql, poolPromise } = require('./src/config/database');

async function testPcAll() {
  try {
    const pool = await poolPromise;
    console.log('Testing Stored_PCPlan_Query for PC / ALL...');
    
    const res = await pool.request()
      .input('Department', sql.NVarChar(10), 'PC')
      .input('SubTab', sql.NVarChar(20), 'ALL')
      .execute('trans.Stored_PCPlan_Query');

    console.log("Counts:", res.recordsets[1] ? res.recordsets[1][0] : null);
    console.log("Recordset length:", res.recordset.length);
    if (res.recordset.length > 0) {
      console.log("Unique dates in ALL:", [...new Set(res.recordset.map(r => new Date(r.PlanDate).toLocaleDateString('en-GB')))]);
    }
  } catch (err) {
    console.error("Error executing SP:", err);
  } finally {
    process.exit(0);
  }
}

testPcAll();
