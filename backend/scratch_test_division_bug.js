const { sql, poolPromise } = require('./src/config/database');

async function testBug() {
  try {
    const pool = await poolPromise;
    console.log("--- Testing with @FilterDivision = 'All' ---");
    const resAllStr = await pool.request()
      .input('Department', sql.NVarChar(10), 'PC')
      .input('SubTab', sql.NVarChar(20), 'ALL')
      .input('FilterDivision', sql.NVarChar(50), 'All')
      .execute('trans.Stored_PCPlan_Query');
    console.log("Rows with @FilterDivision = 'All':", resAllStr.recordset.length);

    console.log("\n--- Testing with @FilterDivision = NULL ---");
    const resNull = await pool.request()
      .input('Department', sql.NVarChar(10), 'PC')
      .input('SubTab', sql.NVarChar(20), 'ALL')
      .input('FilterDivision', sql.NVarChar(50), null)
      .execute('trans.Stored_PCPlan_Query');
    console.log("Rows with @FilterDivision = NULL:", resNull.recordset.length);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

testBug();
