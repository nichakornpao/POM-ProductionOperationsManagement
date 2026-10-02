const { poolPromise } = require('./src/config/database');

async function deactivateTestRows() {
  try {
    const pool = await poolPromise;
    console.log('Deactivating 9 test rows created by Paopao03 & PP (Plan_ID: 1657, 1656, 1659, 1658, 1655, 1639, 1638, 1637, 1636)...');

    const res = await pool.request().query(`
      UPDATE [master].[tb_PC_Plan]
      SET IsActive = 0, PlanStatus = 'Cancelled'
      WHERE Plan_ID IN (1657, 1656, 1659, 1658, 1655, 1639, 1638, 1637, 1636);
    `);

    console.log(`✅ Successfully deactivated ${res.rowsAffected[0]} test rows!`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

deactivateTestRows();
