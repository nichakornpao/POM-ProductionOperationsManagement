const sql=require('mssql'); const config=require('./src/config/database');
async function run(){
  try {
    const pool = await config.poolPromise;
    const poolIndirrec = await config.poolRequestIndirrecPromise;

    // 1. Get all mock items
    const res = await poolIndirrec.request().query("SELECT DISTINCT ItemNo, Division FROM [dbo].[TestPurchaseRequestList] WHERE STOCK_ON_HAND = 0");
    const items = res.recordset;
    
    console.log(`Found ${items.length} distinct ItemNos to sync...`);

    let updatedCount = 0;
    for (const item of items) {
      if (!item.ItemNo) continue;
      
      const divMap = { '71DZ': 2, 'PMC': 2, '7122': 3 };
      const divInt = divMap[item.Division] || 2;

      const spRes = await pool.request()
        .input('Input_ItemNo', sql.NVarChar, item.ItemNo.trim())
        .input('Input_Division', sql.Int, divInt)
        .input('Is_Autocomplete', sql.Bit, 0)
        .execute('trans.Stored_Get_ItemDetail_AutoFill');
      
      if (spRes.recordset && spRes.recordset.length > 0) {
        const onHand = spRes.recordset[0].ON_HAND || spRes.recordset[0].STOCK_ON_HAND || 0;
        
        await poolIndirrec.request()
          .input('STOCK_ON_HAND', sql.Int, onHand)
          .input('ItemNo', sql.NVarChar, item.ItemNo)
          .query(`UPDATE [dbo].[TestPurchaseRequestList] SET STOCK_ON_HAND = @STOCK_ON_HAND WHERE ItemNo = @ItemNo`);
        
        console.log(`Synced ${item.ItemNo} -> ${onHand}`);
        updatedCount++;
      }
    }
    console.log(`Successfully synced ${updatedCount} items.`);
    process.exit(0);
  } catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
