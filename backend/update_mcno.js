const { sql, poolRequestIndirrecPromise, poolPromise } = require('./src/config/database');

async function fixMCNo() {
  try {
    const pool = await poolRequestIndirrecPromise;
    // Fix Mock Table
    const mockRes = await pool.request().query("SELECT Public_Id, MCNo FROM TestPurchaseRequestList WHERE MCNo LIKE '%-%'");
    for (let row of mockRes.recordset) {
      if (row.MCNo) {
        let newMCNo = row.MCNo.replace(/-/g, ', ');
        await pool.request()
          .input('newMCNo', sql.NVarChar, newMCNo)
          .input('id', sql.VarChar, row.Public_Id)
          .query("UPDATE TestPurchaseRequestList SET MCNo = @newMCNo WHERE Public_Id = @id");
        console.log(`Mock DB Updated: ${row.MCNo} -> ${newMCNo}`);
      }
    }

    // Fix Real Table
    const realPool = await poolPromise;
    const realRes = await realPool.request().query("SELECT ID_Request, MCNo FROM tb_IssueCuttingTool_Request_Document WHERE MCNo LIKE '%-%'");
    for (let row of realRes.recordset) {
      if (row.MCNo) {
        let newMCNo = row.MCNo.replace(/-/g, ', ');
        await realPool.request()
          .input('newMCNo', sql.NVarChar, newMCNo)
          .input('id', sql.Int, row.ID_Request)
          .query("UPDATE tb_IssueCuttingTool_Request_Document SET MCNo = @newMCNo WHERE ID_Request = @id");
        console.log(`Real DB Updated ID ${row.ID_Request}: ${row.MCNo} -> ${newMCNo}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixMCNo();
