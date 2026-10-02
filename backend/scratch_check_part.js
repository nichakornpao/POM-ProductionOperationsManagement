const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function test() {
  try {
    const pool = await poolPromise;

    console.log('--- 1. Searching for any PartNo containing 5D46 or 5d46 in tb_PC_Plan ---');
    const r1 = await pool.request().query("SELECT DISTINCT PartNo FROM master.tb_PC_Plan WHERE PartNo LIKE '%5D46%' OR PartNo LIKE '%5d46%'");
    console.log('In tb_PC_Plan:', r1.recordset);

    console.log('\n--- 2. Checking Forecast / Master tables for 5D46 ---');
    try {
      const r2 = await pool.request().query("SELECT DISTINCT ItemNo AS PartNo FROM ForecastProject.dbo.tb_MasterItem WHERE ItemNo LIKE '%5D46%' OR ItemNo LIKE '%5d46%'");
      console.log('In ForecastProject.dbo.tb_MasterItem:', r2.recordset);
    } catch (e) {
      console.log('Forecast error:', e.message);
    }

    console.log('\n--- 3. Checking all PartNos in Stored_Get_Dropdown_PC_Plan_Data starting with A5D46 or 5D46 ---');
    const res = await pool.request()
      .input('Division_Id', sql.Int, 2)
      .input('Mode', sql.NVarChar(10), 'SLOW')
      .execute('trans.Stored_Get_Dropdown_PC_Plan_Data');

    const partNos = res.recordsets[1] || [];
    const all5D = partNos.filter(p => (p.PartNo || '').toUpperCase().includes('5D46'));
    console.log('All 5D46 PartNos in PMC Master Dropdown:');
    console.table(all5D);

    console.log('\n--- 4. Checking if fuzzy search without "A" prefix matches ---');
    const userSearch = '5d46-2-glc'.toLowerCase();
    console.log('User typed:', userSearch);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}
test();
