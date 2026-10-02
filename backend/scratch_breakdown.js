const { poolPromise } = require('./src/config/database');

async function inspect() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT Plan_ID, PartNo, Comment, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM [master].[tb_PC_Plan]
      WHERE Path_Dwg IS NOT NULL AND Path_Dwg <> '' AND Path_Dwg <> '-'
        AND Path_Layout IS NOT NULL AND Path_Layout <> '' AND Path_Layout <> '-'
    `);

    let manualCount = 0;
    let testCount = 0;
    let nullCount = 0;
    let autoCount = 0;

    res.recordset.forEach(r => {
      const isTest = (r.Comment || '').toLowerCase().includes('test') || (r.PartNo || '').toLowerCase().includes('test');
      const isManual = r.Path_Dwg_Source === 'manual' || r.Path_Layout_Source === 'manual';
      const isNull = !r.Path_Dwg_Source || !r.Path_Layout_Source;
      const isAuto = r.Path_Dwg_Source === 'auto' && r.Path_Layout_Source === 'auto';

      if (isTest) testCount++;
      else if (isManual) manualCount++;
      else if (isNull) nullCount++;
      else if (isAuto) autoCount++;
    });

    console.log({ total: res.recordset.length, testCount, manualCount, nullCount, autoCount });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspect();
