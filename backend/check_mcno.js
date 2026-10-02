const { sql, poolPromise } = require('./src/config/database');

async function checkMCNo() {
  try {
    const pool = await poolPromise;
    const result1 = await pool.request().query("SELECT DISTINCT MCNo FROM PurchaseRequestList WHERE MCNo LIKE '%-%'");
    const result2 = await pool.request().query("SELECT DISTINCT MCNo FROM TestPurchaseRequestList WHERE MCNo LIKE '%-%'");
    
    console.log("Real DB MCNo with dashes:", result1.recordset);
    console.log("Mock DB MCNo with dashes:", result2.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkMCNo();
