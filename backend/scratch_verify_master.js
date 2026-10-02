const { poolPromise } = require('./src/config/database');

async function verify() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 5 PartNo, ItemNo, Process, MC, CT_sec, Usage_pcs
      FROM dbo.tb_ToolingMaster
      WHERE ItemNo LIKE '%MASTER%' OR PartNo LIKE '%MASTER%'
    `);
    
    console.log("--- DB TOOLING MASTER RESULTS ---");
    console.log(result.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

verify();
