const { poolRequestIndirrecPromise } = require('./src/config/database');

async function seedPMC() {
  try {
    const pool = await poolRequestIndirrecPromise;

    // Check how many PMC test rows already exist
    const existCheck = await pool.request().query(`
      SELECT COUNT(1) as cnt FROM TestPurchaseRequestList
      WHERE Division = 'PMC' AND Public_Id LIKE 'TEST-RT-%'
    `);
    const existing = existCheck.recordset[0].cnt;
    console.log(`Existing PMC mock rows: ${existing}`);

    if (existing > 0) {
      console.log('PMC mock data already exists. Resetting status to Waiting...');
      await pool.request().query(`
        UPDATE TestPurchaseRequestList
        SET Status = 'Waiting', AS400STATUS = 'Pending'
        WHERE Division = 'PMC' AND Public_Id LIKE 'TEST-RT-%'
      `);
      console.log('Reset done!');
    } else {
      // Items with Division=PMC
      const items = [
        { no: 'P111498AR01', part: 'T7193-M1D',  mcType: 'ML-400', mcNo: '65,2,74,76,45,33,34,3', mfg: 'MT7193-ML4', doc: 'INVRL6260826' },
        { no: 'P113089A',    part: 'T7200-M2A',  mcType: 'ML-400', mcNo: '10,11,12,13,14,15',    mfg: 'MT7200-ML4', doc: 'INVRL6260827' },
        { no: 'P111520A',    part: 'T7210-M3B',  mcType: 'BM-165', mcNo: '20,21,22,23,24',       mfg: 'MT7210-BM1', doc: 'INVRL6260828' },
        { no: 'P112001B',    part: 'T7250-M4C',  mcType: 'BM-165', mcNo: '30,31,32,33',           mfg: 'MT7250-BM1', doc: 'INVRL6260829' },
        { no: 'P112300A',    part: 'T7300-M5D',  mcType: 'ML-400', mcNo: '40,41,42,43,44',       mfg: 'MT7300-ML4', doc: 'INVRL6260830' },
        { no: 'P113500C',    part: 'T7350-M6A',  mcType: 'SH-200', mcNo: '50,51,52,53',           mfg: 'MT7350-SH2', doc: 'INVRL6260831' },
        { no: 'P114000B',    part: 'T7400-M7B',  mcType: 'SH-200', mcNo: '60,61,62',              mfg: 'MT7400-SH2', doc: 'INVRL6260832' },
        { no: 'P114500A',    part: 'T7450-M8C',  mcType: 'ML-400', mcNo: '70,71,72,73',           mfg: 'MT7450-ML4', doc: 'INVRL6260833' },
        { no: 'P115000D',    part: 'T7500-M9D',  mcType: 'BM-165', mcNo: '80,81,82',              mfg: 'MT7500-BM1', doc: 'INVRL6260834' },
        { no: 'P115500A',    part: 'T7550-M10A', mcType: 'SH-200', mcNo: '90,91,92,93,94,95',    mfg: 'MT7550-SH2', doc: 'INVRL6260835' },
      ];

      const values = items.map((item, i) => {
        const idx = String(5600 + i).padStart(4, '0');
        const stock = [0, 0, 5, 0, 10, 0, 0, 3, 0, 0][i]; // some zero, some non-zero
        const qty = Math.floor(Math.random() * 5) + 1;
        return `('TEST-RT-${idx}', 'PMC', '${item.part}', '${item.no}', ${qty}, ${qty}, ${stock}, '${item.mcType}', '${item.mcNo}', '${item.mfg}', '${item.doc}', 'Waiting', 'Pending', NULL, NULL, GETDATE(), NULL, 'PMC Mock Test Item ${i+1}', NULL, NULL)`;
      });

      const insertSQL = `
        INSERT INTO TestPurchaseRequestList
          (Public_Id, Division, PartNo, ItemNo, QTY, Req_QTY, STOCK_ON_HAND, MCType, MCNo, MFGOrderNo, DocNo, Status, AS400STATUS, DateComplete, MAIN_LOCATION, DateTime_Record, MatLot, Remark, Process, [CASE])
        VALUES
        ${values.join(',\n')}
      `;

      await pool.request().query(insertSQL);
      console.log(`Inserted ${items.length} PMC mock rows successfully!`);
    }

    // Show final state
    const check = await pool.request().query(`
      SELECT Public_Id, ItemNo, Division, Status, AS400STATUS, STOCK_ON_HAND
      FROM TestPurchaseRequestList
      WHERE Division = 'PMC' AND Public_Id LIKE 'TEST-RT-%'
    `);
    console.table(check.recordset);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

seedPMC();
