const sql = require('mssql');
const { poolPromise } = require('./src/config/database');
const fs = require('fs');

async function alterSP() {
  try {
    const pool = await poolPromise;
    console.log('Connected to DB');

    // Read the modified SP
    let spContent = fs.readFileSync('sp_pcplan_query.sql', 'utf8');

    // Modify the SP content from CREATE PROCEDURE to ALTER PROCEDURE
    spContent = spContent.replace('CREATE PROCEDURE [trans].[Stored_PCPlan_Query]', 'ALTER PROCEDURE [trans].[Stored_PCPlan_Query]');
    
    // Expand the EndDate from +4 days to +30 days so upcoming plans are visible to everyone
    spContent = spContent.replace('DECLARE @EndDate DATE = DATEADD(DAY, 4, @Today);', 'DECLARE @EndDate DATE = DATEADD(DAY, 45, @Today);');

    await pool.request().query(spContent);
    console.log('SP Altered successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error altering SP:', err);
    process.exit(1);
  }
}

alterSP();
