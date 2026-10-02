const { poolRequestIndirrecPromise } = require('./src/config/database');

async function fix() {
  try {
    const pool = await poolRequestIndirrecPromise;
    await pool.request().query(`
      UPDATE [dbo].[TestPurchaseRequestList]
      SET MAIN_LOCATION = 'MOCK-LOC',
          MCType = ISNULL(MCType, 'MOCK-MC-TYPE'),
          MCNo = ISNULL(MCNo, 'MOCK-MC-NO'),
          MFGOrderNo = ISNULL(MFGOrderNo, 'MOCK-DECL')
      WHERE MAIN_LOCATION IS NULL OR MAIN_LOCATION = ''
    `);
    console.log('Fixed MAIN_LOCATION and missing required fields in TestPurchaseRequestList');
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

fix();
