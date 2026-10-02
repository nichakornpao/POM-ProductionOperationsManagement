const mssql = require('mssql');
const config = require('./src/config/database');

async function run() {
  try {
    const pool = await mssql.connect(config.configPurchaseAutoload);
    const result = await pool.request().query("SELECT item_no, on_hand, filter_range, account_code FROM [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw] WHERE item_no LIKE 'PBQ0005%' OR item_no LIKE 'P5610006%' OR item_no LIKE 'PMA03213%'");
    console.log(result.recordset);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
