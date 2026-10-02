const fs = require('fs');
const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request().query("SELECT ROUTINE_SCHEMA, ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE'")
    .then(r => {
      fs.writeFileSync('sp_list.json', JSON.stringify(r.recordset, null, 2));
      process.exit(0);
    })
    .catch(console.error);
}).catch(console.error);
