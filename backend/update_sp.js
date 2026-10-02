require('dotenv').config({ path: './.env' });
const fs = require('fs');
const { poolPromise } = require('./src/config/database');

let sql = fs.readFileSync('./sql/Update_InsertRequestBulk_Add_UniqueId.sql', 'utf8');

// Strip everything before CREATE OR ALTER PROCEDURE
const matchIndex = sql.indexOf('CREATE OR ALTER PROCEDURE');
if (matchIndex !== -1) {
  sql = sql.substring(matchIndex);
}

// Strip GO
sql = sql.replace(/^GO$/gm, '');

poolPromise.then(pool => {
  return pool.request().batch(sql);
}).then(() => {
  console.log('Stored Procedure Updated successfully!');
  process.exit(0);
}).catch(e => {
  console.error('Failed:', e);
  process.exit(1);
});
