const sql = require('mssql'); 
const { poolPromise } = require('./src/config/database'); 
(async () => { 
  try { 
    const pool = await poolPromise; 
    const result = await pool.request().query("sp_helptext 'trans.Stored_PCPlan_Query'"); 
    console.log(result.recordset.map(r => r.Text).join('')); 
    process.exit(0); 
  } catch (e) { 
    console.error(e); 
    process.exit(1); 
  } 
})();
