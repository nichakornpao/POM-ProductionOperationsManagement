const sql = require('mssql');
sql.connect({user:'Cost_Team',password:'Cost@User1',server:'PBGM8G\\SQLEXPRESS',database:'RequestindirrecMaterial',options:{encrypt:false,trustServerCertificate:true}})
  .then(pool => pool.request().query('ALTER TABLE dbo.EngineerPMCpart ALTER COLUMN MCNo VARCHAR(MAX); ALTER TABLE dbo.EngineerPMCpart ALTER COLUMN Fac VARCHAR(MAX);')
  .then(() => { console.log("Columns altered to VARCHAR(MAX)"); process.exit(); }))
  .catch(err => { console.error(err); process.exit(1); });
