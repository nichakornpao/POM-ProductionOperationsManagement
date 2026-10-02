const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function testQCQuery() {
  try {
    const pool = await poolPromise;

    console.log('--- Test 1: Department = QC, SubTab = Required ---');
    const req1 = pool.request()
      .input('Department', sql.NVarChar(10), 'QC')
      .input('SubTab', sql.NVarChar(20), 'Required')
      .input('PageNumber', sql.Int, 1)
      .input('PageSize', sql.Int, 100);
    const res1 = await req1.execute('trans.Stored_PCPlan_Query');
    console.log('Rows count:', res1.recordsets[0].length);
    console.log('Counts:', res1.recordsets[1]);

    console.log('\n--- Test 2: Department = Gague, SubTab = Required ---');
    const req2 = pool.request()
      .input('Department', sql.NVarChar(10), 'Gague')
      .input('SubTab', sql.NVarChar(20), 'Required')
      .input('PageNumber', sql.Int, 1)
      .input('PageSize', sql.Int, 100);
    const res2 = await req2.execute('trans.Stored_PCPlan_Query');
    console.log('Rows count:', res2.recordsets[0].length);
    console.log('Counts:', res2.recordsets[1]);

    console.log('\n--- Test 3: Sample 5 rows for QC Required ---');
    if (res1.recordsets[0].length > 0) {
      console.table(res1.recordsets[0].slice(0, 5).map(r => ({
        Plan_ID: r.Plan_ID,
        PartNo: r.PartNo,
        Path_Dwg: r.Path_Dwg,
        Path_Layout: r.Path_Layout,
        Path_IIQC: r.Path_IIQC,
        ReqStatus: r.ReqStatus,
        PlanStatus: r.PlanStatus
      })));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testQCQuery();
