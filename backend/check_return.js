const sql = require('mssql'); 
const { poolPromise } = require('./src/config/database'); 
(async () => { 
  try { 
    const pool = await poolPromise; 
    
    // Get FULL details of all return records
    const all = await pool.request().query(`
      SELECT DISTINCT Doc_No, Division, Process, Facility, Return_By, Return_Date, DateTime_Record,
        COUNT(*) OVER (PARTITION BY Doc_No) as ItemCount,
        SUM(QTY) OVER (PARTITION BY Doc_No) as TotalQTY
      FROM [master].[tb_Return_List]
      ORDER BY DateTime_Record DESC
    `);
    console.log('=== Return Documents (unique Doc_No) ===');
    all.recordset.forEach(r => {
      console.log(`  Doc:${r.Doc_No} | Div:${r.Division} | Process:${r.Process} | Fac:${r.Facility} | By:${r.Return_By} | Date:${r.Return_Date ? r.Return_Date.toISOString().split('T')[0] : '-'} | Items:${r.ItemCount} | TotalQTY:${r.TotalQTY}`);
    });

    // Check what PC Plan records match by Division+Process+Facility+Month
    console.log('\n=== PC Plan records that COULD match by Division+Process+Facility ===');
    const planMatch = await pool.request().query(`
      SELECT DISTINCT p.Division, p.Process, p.Facility, p.Unique_Id, p.PlanDate, p.PartNo
      FROM [master].[tb_PC_Plan] p
      WHERE p.Division IN (SELECT DISTINCT Division FROM [master].[tb_Return_List])
        AND p.Process IN (SELECT DISTINCT Process FROM [master].[tb_Return_List])
        AND p.IsActive = 1
      ORDER BY p.PlanDate DESC
    `);
    console.log(`Found ${planMatch.recordset.length} possible matching PC Plan rows`);
    planMatch.recordset.slice(0, 10).forEach(r => {
      console.log(`  Div:${r.Division} | Process:${r.Process} | Fac:${r.Facility} | PartNo:${r.PartNo} | Date:${r.PlanDate ? r.PlanDate.toISOString().split('T')[0] : '-'} | UniqueId:${r.Unique_Id}`);
    });

    // Check if there's a scan-return flow that passes uniqueId in frontend
    console.log('\n=== Return routes in the backend ===');
    const routes = await pool.request().query(`
      SELECT name FROM sys.procedures WHERE name LIKE '%Return%' ORDER BY name
    `);
    console.log('SPs:', routes.recordset.map(r=>r.name).join(', '));

    process.exit(0); 
  } catch(e) { 
    console.error(e); 
    process.exit(1); 
  } 
})();
