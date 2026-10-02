const { poolRequestIndirrecPromise } = require('./src/config/database');
async function addColumn() {
  const pool = await poolRequestIndirrecPromise;
  try {
    await pool.request().query('ALTER TABLE [dbo].[TestCaseSetupList] ADD MAIN_LOCATION NVARCHAR(50)');
    console.log("Added MAIN_LOCATION to TestCaseSetupList");
  } catch (e) {
    console.log(e.message);
  }
  process.exit(0);
}
addColumn();
