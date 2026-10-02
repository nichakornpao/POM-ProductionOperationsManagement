require('dotenv').config({path: __dirname + '/.env'});
const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

(async () => {
  try {
    const pool = await poolPromise;
    const enConfig = {
      user: 'Cost_Team',
      password: 'Cost@User1',
      server: 'PBGM8G\\SQLEXPRESS',
      database: 'RequestindirrecMaterial',
      options: { encrypt: false, trustServerCertificate: true }
    };

    const enPool = await sql.connect(enConfig);

    const planParts = await pool.request().query("SELECT DISTINCT PartNo FROM [master].[tb_PC_Plan]");
    console.log('Unique PartNos in tb_PC_Plan (total ' + planParts.recordset.length + '):');
    const planPartList = planParts.recordset.map(r => r.PartNo).filter(Boolean);
    console.log(planPartList.slice(0, 15));

    const enRes = await enPool.request().query("SELECT DISTINCT PartNo, PathDwg, PathLayout FROM dbo.EngineerPMCpart WHERE NULLIF(PartNo, '') IS NOT NULL");
    console.log('\nUnique PartNos in EngineerPMCpart (total ' + enRes.recordset.length + '):');
    const enPartList = enRes.recordset.map(r => r.PartNo).filter(Boolean);
    console.log(enPartList.slice(0, 15));

    const matched = planPartList.filter(p => enPartList.some(e => e.trim().toUpperCase() === p.trim().toUpperCase()));
    console.log('\nMatching PartNos between both databases:', matched);

    process.exit(0);
  } catch (err) {
    console.error('Debug Error:', err);
    process.exit(1);
  }
})();
