const { sql, poolPromise } = require('./src/config/database');

async function testPcUpcoming() {
  try {
    const pool = await poolPromise;
    console.log('Testing Stored_PCPlan_Query for PC / Upcoming...');
    
    const res = await pool.request()
      .input('Department', sql.NVarChar(10), 'PC')
      .input('SubTab', sql.NVarChar(20), 'Upcoming')
      .execute('trans.Stored_PCPlan_Query');

    console.log("TotalCount:", res.recordsets[1] ? res.recordsets[1][0] : null);
    console.log("Recordset length:", res.recordset.length);
    if (res.recordset.length > 0) {
      console.log("First row sample:", res.recordset[0]);
    }
  } catch (err) {
    console.error("Error executing SP:", err);
  } finally {
    process.exit(0);
  }
}

testPcUpcoming();
