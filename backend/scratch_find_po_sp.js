const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .query(`
      SELECT SPECIFIC_CATALOG, SPECIFIC_SCHEMA, ROUTINE_NAME 
      FROM [db_Cost_Data_Centralized].INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_TYPE = 'PROCEDURE' 
        AND ROUTINE_NAME LIKE '%PO%'
    `)
    .then(r => {
      console.log('SPs in db_Cost_Data_Centralized:', r.recordset);
      
      return pool.request().query(`
        SELECT SPECIFIC_CATALOG, SPECIFIC_SCHEMA, ROUTINE_NAME 
        FROM POM.INFORMATION_SCHEMA.ROUTINES 
        WHERE ROUTINE_TYPE = 'PROCEDURE' 
          AND ROUTINE_NAME LIKE '%PO%'
      `);
    })
    .then(r => {
      console.log('SPs in POM:', r.recordset);
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}).catch(console.error);
