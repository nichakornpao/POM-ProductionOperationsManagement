const sql = require('mssql');
sql.connect({user:'Cost_Team',password:'Cost@User1',server:'PBGM8G\\SQLEXPRESS',database:'RequestindirrecMaterial',options:{encrypt:false,trustServerCertificate:true}})
  .then(pool => pool.request().query('ALTER TABLE dbo.EngineerPMCpart ADD MCNo VARCHAR(100), Fac VARCHAR(100)')
  .then(() => { console.log("Columns added"); process.exit(); }))
  .catch(err => { console.error(err); process.exit(1); });
