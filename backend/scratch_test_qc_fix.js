const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function testQCFix() {
  try {
    const pool = await poolPromise;

    console.log('--- Test 1: Department = QC, SubTab = Required, SortDir = DESC ---');
    const req1 = pool.request()
      .input('Department', sql.NVarChar(10), 'QC')
      .input('SubTab', sql.NVarChar(20), 'Required')
      .input('SortDir', sql.NVarChar(4), 'DESC')
      .input('PageNumber', sql.Int, 1)
      .input('PageSize', sql.Int, 100);
    const res1 = await req1.execute('trans.Stored_PCPlan_Query');
    console.log('Rows count returned by SP:', res1.recordsets[0].length);
    console.log('Counts:', res1.recordsets[1]);

    const today = new Date();
    today.setHours(0,0,0,0);

    const nonExpired = res1.recordsets[0].filter(r => {
      const d = new Date(r.PlanDate);
      return d.getTime() >= today.getTime();
    });

    console.log('Non-expired (active running today/future) rows count:', nonExpired.length);
    if (nonExpired.length > 0) {
      console.table(nonExpired.slice(0, 10).map(r => ({
        Plan_ID: r.Plan_ID,
        PlanDate: new Date(r.PlanDate).toISOString().split('T')[0],
        PartNo: r.PartNo,
        Path_Dwg: r.Path_Dwg ? r.Path_Dwg.substring(0, 30) + '...' : null,
        Path_Layout: r.Path_Layout ? r.Path_Layout.substring(0, 30) + '...' : null,
        Path_IIQC: r.Path_IIQC,
        PlanStatus: r.PlanStatus
      })));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testQCFix();
