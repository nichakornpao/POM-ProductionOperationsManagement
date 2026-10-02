const { poolPromise } = require('./src/config/database');

async function testSp() {
  try {
    const pool = await poolPromise;
    console.log('Testing trans.Stored_PCPlan_Query for EN Completed tab...');
    const resReq = await pool.request()
      .input('Department', 'EN')
      .input('SubTab', 'Required')
      .input('PageNumber', 1)
      .input('PageSize', 100)
      .execute('trans.Stored_PCPlan_Query');
    
    console.log(`[EN Required] Returned ${resReq.recordset.length} rows.`);

    const resComp = await pool.request()
      .input('Department', 'EN')
      .input('SubTab', 'Completed')
      .input('PageNumber', 1)
      .input('PageSize', 100)
      .execute('trans.Stored_PCPlan_Query');
    
    console.log(`[EN Completed] Returned ${resComp.recordset.length} rows.`);
    if (resComp.recordset.length > 0) {
      resComp.recordset.slice(0, 5).forEach(r => {
        console.log(`  Plan_ID:${r.Plan_ID} Part:${r.PartNo} Comment:${r.Comment} DwgSrc:${r.Path_Dwg_Source} LaySrc:${r.Path_Layout_Source}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testSp();
