const { sql, poolPromise } = require('./src/config/database');

async function testSp() {
  try {
    const pool = await poolPromise;
    
    // EN - Required
    const resEN = await pool.request()
      .input('Department', sql.NVarChar(10), 'EN')
      .input('SubTab', sql.NVarChar(20), 'Required')
      .execute('trans.Stored_PCPlan_Query');
    
    console.log("=== EN Tab (Required) Dates ===");
    const datesEN = [...new Set(resEN.recordset.map(r => new Date(r.PlanDate).toLocaleDateString('en-GB')))];
    console.log(datesEN);
    const rows24EN = resEN.recordset.filter(r => new Date(r.PlanDate).toLocaleDateString('en-GB') === '24/09/2026');
    console.log("24/09/2026 in EN Required:", rows24EN.length, "rows");

    // QC - Required
    const resQC = await pool.request()
      .input('Department', sql.NVarChar(10), 'QC')
      .input('SubTab', sql.NVarChar(20), 'Required')
      .execute('trans.Stored_PCPlan_Query');
    
    console.log("\n=== QC Tab (Required) Dates ===");
    const datesQC = [...new Set(resQC.recordset.map(r => new Date(r.PlanDate).toLocaleDateString('en-GB')))];
    console.log(datesQC);
    const rows24QC = resQC.recordset.filter(r => new Date(r.PlanDate).toLocaleDateString('en-GB') === '24/09/2026');
    console.log("24/09/2026 in QC Required:", rows24QC.length, "rows");

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

testSp();
