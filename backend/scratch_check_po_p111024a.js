const { poolPromise } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const res = await pool.request().query("SELECT * FROM [db_Cost_Data_Centralized].[master].[tb_MRP_POBalance_71DZ_2] WHERE ItemNo = 'P111024A'");
    console.log("POBalance for P111024A:", res.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
