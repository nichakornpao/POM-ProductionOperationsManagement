const { poolPromise } = require('./src/config/database');

async function listCols() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT TOP 1 * FROM [master].[tb_PC_Plan]");
    console.log("Columns in tb_PC_Plan:", Object.keys(res.recordset[0]));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

listCols();
