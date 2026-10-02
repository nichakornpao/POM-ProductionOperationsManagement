const { poolPbgm8gPromise, poolPromise } = require("../config/database");
const sql = require("mssql");

// Helper to ensure tables exist in CostReduction database
async function ensureTablesExist(pool) {
  try {
    await pool.request().query(`
      IF OBJECT_ID('dbo.Forecast', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Forecast (
          ID INT IDENTITY(1,1) PRIMARY KEY,
          OrderID NVARCHAR(50),
          Tooling NVARCHAR(50),
          Name NVARCHAR(100),
          MC_Qty INT,
          Req_Qty INT,
          Amount FLOAT,
          Month NVARCHAR(50),
          Year NVARCHAR(50),
          Revision NVARCHAR(50)
        );
        -- Insert some mock forecast data to get started
        INSERT INTO dbo.Forecast (OrderID, Tooling, Name, MC_Qty, Req_Qty, Amount, Month, Year, Revision) VALUES
        ('ORD-2026-001', 'TL-8891', 'Punch Die-A (DB)', 2, 5, 25000, 'มกราคม', '2026', 'Rev.0'),
        ('ORD-2026-002', 'TL-4432', 'Guide Pin 12mm (DB)', 10, 20, 8000, 'มกราคม', '2026', 'Rev.0'),
        ('ORD-2026-003', 'TL-5510', 'Stripper Plate B (DB)', 1, 2, 45000, 'มกราคม', '2026', 'Rev.0');
      END

      IF OBJECT_ID('dbo.Orders', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Orders (
          ID INT IDENTITY(1,1) PRIMARY KEY,
          OrderID NVARCHAR(50) UNIQUE,
          Process NVARCHAR(50),
          MC NVARCHAR(50),
          PartNo NVARCHAR(50),
          Part_Qty INT,
          Month NVARCHAR(50)
        );
        -- Insert some mock orders
        INSERT INTO dbo.Orders (OrderID, Process, MC, PartNo, Part_Qty, Month) VALUES
        ('ORD-2026-001', 'Stamping', 'MC-STAMP-01', 'P-99882', 5000, 'มกราคม'),
        ('ORD-2026-002', 'Molding', 'MC-MOLD-05', 'P-11223', 12000, 'มกราคม');
      END
    `);
    console.log("[Forecast DB] Tables dbo.Forecast and dbo.Orders checked/created successfully.");
  } catch (err) {
    console.error("[Forecast DB] Error ensuring tables exist:", err.message);
  }
}

// Get Active Connection Pool
async function getPool() {
  let pool = await poolPbgm8gPromise;
  if (!pool) {
    throw new Error("Unable to connect to PBGM8G CostReduction database server.");
  }
  await ensureTablesExist(pool);
  return pool;
}

// 1. Get Forecast
exports.getForecast = async (req, res) => {
  try {
    const { month, year, revision } = req.query; console.log('getPCPlan called with:', month, year, revision);
    const pool = await getPool();
    
    const result = await pool.request()
      .input('Month', sql.NVarChar(50), month)
      .input('Year', sql.NVarChar(50), year)
      .input('Revision', sql.NVarChar(50), revision)
      .query(`
        SELECT OrderID AS orderId, Tooling AS tooling, Name AS name, MC_Qty AS mcQty, Req_Qty AS reqQty, Amount AS amount
        FROM dbo.Forecast
        WHERE Month = @Month AND Year = @Year AND Revision = @Revision
      `);
      
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getForecast Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 1.5 Get Tooling Master (Read-Only from pbp155 db_Tooling)
exports.getToolingMaster = async (req, res) => {
  try {
    const pool = await poolPromise; // Uses default dbConfig which is pbp155 db_Tooling
    if (!pool) {
      throw new Error("Cannot connect to Master Tooling Database.");
    }
    
    // STRICTLY CALL STORED PROCEDURE - POLICY COMPLIANCE (OVERRIDDEN BY USER REQUEST)
    const result = await pool.request().query(`
      SELECT 
        PartNo, 
        ItemNo, 
        Process, 
        MC, 
        Usage_pcs, 
        CT_sec,
        Position 
      FROM [db_Tooling].[dbo].[PartItem] 
      WHERE PartNo IS NOT NULL
    `);
    const toolingMaster = result.recordset;

    // Fetch Unit Price from Centralized DB via Stored Procedure (PBP155 DB)
    let centralizedPriceMap = new Map();
    let autoloaderPriceMap = new Map();
    try {
      const priceResult = await pool.request().query('EXEC [db_Cost_Data_Centralized].[viewer].[Stored_Get_Centralized_UnitPrice]');
      for (const row of priceResult.recordset) {
        if (row.ItemNo && row.unitPrice !== undefined) {
          const itemNo = row.ItemNo.trim().toUpperCase();
          const spec = (row.Spec || '').trim().toUpperCase();
          centralizedPriceMap.set(`${itemNo}|${spec}`, row.unitPrice);
          // Fallback to item no only
          if (!centralizedPriceMap.has(itemNo)) {
            centralizedPriceMap.set(itemNo, row.unitPrice);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch Centralized Unit Price:", err.message);
    }

    // Fetch Unit Price from PBGM8G Autoloader View for better coverage
    try {
      const { poolPbgm8gPromise } = require("../config/database");
      const pool8g = await poolPbgm8gPromise;
      if (pool8g) {
        const autoLoaderResult = await pool8g.request().query("SELECT item_no, spec, unit_price FROM [cost_reduction_autoloader_production].[view].[View_autoload_all_factory_supply_LastPrice_Item] WHERE section LIKE '%71DZ%'");
        for (const row of autoLoaderResult.recordset) {
          if (row.item_no && row.unit_price !== undefined) {
            const itemNo = row.item_no.trim().toUpperCase();
            const spec = (row.spec || '').trim().toUpperCase();
            autoloaderPriceMap.set(`${itemNo}|${spec}`, row.unit_price);
            autoloaderPriceMap.set(itemNo, row.unit_price);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch Autoloader Unit Price:", err.message);
    }

    // Also get the Item Master Minimal to merge ItemName and Spec
    try {
      const itemMasterResult = await pool.request().execute('[trans].[Stored_Get_ItemMaster_Minimal]');
      const itemMaster = itemMasterResult.recordset;
      const itemMap = new Map();
      for (const row of itemMaster) {
        if (row.ItemNo) {
          itemMap.set(row.ItemNo.trim(), {
            itemName: row.ItemName || '',
              spec: row.Spec || row.SPEC || '',
              vendorCode: row.VendorCode || row.VENDOR || '',
              vendorName: row.VendorName || row.VENDOR_NAME || ''
          });
        }
      }
      
      for (const row of toolingMaster) {
        if (row.ItemNo) {
          const itemNoTrimmed = row.ItemNo.trim();
          const itemNoUpper = itemNoTrimmed.toUpperCase();
          const masterData = itemMap.get(itemNoTrimmed);
          if (masterData) {
            row.ItemName = masterData.itemName;
            row.Spec = masterData.spec;
          } else {
            row.ItemName = `Tooling for ${row.ItemNo}`;
            row.Spec = '';
          }

          // Merge Unit Price
          const specUpper = (row.Spec || '').trim().toUpperCase();
          const compositeKey = `${itemNoUpper}|${specUpper}`;
          if (autoloaderPriceMap.has(compositeKey)) {
            row.unitPrice = autoloaderPriceMap.get(compositeKey);
            row.Unit_Price = autoloaderPriceMap.get(compositeKey);
          } else if (autoloaderPriceMap.has(itemNoUpper)) {
            row.unitPrice = autoloaderPriceMap.get(itemNoUpper);
            row.Unit_Price = autoloaderPriceMap.get(itemNoUpper);
          } else if (centralizedPriceMap.has(compositeKey)) {
            row.unitPrice = centralizedPriceMap.get(compositeKey);
            row.Unit_Price = centralizedPriceMap.get(compositeKey); 
          } else if (centralizedPriceMap.has(itemNoUpper)) {
            row.unitPrice = centralizedPriceMap.get(itemNoUpper);
            row.Unit_Price = centralizedPriceMap.get(itemNoUpper);
          }
        }
      }
    } catch (err) {
      console.error("Failed to map Item Master data in getToolingMaster:", err);
    }
    
    res.status(200).json(toolingMaster);
  } catch (err) {
    console.error("getToolingMaster Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 1.6 Import Tooling Master (UPSERT via Stored Procedure)
exports.importToolingMaster = async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "Invalid data format or empty array" });
    }

    const pool = await poolPromise; // pbp155 db_Tooling
    if (!pool) throw new Error("Cannot connect to Master Tooling Database.");

    const sql = require('mssql');
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let successCount = 0;
    try {
      for (const row of data) {
        if (!row.partNo || !row.itemNo) continue; // Skip invalid rows

        const request = new sql.Request(transaction);
        request.input('PartNo', sql.NVarChar(100), row.partNo);
        request.input('ItemNo', sql.NVarChar(100), row.itemNo);
        request.input('Process', sql.NVarChar(100), row.process || null);
        request.input('MC', sql.NVarChar(100), row.mc || null);
        request.input('Usage_pcs', sql.Int, Number(row.usagePcs) || 0);
        request.input('CT_sec', sql.Decimal(10,2), Number(row.ctSec) || 0);

        await request.execute('[trans].[Stored_Import_ToolingMaster]');
        successCount++;
      }
      
      await transaction.commit();
      res.status(200).json({ message: "Import successful", recordsUpdated: successCount });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("importToolingMaster Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 2. Submit / Generate Forecast
exports.submitForecast = async (req, res) => {
  try {
    const { month, year, revision, data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "data must be an array" });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Clear old forecast for same filters
      const deleteRequest = new sql.Request(transaction);
      await deleteRequest
        .input('Month', sql.NVarChar(50), month)
        .input('Year', sql.NVarChar(50), year)
        .input('Revision', sql.NVarChar(50), revision)
        .query("DELETE FROM dbo.Forecast WHERE Month = @Month AND Year = @Year AND Revision = @Revision");

      // Insert new forecast rows
      for (const row of data) {
        const insertRequest = new sql.Request(transaction);
        await insertRequest
          .input('OrderID', sql.NVarChar(50), row.orderId)
          .input('Tooling', sql.NVarChar(50), row.tooling)
          .input('Name', sql.NVarChar(100), row.name)
          .input('MC_Qty', sql.Int, parseInt(row.mcQty) || 0)
          .input('Req_Qty', sql.Int, parseInt(row.reqQty) || 0)
          .input('Amount', sql.Float, parseFloat(row.amount) || 0)
          .input('Month', sql.NVarChar(50), month)
          .input('Year', sql.NVarChar(50), year)
          .input('Revision', sql.NVarChar(50), revision)
          .query(`
            INSERT INTO dbo.Forecast (OrderID, Tooling, Name, MC_Qty, Req_Qty, Amount, Month, Year, Revision)
            VALUES (@OrderID, @Tooling, @Name, @MC_Qty, @Req_Qty, @Amount, @Month, @Year, @Revision)
          `);
      }

      await transaction.commit();
      res.status(200).json({ success: true, count: data.length });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error("submitForecast Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 3. Get Orders
exports.getOrders = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT OrderID AS orderId, Process AS process, MC AS mc, PartNo AS partNo, Part_Qty AS partQty, Month AS month
      FROM dbo.Orders
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getOrders Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 4. Insert Order
exports.insertOrder = async (req, res) => {
  try {
    const { orderId, process, mc, partNo, partQty, month } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('OrderID', sql.NVarChar(50), orderId)
      .input('Process', sql.NVarChar(50), process)
      .input('MC', sql.NVarChar(50), mc)
      .input('PartNo', sql.NVarChar(50), partNo)
      .input('Part_Qty', sql.Int, parseInt(partQty) || 0)
      .input('Month', sql.NVarChar(50), month)
      .query(`
        INSERT INTO dbo.Orders (OrderID, Process, MC, PartNo, Part_Qty, Month)
        VALUES (@OrderID, @Process, @MC, @PartNo, @Part_Qty, @Month)
      `);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("insertOrder Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 5. Update Order
exports.updateOrder = async (req, res) => {
  try {
    const { orderId, process, mc, partNo, partQty, month } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('OrderID', sql.NVarChar(50), orderId)
      .input('Process', sql.NVarChar(50), process)
      .input('MC', sql.NVarChar(50), mc)
      .input('PartNo', sql.NVarChar(50), partNo)
      .input('Part_Qty', sql.Int, parseInt(partQty) || 0)
      .input('Month', sql.NVarChar(50), month)
      .query(`
        UPDATE dbo.Orders
        SET Process = @Process, MC = @MC, PartNo = @PartNo, Part_Qty = @Part_Qty, Month = @Month
        WHERE OrderID = @OrderID
      `);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("updateOrder Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 6. Delete Order
exports.deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const pool = await getPool();
    await pool.request()
      .input('OrderID', sql.NVarChar(50), orderId)
      .query("DELETE FROM dbo.Orders WHERE OrderID = @OrderID");
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("deleteOrder Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 7. Get Database Connection Status for PBGM8G
exports.getConnectionStatus = async (req, res) => {
  try {
    const pool = await poolPbgm8gPromise;
    if (pool && pool.connected) {
      res.status(200).json({ connected: true, server: 'PBGM8G', database: 'CostReduction' });
    } else {
      res.status(200).json({ connected: false, error: 'Could not connect to PBGM8G server' });
    }
  } catch (err) {
    res.status(200).json({ connected: false, error: err.message });
  }
};

// 8. Import Planning Excel Sheet & Calculate Forecast
exports.importPlanningExcel = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const { month, year, revision } = req.body;
    if (!month || !year || !revision) {
      return res.status(400).json({ error: "Month, Year, and Revision are required." });
    }

    const pool = await getPool();

    // Parse Excel
    const XLSX = require('xlsx');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return res.status(400).json({ error: "No sheet found in uploaded Excel file." });
    }

    // Convert sheet to json
    const rawRows = XLSX.utils.sheet_to_json(worksheet);
    if (rawRows.length === 0) {
      return res.status(400).json({ error: "Excel file has no data rows." });
    }

    // Helper to search values case-insensitively and ignore symbols/spaces
    const findValue = (row, possibleKeys, defaultValue = null) => {
      const keys = Object.keys(row);
      for (const pk of possibleKeys) {
        const pkClean = pk.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const k of keys) {
          const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (kClean === pkClean) {
            return row[k];
          }
        }
      }
      return defaultValue;
    };

    const calculatedData = [];
    let idx = 1;

    for (const row of rawRows) {
      const orderId = findValue(row, ['orderid', 'order_id', 'orderno', 'order_no', 'order'], `ORD-PL-${Date.now().toString().slice(-4)}-${idx}`);
      const tooling = findValue(row, ['tooling', 'tooling_id', 'toolingid', 'part_no', 'partno', 'item_no', 'itemno']);
      const name = findValue(row, ['name', 'tooling_name', 'toolingname', 'item_name', 'itemname'], `Tooling for ${tooling || idx}`);
      
      const partQty = parseFloat(findValue(row, ['part_qty', 'partqty', 'qty', 'quantity', 'part_quantity', 'plan_qty', 'planqty'], 0)) || 0;
      const working = parseFloat(findValue(row, ['working', 'working_days', 'workingdays', 'work_days', 'workdays'], 0)) || 0;
      const ctSec = parseFloat(findValue(row, ['ct_sec', 'ctsec', 'cycle_time', 'cycletime', 'ct_second', 'ctseconds', 'ct(sec)', 'ct (sec)'], 0)) || 0;
      const unitPrice = parseFloat(findValue(row, ['unit_price', 'unitprice', 'price', 'cost', 'price_unit'], 0)) || 0;
      const itemQty = parseFloat(findValue(row, ['item_qty', 'itemqty', 'current_qty', 'existing_qty'], 0)) || 0;

      // Skip row if there is no tooling / part number
      if (!tooling) {
        continue;
      }

      // Calculations:
      // MC_qty = ceil((Part_qty / working) / ((3600 / CT_sec) * 24 * 0.9))
      let mcQty = 0;
      if (working > 0 && ctSec > 0) {
        const dailyPartQty = partQty / working;
        const machineDailyCapacity = (3600 / ctSec) * 24 * 0.9;
        mcQty = Math.ceil(dailyPartQty / machineDailyCapacity);
      }

      // If Item_qty < MC_qty, set Item_qty = MC_qty
      let reqQty = itemQty;
      if (reqQty < mcQty) {
        reqQty = mcQty;
      }

      // Amount = Unit_Price * Item_qty
      const amount = unitPrice * reqQty;

      calculatedData.push({
        orderId: String(orderId),
        tooling: String(tooling),
        name: String(name),
        mcQty: parseInt(mcQty) || 0,
        reqQty: parseInt(reqQty) || 0,
        amount: parseFloat(amount) || 0
      });
      idx++;
    }

    if (calculatedData.length === 0) {
      return res.status(400).json({ error: "Could not parse any valid rows with tooling/part numbers from the file." });
    }

    // Save into database in a transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const deleteReq = new sql.Request(transaction);
      await deleteReq
        .input('Month', sql.NVarChar(50), month)
        .input('Year', sql.NVarChar(50), year)
        .input('Revision', sql.NVarChar(50), revision)
        .query("DELETE FROM dbo.Forecast WHERE Month = @Month AND Year = @Year AND Revision = @Revision");

      for (const row of calculatedData) {
        const insertReq = new sql.Request(transaction);
        await insertReq
          .input('OrderID', sql.NVarChar(50), row.orderId)
          .input('Tooling', sql.NVarChar(50), row.tooling)
          .input('Name', sql.NVarChar(100), row.name)
          .input('MC_Qty', sql.Int, row.mcQty)
          .input('Req_Qty', sql.Int, row.reqQty)
          .input('Amount', sql.Float, row.amount)
          .input('Month', sql.NVarChar(50), month)
          .input('Year', sql.NVarChar(50), year)
          .input('Revision', sql.NVarChar(50), revision)
          .query(`
            INSERT INTO dbo.Forecast (OrderID, Tooling, Name, MC_Qty, Req_Qty, Amount, Month, Year, Revision)
            VALUES (@OrderID, @Tooling, @Name, @MC_Qty, @Req_Qty, @Amount, @Month, @Year, @Revision)
          `);
      }

      await transaction.commit();
      res.status(200).json({ success: true, count: calculatedData.length, data: calculatedData });
    } catch (dbErr) {
      await transaction.rollback();
      throw dbErr;
    }
  } catch (err) {
    console.error("importPlanningExcel Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 9. Save PC Forecast to ForecastProject Database
exports.savePCPlan = async (req, res) => {
  try {
    const { month, year, revision, data, createdBy } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "data must be an array" });
    }
    if (!month || !year || !revision) {
      return res.status(400).json({ error: "Month, Year, and Revision are required" });
    }

    const { poolForecastProjectPromise } = require("../config/database");
    const pool = await poolForecastProjectPromise;
    
    if (!pool) {
      return res.status(500).json({ error: "Cannot connect to ForecastProject DB on PBGM8G" });
    }

    const sql = require("mssql");
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Delete old records for the exact same Month/Year/Rev to prevent duplicates if saved multiple times
      const deleteRequest = new sql.Request(transaction);
      await deleteRequest
        .input('ForecastMonth', sql.NVarChar(20), month)
        .input('ForecastYear', sql.NVarChar(20), year)
        .input('Revision', sql.NVarChar(20), revision)
        .query("DELETE FROM dbo.tb_PC_Forecast WHERE ForecastMonth = @ForecastMonth AND ForecastYear = @ForecastYear AND Revision = @Revision");

      // Deduplicate rows to prevent accidental duplicate inserts (e.g. from frontend calc issues)
      const uniqueData = [];
      const seen = new Set();
      for (const row of data) {
        // Include position in the unique key to prevent dropping rows with different positions
        const key = `${row.targetMonth}_${row.itemNo}_${row.partNo}_${row.process}_${row.mc}_${row.position}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueData.push(row);
        }
      }

      // Insert new records
      for (const row of uniqueData) {
        const insertRequest = new sql.Request(transaction);
        await insertRequest
          .input('ForecastMonth', sql.NVarChar(20), month)
          .input('ForecastYear', sql.NVarChar(20), year)
          .input('Revision', sql.NVarChar(20), revision)
          
          .input('TargetMonth', sql.NVarChar(50), row.targetMonth || '')
          .input('PartRev', sql.NVarChar(50), row.partRev || '')
          
          .input('PartNo', sql.NVarChar(50), row.partNo || '')
          .input('ItemNo', sql.NVarChar(50), row.itemNo || '')
          .input('Position', sql.NVarChar(50), row.position || '')
          .input('Process', sql.NVarChar(50), row.process || '')
          .input('MC', sql.NVarChar(50), row.mc || '')
          
          .input('PartQty', sql.Int, parseInt(row.partQty) || 0)
          .input('WorkingDays', sql.Int, parseInt(row.working) || 0)
          .input('CT_sec', sql.Float, parseFloat(row.ctSec) || 0)
          .input('MCQty', sql.Int, parseInt(row.mcQty) || 0)
          
          .input('UsagePcs', sql.Int, parseInt(row.usagePcs) || 0)
          .input('ItemQtyInput', sql.Int, parseInt(row.initialItemQty) || 0)
          .input('ReqQty', sql.Int, parseInt(row.reqQty) || 0)
          
          .input('UnitPrice', sql.Decimal(18,2), parseFloat(row.unitPrice) || 0)
          .input('Amount', sql.Decimal(18,2), parseFloat(row.amount) || 0)
          
          .input('CreatedBy', sql.NVarChar(50), createdBy || 'System')
          .query(`
            INSERT INTO dbo.tb_PC_Forecast (
                ForecastMonth, ForecastYear, Revision,
                TargetMonth, PartRev,
                PartNo, ItemNo, Position, Process, MC,
                PartQty, WorkingDays, CT_sec, MCQty,
                UsagePcs, ItemQty_Input, ReqQty, UnitPrice, Amount,
                CreatedBy
            )
            VALUES (
                @ForecastMonth, @ForecastYear, @Revision,
                @TargetMonth, @PartRev,
                @PartNo, @ItemNo, @Position, @Process, @MC,
                @PartQty, @WorkingDays, @CT_sec, @MCQty,
                @UsagePcs, @ItemQtyInput, @ReqQty, @UnitPrice, @Amount,
                @CreatedBy
            )
          `);
      }

      await transaction.commit();
      res.status(200).json({ success: true, count: data.length });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error("savePCPlan Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 10. Get PC Forecast from ForecastProject Database
exports.getPCPlan = async (req, res) => {
  try {
    const { month, year, revision } = req.query;
    if (!month || !year || !revision) {
      return res.status(400).json({ error: "Month, Year, and Revision are required" });
    }

    const { poolForecastProjectPromise, poolPromise } = require("../config/database");
    const pool = await poolForecastProjectPromise;
    const pool155 = await poolPromise;
    
    if (!pool) {
      return res.status(500).json({ error: "Cannot connect to ForecastProject DB on PBGM8G" });
    }

    const sql = require("mssql");
    let queryStr = `
        SELECT 
          PartNo AS partNo, 
          ItemNo AS itemNo, 
          Position AS position,
          Process AS process, 
          MC AS mc, 
          TargetMonth AS targetMonth,
          PartRev AS partRev,
          PartQty AS partQty, 
          WorkingDays AS working, 
          CT_sec AS ctSec,
          MCQty AS mcQty, 
          UsagePcs AS usagePcs, 
          ItemQty_Input AS initialItemQty,
          ReqQty AS reqQty, 
          UnitPrice AS unitPrice, 
          Amount AS amount,
          CreatedBy AS createdBy,
          CreatedAt AS createdAt
        FROM dbo.tb_PC_Forecast
        WHERE ForecastMonth = @ForecastMonth AND ForecastYear = @ForecastYear
    `;
    
    if (revision !== 'ALL') {
        queryStr += ` AND Revision = @Revision`;
    }

    const result = await pool.request()
      .input('ForecastMonth', sql.NVarChar(20), month)
      .input('ForecastYear', sql.NVarChar(20), year)
      .input('Revision', sql.NVarChar(20), revision)
      .query(queryStr);
      
    const pcPlanRows = result.recordset;

    // Map real ItemName, Spec, and UnitPrice from 155
    try {
      if (pool155 && pcPlanRows.length > 0) {
        const masterResult = await pool155.request().execute('[trans].[Stored_Get_ItemMaster_Minimal]');
        const masterItems = masterResult.recordset;
        
        const itemMap = new Map();
        for (const row of masterItems) {
          if (row.ItemNo) {
            itemMap.set(row.ItemNo.trim(), {
              itemName: row.ItemName || '',
              spec: row.Spec || row.SPEC || '',
              vendorCode: row.VendorCode || row.VENDOR || '',
              vendorName: row.VendorName || row.VENDOR_NAME || ''
            });
          }
        }
        
        // Fetch Unit Price from Centralized DB via Stored Procedure (PBP155 DB)
        let centralizedPriceMap = new Map();
        let autoloaderPriceMap = new Map();
        try {
          const priceResult = await pool155.request().query('EXEC [db_Cost_Data_Centralized].[viewer].[Stored_Get_Centralized_UnitPrice]');
          const priceMaster = priceResult.recordset;
          for (const row of priceMaster) {
            if (row.ItemNo && row.unitPrice !== undefined) {
              const itemNo = row.ItemNo.trim().toUpperCase();
              const spec = (row.Spec || '').trim().toUpperCase();
              centralizedPriceMap.set(`${itemNo}|${spec}`, row.unitPrice);
              // Fallback to item no only
              if (!centralizedPriceMap.has(itemNo)) {
                centralizedPriceMap.set(itemNo, row.unitPrice);
              }
            }
          }
        } catch (err) {
          console.error("Failed to fetch Centralized Unit Price:", err.message);
        }

        // Fetch Unit Price from PBGM8G Autoloader View for better coverage
        try {
          const { poolPbgm8gPromise } = require("../config/database");
          const pool8g = await poolPbgm8gPromise;
          if (pool8g) {
            const autoLoaderResult = await pool8g.request().query("SELECT item_no, spec, unit_price FROM [cost_reduction_autoloader_production].[view].[View_autoload_all_factory_supply_LastPrice_Item] WHERE section LIKE '%71DZ%'");
            for (const row of autoLoaderResult.recordset) {
              if (row.item_no && row.unit_price !== undefined) {
                const itemNo = row.item_no.trim().toUpperCase();
                const spec = (row.spec || '').trim().toUpperCase();
                autoloaderPriceMap.set(`${itemNo}|${spec}`, row.unit_price);
                autoloaderPriceMap.set(itemNo, row.unit_price);
              }
            }
          }
        } catch (err) {
          console.error("Failed to fetch Autoloader Unit Price:", err.message);
        }
        
        for (const row of pcPlanRows) {
          if (row.itemNo) {
            const masterData = itemMap.get(row.itemNo.trim());
            if (masterData) {
              row.name = masterData.itemName;
              row.spec = masterData.spec;
              row.vendorCode = masterData.vendorCode;
              row.vendorName = masterData.vendorName;
            } else {
              row.name = row.itemNo === '-' || !row.itemNo ? (row.partNo ? `Tooling for ${row.partNo}` : 'Unknown Tooling') : `Tooling for ${row.itemNo}`;
              row.spec = '';
            }
            
            // Enrich unitPrice using Centralized Database mapping by ItemNo + Spec
            const itemKey = row.itemNo.trim().toUpperCase();
            const specKey = (row.spec || '').trim().toUpperCase();
            const compositeKey = `${itemKey}|${specKey}`;
            
            if (autoloaderPriceMap.has(compositeKey)) {
              row.unitPrice = autoloaderPriceMap.get(compositeKey);
              row.amount = (row.reqQty || 0) * row.unitPrice;
            } else if (autoloaderPriceMap.has(itemKey)) {
              row.unitPrice = autoloaderPriceMap.get(itemKey);
              row.amount = (row.reqQty || 0) * row.unitPrice;
            } else if (centralizedPriceMap.has(compositeKey)) {
              row.unitPrice = centralizedPriceMap.get(compositeKey);
              row.amount = (row.reqQty || 0) * row.unitPrice;
            } else if (centralizedPriceMap.has(itemKey)) {
              row.unitPrice = centralizedPriceMap.get(itemKey);
              row.amount = (row.reqQty || 0) * row.unitPrice;
            } else if (!row.unitPrice || row.unitPrice === 0) {
              row.unitPrice = 0;
              row.amount = 0;
            }
          } else {
            row.name = '';
            row.spec = '';
          }
        }
      }
    } catch (err) {
      console.error("Failed to map Item Master data:", err);
      // Fallback gracefully
      for (const row of pcPlanRows) {
        row.name = `Tooling for ${row.itemNo}`;
        row.spec = '';
      }
    }

    res.status(200).json(pcPlanRows);
  } catch (err) {
    console.error("getPCPlan Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getIncomingPO = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: "Missing year or month" });
    }

    const pool = await poolPromise;
    const request = pool.request();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthInt = monthNames.indexOf(month) + 1;
    if (monthInt === 0) {
       return res.status(400).json({ error: "Invalid month string" });
    }

    request.input('Year', sql.Int, parseInt(year, 10));
    request.input('Month', sql.Int, monthInt);
    
    // Call the updated Stored Procedure (which now uses DueMonth from tb_MRP_POBalance_71DZ_2)
    const result = await request.execute('[trans].[Stored_Get_Incoming_PO]');
    
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getIncomingPO Error:", err);
    res.status(500).json({ error: err.message });
  }
};


let cachedStockData = null;
let lastStockFetch = 0;
let cachedUsageData = null;
let lastUsageFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

exports.getStockOnRack = async (req, res) => {
  try {
    const now = Date.now();
    const cacheHit = !!(cachedStockData && (now - lastStockFetch < CACHE_TTL));
    console.log("[Stock] Cache hit:", cacheHit, "cached size:", cachedStockData ? cachedStockData.length : 0);
    if (cachedStockData && (now - lastStockFetch < CACHE_TTL)) {
      return res.status(200).json(cachedStockData);
    }
    const pool = await poolPromise;
    const result = await pool.request().execute('trans.Stored_Get_ToolingStockOnRack');
    const baseStock = result.recordset;

    // Fetch Stock PH from the new View on PBGM8G
    try {
      const { poolPbgm8gPromise } = require('../config/database');
      const pool8g = await poolPbgm8gPromise;
      if (pool8g) {
        const viewResult = await pool8g.request().query(`
          WITH LatestDate AS (
            SELECT MAX(date_downloaded) as max_date
            FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_factory_supply_inventory_daily]
            WHERE LOWER(division) = 'dz'
          ),
          RankedInv AS (
            SELECT 
              item_no,
              quantity,
              year_month,
              ROW_NUMBER() OVER (PARTITION BY item_no ORDER BY year_month DESC) as rn
            FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_factory_supply_inventory_daily] i
            JOIN LatestDate ld ON i.date_downloaded = ld.max_date
            WHERE LOWER(i.division) = 'dz'
          )
          SELECT 
            UPPER(TRIM(item_no)) as item_no,
            quantity as inv_qty
          FROM RankedInv
          WHERE rn = 1
        `);
        
        const newPhMap = new Map();
        viewResult.recordset.forEach(r => {
          if (r.item_no) {
            newPhMap.set(r.item_no.toUpperCase(), r.inv_qty);
          }
        });

        // Merge stkPh back into baseStock
        const existingItems = new Set();
        baseStock.forEach(stk => {
          const key = (stk.itemNo || stk.ItemNo || '').toUpperCase();
          existingItems.add(key);
          const ph = newPhMap.get(key);
          if (ph !== undefined) {
            stk.stkPh = ph; // Override with new view's qty
          }
        });

        // Add any missing items that were only in the view
        for (const [itemNo, invQty] of newPhMap.entries()) {
          if (!existingItems.has(itemNo)) {
            baseStock.push({
              itemNo: itemNo,
              stkPd: 0,
              stkPh: invQty
            });
          }
        }
      }
    } catch (e) {
      console.warn("Failed to fetch Stock PH from View:", e.message);
    }

    cachedStockData = baseStock;
    lastStockFetch = now;
    res.status(200).json(baseStock);
  } catch (err) {
    console.error("getStockOnRack Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getIncomingPR = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: "Missing year or month" });
    }

    const pool = await poolPromise;
    const request = pool.request();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthInt = monthNames.indexOf(month) + 1;
    if (monthInt === 0) {
       return res.status(400).json({ error: "Invalid month string" });
    }

    request.input('Year', sql.Int, parseInt(year, 10));
    request.input('Month', sql.Int, monthInt);
    
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getStockOnRack Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getIncomingPR = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: "Missing year or month" });
    }

    const pool = await poolPromise;
    const request = pool.request();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthInt = monthNames.indexOf(month) + 1;
    if (monthInt === 0) {
       return res.status(400).json({ error: "Invalid month string" });
    }

    request.input('Year', sql.Int, parseInt(year, 10));
    request.input('Month', sql.Int, monthInt);
    
    const result = await request.execute('[trans].[Stored_Get_Incoming_PR]');
    
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getIncomingPR Error:", err);
    res.status(500).json({ error: err.message });
  }
};



// Helper: 1D DBSCAN with adaptive local constraint
const getClusters = (arr, eps) => {
  if (!arr || arr.length === 0) return [];
  const clusters = [];
  let currentCluster = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const diff = arr[i] - arr[i-1];
    const localEps = Math.min(eps, Math.max(5, arr[i] * 0.30));
    if (diff <= localEps) {
      currentCluster.push(arr[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [arr[i]];
    }
  }
  clusters.push(currentCluster);
  return clusters;
};

// Helper: Sort clusters by size descending, with tie-breaking based on proximity to targetEngineerUsage
const sortClusters = (clusters, targetEngineerUsage) => {
  clusters.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    const avgA = a.reduce((sum, v) => sum + v, 0) / a.length;
    const avgB = b.reduce((sum, v) => sum + v, 0) / b.length;
    if (targetEngineerUsage > 0) {
      const diffA = Math.abs(avgA - targetEngineerUsage);
      const diffB = Math.abs(avgB - targetEngineerUsage);
      if (diffA !== diffB) {
        return diffA - diffB;
      }
    }
    return avgB - avgA;
  });
  return clusters;
};

// Helper: Clean Data using IQR + DBSCAN
const filterCleanData = (records) => {
  const partMap = new Map();
  for (const r of records) {
      const pName = r.part_name || 'UNKNOWN';
      if (!partMap.has(pName)) partMap.set(pName, []);
      partMap.get(pName).push(r);
  }
  
  const partStats = [];
  let totalRelativeIqr = 0;
  let validPartCount = 0;
  
  for (const [pName, pRecordsRaw] of partMap.entries()) {
      // Filter human errors: ratio > 2.0 OR near-zero dummy scan (total_usage <= 10 when spec > 100, or total_usage <= 2)
      const pRecordsFiltered = pRecordsRaw.filter(r => {
        if (r.ratio > 2.0) return false;
        if (r.masterUsagePcs > 100 && r.total_usage <= 10) return false;
        if (r.total_usage <= 2) return false;
        return true;
      });

      const brokenCount = pRecordsFiltered.filter(r => r.tooling_status === 'broken').length;
      const brokenRate = pRecordsFiltered.length > 0 ? (brokenCount / pRecordsFiltered.length) * 100 : 0;
      const isBroken100 = pRecordsFiltered.length > 0 && brokenCount === pRecordsFiltered.length;
      
      // If 100% broken, keep records so getToolingUsageParameters can recognize it as Broken 100%
      if (isBroken100) {
        partStats.push({ pName, pRecords: pRecordsFiltered, iqr: 0, median: 0, rIqr: 0, skipOutlier: true });
        continue;
      }

      // If broken > 10% of total records for that part, calculate ALL records without outlier filtering
      if (brokenRate > 10) {
        partStats.push({ pName, pRecords: pRecordsFiltered, iqr: 0, median: 0, rIqr: 0, skipOutlier: true });
        continue;
      }

      // If broken <= 10%, exclude broken records from normal calculation
      const pRecords = pRecordsFiltered.filter(r => r.tooling_status !== 'broken');

      if (pRecords.length === 0) continue;

      if (pRecords.length < 3) {
        partStats.push({ pName, pRecords, iqr: 0, median: 0, rIqr: 0, skipOutlier: true });
        continue;
      }
      const usages = pRecords.map(r => r.total_usage).sort((a,b) => a-b);
      const q1 = usages[Math.floor(usages.length * 0.25)];
      const q3 = usages[Math.floor(usages.length * 0.75)];
      const iqr = q3 - q1;
      const mid = Math.floor(usages.length / 2);
      const median = usages.length % 2 !== 0 ? usages[mid] : (usages[mid-1] + usages[mid]) / 2;
      
      let rIqr = 0;
      if (median > 0 && iqr > 0) {
        rIqr = iqr / median;
        totalRelativeIqr += rIqr;
        validPartCount++;
      }
      partStats.push({ pName, pRecords, usages, q1, q3, iqr, median, rIqr, skipOutlier: false });
  }
  
  const globalRIqr = validPartCount > 0 ? (totalRelativeIqr / validPartCount) : 0.20; 
  let allCleanRecords = [];
  
  for (const stats of partStats) {
      if (stats.skipOutlier) {
        allCleanRecords.push(...stats.pRecords);
        continue;
      }
      let finalIqr = stats.iqr;
      if (finalIqr === 0) finalIqr = stats.median * globalRIqr;
      
      const lower = Math.max(0, stats.q1 - (1.5 * finalIqr));
      const upper = stats.q3 + (1.5 * finalIqr);
      
      let iqrFiltered = stats.pRecords.filter(r => r.total_usage >= lower && r.total_usage <= upper);
      if (iqrFiltered.length === 0) iqrFiltered = stats.pRecords;
      
      let dbscanFiltered = iqrFiltered;
      if (iqrFiltered.length >= 3) {
        const d_usages = iqrFiltered.map(r => r.total_usage).sort((a,b) => a-b);
        const d_mid = Math.floor(d_usages.length / 2);
        const d_median = d_usages.length % 2 !== 0 ? d_usages[d_mid] : (d_usages[d_mid-1] + d_usages[d_mid]) / 2;
        let bestEps = Math.max(2, d_median * 0.20);
        
        let targetEngineerUsage = 0;
        const specs = stats.pRecords.map(r => r.ratio > 0 ? Math.round(r.total_usage / r.ratio) : 0).filter(s => s > 0);
        if (specs.length > 0) {
          const specCounts = {};
          let maxCount = 0;
          for (const s of specs) {
            specCounts[s] = (specCounts[s] || 0) + 1;
            if (specCounts[s] > maxCount) {
              maxCount = specCounts[s];
              targetEngineerUsage = s;
            }
          }
        }
        if (!targetEngineerUsage || targetEngineerUsage <= 0) {
          targetEngineerUsage = stats.pRecords[0]?.masterUsagePcs || 0;
        }

        const clusters = sortClusters(getClusters(d_usages, bestEps), targetEngineerUsage);
        const bestCluster = clusters[0];
        const minVal = bestCluster[0];
        const maxVal = bestCluster[bestCluster.length - 1];
        
        dbscanFiltered = iqrFiltered.filter(r => r.total_usage >= minVal && r.total_usage <= maxVal);
      }
      allCleanRecords.push(...dbscanFiltered);
  }
  return allCleanRecords;
};

exports.getToolingUsageParameters = async (req, res) => {
  try {
    const { poolPbgm8gPromise, poolPromise } = require("../config/database");
    const pool = await poolPbgm8gPromise;
    if (!pool) return res.status(500).json({ error: "Cannot connect to production database." });
    const poolMaster = await poolPromise; // db_Tooling

    // Master Specs
    const masterMap = new Map();
    const partSpecMap = new Map();
    try {
      const qMaster = "SELECT ItemNo, PartNo, Usage_pcs FROM [db_Tooling].[dbo].[PartItem] WHERE Usage_pcs > 0";
      const resMaster = await poolMaster.request().query(qMaster);
      for (const row of resMaster.recordset) {
        if (row.ItemNo) {
          const itemKey = row.ItemNo.trim().toUpperCase();
          if (!masterMap.has(itemKey) || row.Usage_pcs > masterMap.get(itemKey)) {
            masterMap.set(itemKey, row.Usage_pcs);
          }
          if (row.PartNo) {
            const partKey = `${itemKey}___${row.PartNo.trim().toUpperCase()}`;
            if (!partSpecMap.has(partKey) || row.Usage_pcs > partSpecMap.get(partKey)) {
              partSpecMap.set(partKey, row.Usage_pcs);
            }
          }
        }
      }
    } catch(e) {}

    // Phase 0: Fetch raw data
    const query = `
      SELECT 
        tooling_code,
        part_name,
        CONVERT(varchar(7), date_input, 120) as year_month,
        total_usage,
        usage_percentage,
        LOWER(tooling_status) as tooling_status
      FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_usage_monthly]
      WHERE tooling_code IS NOT NULL AND division = 'PMC'
    `;
    const result = await pool.request().query(query);
    const rawData = result.recordset;

    // Group by tooling_code
    const toolMap = new Map();
    for (const row of rawData) {
      if (!row.tooling_code) continue;
      const tc = row.tooling_code.trim().toUpperCase();
      if (!toolMap.has(tc)) {
        toolMap.set(tc, []);
      }
      
      const pn = (row.part_name || '').trim().toUpperCase();
      const masterUsagePcs = partSpecMap.get(`${tc}___${pn}`) || masterMap.get(tc) || 0;
      row.masterUsagePcs = masterUsagePcs;
      row.ratio = masterUsagePcs > 0 ? (row.total_usage / masterUsagePcs) : (row.usage_percentage != null && row.usage_percentage > 0 ? (row.usage_percentage / 100) : 1.0);
      
      toolMap.get(tc).push(row);
    }

    const finalResult = [];

    for (const [tooling_code, records] of toolMap.entries()) {
      if (records.length === 0) continue;

      const brokenCount = records.filter(r => r.tooling_status === 'broken').length;
      const brokenRate = records.length > 0 ? (brokenCount / records.length) * 100 : 0;
      const isBroken100 = records.length > 0 && brokenCount === records.length;
      const isHighBroken = brokenRate > 50;

      let cleanDataAll = [];
      let validDataForLogic = [];
      if (isBroken100) {
        cleanDataAll = records;
        validDataForLogic = records;
      } else {
        const validData = records.filter(r => r.ratio <= 2.0);
        if (validData.length > 0) {
           cleanDataAll = filterCleanData(validData);
           validDataForLogic = validData;
        }
      }

      if (cleanDataAll.length === 0) continue;

      // Base Master
      const fallbackSpecs = cleanDataAll.map(r => r.ratio > 0 ? Math.round(r.total_usage / r.ratio) : 0).filter(s => s > 0);
      let fallbackEngineerUsage = 0;
      if (fallbackSpecs.length > 0) {
        const specCounts = {};
        let maxCount = 0;
        for (const s of fallbackSpecs) {
          specCounts[s] = (specCounts[s] || 0) + 1;
          if (specCounts[s] > maxCount) { maxCount = specCounts[s]; fallbackEngineerUsage = s; }
        }
      }
      
      const masterPcs = records[0].masterUsagePcs;
      const engineerUsage = masterPcs > 0 ? masterPcs : fallbackEngineerUsage;

      // Mean Ratio & Avg Usage
      let avgUsage = 0;
      let achieveRate = 100;
      let advanceAchieveRate = 100;

      if (isBroken100) {
        avgUsage = engineerUsage;
        achieveRate = 100;
        advanceAchieveRate = 100;
      } else {
        const sumRatioAll = cleanDataAll.reduce((acc, r) => acc + r.ratio, 0);
        const meanRatioAll = sumRatioAll / cleanDataAll.length;
        avgUsage = engineerUsage > 0 ? Math.round(meanRatioAll * engineerUsage) : Math.round(cleanDataAll.reduce((a,b)=>a+b.total_usage,0)/cleanDataAll.length);
        achieveRate = meanRatioAll * 100;
      }

      // Advance A given B -> Advance Achieve Rate = P(B) * Achieve Rate
      const usageBurrCount = validDataForLogic.filter(r => r.tooling_status === 'usage' || r.tooling_status === 'burr').length;
      const pB = validDataForLogic.length > 0 ? (usageBurrCount / validDataForLogic.length) : 0;

      if (!isBroken100) {
        advanceAchieveRate = Math.round((pB * achieveRate) * 100) / 100;
      }

      // Pre-group validDataForLogic by part_name for O(1) P(B) and Broken tracking
      const partValidMap = new Map();
      for (const r of validDataForLogic) {
         if (!r.part_name) continue;
         let g = partValidMap.get(r.part_name);
         if (!g) {
            g = { total: 0, usageBurr: 0, broken: 0, masterUsagePcs: r.masterUsagePcs || 0 };
            partValidMap.set(r.part_name, g);
         }
         g.total++;
         if (r.tooling_status === 'usage' || r.tooling_status === 'burr') {
            g.usageBurr++;
         }
         if (r.tooling_status === 'broken') {
            g.broken++;
         }
      }

      const partAvgMap = {};
      const partGroups = new Map();
      for (const r of cleanDataAll) {
         if (!r.part_name) continue;
         if (!partGroups.has(r.part_name)) partGroups.set(r.part_name, []);
         partGroups.get(r.part_name).push(r);
      }
      for (const [pName, pRecords] of partGroups.entries()) {
         const pStat = partValidMap.get(pName);
         const pTotal = pStat ? pStat.total : pRecords.length;
         const pBrokenCount = pStat ? pStat.broken : pRecords.filter(r => r.tooling_status === 'broken').length;
         const pBrokenRate = pTotal > 0 ? (pBrokenCount / pTotal) * 100 : 0;
         const pIsBroken100 = pTotal > 0 && pBrokenCount === pTotal;
         const pAlert = (pBrokenRate > 50); // แสดง badge warning ไว้เหมือนเดิมเมื่อแตกหัก > 50%
         
         let pAvg = null;
         let pAdvanceAchieveRate = null;

         const pPartSpec = (pRecords[0]?.masterUsagePcs) || (pStat?.masterUsagePcs) || 0;
         const targetPartSpec = pPartSpec > 0 ? pPartSpec : fallbackEngineerUsage;

         // Part-level P(B) in O(1)
         const pPartPB = (pStat && pStat.total > 0) ? (pStat.usageBurr / pStat.total) : pB;

         if (pIsBroken100) {
             pAvg = targetPartSpec;
             pAdvanceAchieveRate = 100;
         } else {
              // If broken > 10% of total records for that part, include broken records in the calculation; otherwise exclude them
              const finalPRecords = (pBrokenRate > 10) ? pRecords : pRecords.filter(r => r.tooling_status !== 'broken');

             let pPartAchieveRate = 100;
             if (finalPRecords.length > 0) {
                 const pMeanRatio = finalPRecords.reduce((a,b)=>a+b.ratio, 0) / finalPRecords.length;
                 pAvg = targetPartSpec > 0 ? Math.round(pMeanRatio * targetPartSpec) : Math.round(finalPRecords.reduce((a,b)=>a+b.total_usage, 0) / finalPRecords.length);
                 pPartAchieveRate = pMeanRatio * 100;
             } else {
                 pAvg = targetPartSpec;
                 pPartAchieveRate = 100;
             }

             // Part-level Advance Achieve Rate = P(B) * Achieve Rate
             pAdvanceAchieveRate = Math.round((pPartPB * pPartAchieveRate) * 100) / 100;
         }

         partAvgMap[pName] = { 
             avg: pAvg, 
             alert: pAlert, 
             brokenRate: Math.round(pBrokenRate),
             isBroken100: pIsBroken100,
             pB: Math.round(pPartPB * 10000) / 10000,
             advanceAchieveRate: pAdvanceAchieveRate
         };
      }

      // Also ensure any other parts from partValidMap get their own P(B) and brokenRate/alert
      for (const [pName, pStat] of partValidMap.entries()) {
         if (!partAvgMap[pName]) {
             const pBrokenRate = pStat.total > 0 ? (pStat.broken / pStat.total) * 100 : 0;
             const pIsBroken100 = pStat.total > 0 && pStat.broken === pStat.total;
             const pTargetSpec = pStat.masterUsagePcs > 0 ? pStat.masterUsagePcs : fallbackEngineerUsage;
             const pFallbackPB = pStat.total > 0 ? Math.round((pStat.usageBurr / pStat.total) * 10000) / 10000 : Math.round(pB * 10000) / 10000;
             partAvgMap[pName] = {
                 avg: pIsBroken100 ? pTargetSpec : null,
                 alert: pBrokenRate > 50,
                 brokenRate: Math.round(pBrokenRate),
                 isBroken100: pIsBroken100,
                 pB: pFallbackPB,
                 advanceAchieveRate: pIsBroken100 ? 100 : Math.round((pFallbackPB * 100) * 100) / 100
             };
         }
      }

      finalResult.push({
        itemNo: tooling_code,
        avgUsage: avgUsage,
        partAvgUsage: partAvgMap,
        achieveRate: Math.round(achieveRate * 100) / 100,
        advanceAchieveRate: Math.round(advanceAchieveRate * 100) / 100,
        pB: Math.round(pB * 10000) / 10000,
        crn: engineerUsage,
        brokenAlert: isHighBroken || isBroken100,
        isBroken100: isBroken100,
        brokenRate: Math.round(brokenRate)
      });
    }

    res.status(200).json(finalResult);

  } catch (err) {
    console.error("getToolingUsageParameters Error:", err);
    res.status(500).json({ error: err.message });
  }
};
exports.getForecastBalance = async (req, res) => {
  try {
    const { month, year, revision } = req.query;
    const { poolForecastProjectPromise } = require('../config/database');
    const pool = await poolForecastProjectPromise;
    if (!pool) return res.status(500).json({ error: 'Cannot connect to ForecastProject DB' });
    
    // Query by exact month/year. Since revision might be different, we get the latest revision if not passed, or just the one matching.
    let query = `SELECT ItemNo, EndStock FROM dbo.tb_Forecast_Balance WHERE PlanYear = @year AND PlanMonth = @month`;
    
    const request = pool.request()
      .input('year', require('mssql').VarChar, year)
      .input('month', require('mssql').VarChar, month);

    if (revision) {
        query += ` AND Revision = @revision`;
        request.input('revision', require('mssql').NVarChar, revision);
    } else {
        // Get max revision if not specified
        query = `          SELECT b.ItemNo, b.EndStock 
          FROM dbo.tb_Forecast_Balance b
          INNER JOIN (
            SELECT ItemNo, MAX(Revision) as MaxRev
            FROM dbo.tb_Forecast_Balance
            WHERE PlanYear = @year AND PlanMonth = @month
            GROUP BY ItemNo
          ) max_rev ON b.ItemNo = max_rev.ItemNo AND b.Revision = max_rev.MaxRev
          WHERE b.PlanYear = @year AND b.PlanMonth = @month
        `;
    }

    const result = await request.query(query);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error('getForecastBalance Error:', err);
    res.status(500).json({ error: err.message });
  }
};


exports.saveForecastBalance = async (req, res) => {
  try {
    const { month, year, revision, data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "data must be an array" });
    }
    if (!month || !year || !revision) {
      return res.status(400).json({ error: "Month, Year, and Revision are required" });
    }

    const { poolForecastProjectPromise } = require("../config/database");
    const pool = await poolForecastProjectPromise;
    if (!pool) {
      return res.status(500).json({ error: "Cannot connect to ForecastProject DB on PBGM8G" });
    }

    const sql = require("mssql");
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const row of data) {
        const reqDb = new sql.Request(transaction);
        await reqDb
          .input('ItemNo', sql.NVarChar(50), row.itemNo || row.ItemNo || '')
          .input('PlanYear', sql.VarChar(10), year)
          .input('PlanMonth', sql.VarChar(10), month)
          .input('Revision', sql.NVarChar(20), revision)
          .input('EndStock', sql.Float, parseFloat(row.end) || 0)
          .input('CurrentStock', sql.Float, parseFloat(row.currentStock) || 0)
          .query(`
            IF EXISTS (SELECT 1 FROM dbo.tb_Forecast_Balance WHERE ItemNo=@ItemNo AND PlanYear=@PlanYear AND PlanMonth=@PlanMonth AND Revision=@Revision)
                UPDATE dbo.tb_Forecast_Balance 
                SET EndStock=@EndStock, CurrentStock=@CurrentStock, UpdatedAt=GETDATE()
                WHERE ItemNo=@ItemNo AND PlanYear=@PlanYear AND PlanMonth=@PlanMonth AND Revision=@Revision
            ELSE
                INSERT INTO dbo.tb_Forecast_Balance (ItemNo, PlanYear, PlanMonth, Revision, EndStock, CurrentStock, UpdatedAt)
                VALUES (@ItemNo, @PlanYear, @PlanMonth, @Revision, @EndStock, @CurrentStock, GETDATE())
          `);
      }
      await transaction.commit();
      res.status(200).json({ success: true, count: data.length });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('saveForecastBalance Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getToolingUsageAudit = async (req, res) => {
  try {
    const { toolingCode } = req.params;
    if (!toolingCode) return res.status(400).json({ error: "Missing toolingCode" });

    const { poolPbgm8gPromise, poolPromise } = require("../config/database");
    
    // 1. Get Master Usage from db_Tooling
    const poolMaster = await poolPromise;
    let masterUsagePcs = 0;
    const partSpecAuditMap = new Map();
    try {
      const qMaster = "SELECT PartNo, Usage_pcs FROM [db_Tooling].[dbo].[PartItem] WHERE ItemNo = @ItemNo AND Usage_pcs > 0";
      const resMaster = await poolMaster.request().input('ItemNo', toolingCode).query(qMaster);
      for (const row of resMaster.recordset) {
        if (row.Usage_pcs > masterUsagePcs) masterUsagePcs = row.Usage_pcs;
        if (row.PartNo) {
          const pn = row.PartNo.trim().toUpperCase();
          if (!partSpecAuditMap.has(pn) || row.Usage_pcs > partSpecAuditMap.get(pn)) {
            partSpecAuditMap.set(pn, row.Usage_pcs);
          }
        }
      }
    } catch(e) {}

    // 2. Get Actual Usage from production db
    const pool = await poolPbgm8gPromise;
    if (!pool) return res.status(500).json({ error: "Cannot connect to database." });

    const query = `
      SELECT 
        tooling_code,
        part_name,
        CONVERT(varchar(7), date_input, 120) as year_month,
        total_usage,
        usage_percentage,
        LOWER(tooling_status) as tooling_status
      FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_usage_monthly]
      WHERE tooling_code = @toolingCode 
        AND division = 'PMC'
    `;
    
    const result = await pool.request()
      .input('toolingCode', toolingCode)
      .query(query.replace(/`/g, '`'));
    const records = result.recordset;

    if (!records || records.length === 0) {
      return res.status(200).json({ records: [], summary: { 
        totalRecords: 0, includedCount: 0, excludedCount: 0, finalAvgUsage: 0, masterUsagePcs, ratio: 0, 
        variancePercent: 0, pB: 1, usageCaseCount: 0, advanceAchieveRate: 0 
      } });
    }

    records.forEach(r => {
      r._id = Math.random().toString(36).substring(7);
      r.isExcluded = false;
      r.exclusionReason = "";
      const pn = (r.part_name || '').trim().toUpperCase();
      const partSpec = partSpecAuditMap.get(pn) || masterUsagePcs || 0;
      r.masterUsagePcs = partSpec;
      r.ratio = partSpec > 0 ? (r.total_usage / partSpec) : (r.usage_percentage != null && r.usage_percentage > 0 ? (r.usage_percentage / 100) : 1.0);
    });

    const validData = records;
    validData.forEach(r => {
      if (r.ratio > 2.0) {
        r.isExcluded = true;
        r.exclusionReason = "ค่า Ratio สูงเกิน 2.0 (Human Error)";
      } else if (r.masterUsagePcs > 100 && r.total_usage <= 10) {
        r.isExcluded = true;
        r.exclusionReason = "ข้อมูลเบิกผิดปกติ / ทดสอบระบบ (<= 10 pcs)";
      } else if (r.total_usage <= 2) {
        r.isExcluded = true;
        r.exclusionReason = "ข้อมูลเบิกผิดปกติ / ทดสอบระบบ (<= 2 pcs)";
      }
    });
    
    const validDataForLogic = validData.filter(r => !r.isExcluded);
    
    // Group by part_name
    const partMap = new Map();
    for (const r of validDataForLogic) {
        const pn = r.part_name || 'UNKNOWN';
        if (!partMap.has(pn)) partMap.set(pn, []);
        partMap.get(pn).push(r);
    }

    let totalRelativeIqr = 0;
    let validPartCount = 0;
    const partStats = [];

    for (const [pName, pRecords] of partMap.entries()) {
      const pTotal = pRecords.length;
      const pBrokenCount = pRecords.filter(r => r.tooling_status === 'broken').length;
      const pBrokenRate = pTotal > 0 ? (pBrokenCount / pTotal) * 100 : 0;
      const pIsBroken100 = pTotal > 0 && pBrokenCount === pTotal;

      if (pIsBroken100) {
        partStats.push({ pName, pRecords, iqr: 0, median: 0, rIqr: 0, smallData: true });
        continue;
      }

      // If broken > 10%, calculate ALL records without outlier filtering
      if (pBrokenRate > 10) {
        partStats.push({ pName, pRecords, iqr: 0, median: 0, rIqr: 0, smallData: true });
        continue;
      }

      // If broken <= 10%, exclude broken records.
      if (pBrokenRate <= 10) {
        pRecords.forEach(r => {
          if (r.tooling_status === 'broken') {
            r.isExcluded = true;
            r.exclusionReason = "สถานะเครื่องมือแตกหัก (Broken <= 10%)";
          }
        });
      }

      const pRecordsClean = pRecords.filter(r => !r.isExcluded);
      if (pRecordsClean.length === 0) continue;

      if (pRecordsClean.length < 3) {
        partStats.push({ pName, pRecords: pRecordsClean, iqr: 0, median: 0, rIqr: 0, smallData: true });
        continue;
      }
      const usages = pRecordsClean.map(r => r.total_usage).sort((a,b) => a-b);
      const q1 = usages[Math.floor(usages.length * 0.25)];
      const q3 = usages[Math.floor(usages.length * 0.75)];
      const iqr = q3 - q1;
      const mid = Math.floor(usages.length / 2);
      const median = usages.length % 2 !== 0 ? usages[mid] : (usages[mid-1] + usages[mid]) / 2;
      
      let rIqr = 0;
      if (median > 0 && iqr > 0) {
        rIqr = iqr / median;
        totalRelativeIqr += rIqr;
        validPartCount++;
      }
      partStats.push({ pName, pRecords: pRecordsClean, iqr, median, q1, q3, smallData: false });
    }

    const globalRIqr = validPartCount > 0 ? (totalRelativeIqr / validPartCount) : 0.20; 
    let allCleanRecords = [];

    for (const stats of partStats) {
      if (stats.smallData) {
        allCleanRecords.push(...stats.pRecords);
        continue;
      }
      
      let finalIqr = stats.iqr;
      if (finalIqr === 0) finalIqr = stats.median * globalRIqr;
      
      const lower = Math.max(0, stats.q1 - (1.5 * finalIqr));
      const upper = stats.q3 + (1.5 * finalIqr);
      
      stats.pRecords.forEach(r => {
        if (r.total_usage < lower) {
          r.isExcluded = true;
          r.exclusionReason = "หลุดกรอบล่าง (IQR)";
        } else if (r.total_usage > upper) {
          r.isExcluded = true;
          r.exclusionReason = "หลุดกรอบบน (IQR)";
        }
      });
      
      let iqrFiltered = stats.pRecords.filter(r => !r.isExcluded);
      if (iqrFiltered.length === 0) iqrFiltered = stats.pRecords; // Fallback
      
      if (iqrFiltered.length >= 3) {
        // Helper inline
        const d_usages = iqrFiltered.map(r => r.total_usage).sort((a,b) => a-b);
        const d_mid = Math.floor(d_usages.length / 2);
        const d_median = d_usages.length % 2 !== 0 ? d_usages[d_mid] : (d_usages[d_mid-1] + d_usages[d_mid]) / 2;
        let bestEps = Math.max(2, d_median * 0.20);
        
        let targetEngineerUsage = 0;
        const specs = stats.pRecords.map(r => r.ratio > 0 ? Math.round(r.total_usage / r.ratio) : 0).filter(s => s > 0);
        if (specs.length > 0) {
          const specCounts = {};
          let maxCount = 0;
          for (const s of specs) {
            specCounts[s] = (specCounts[s] || 0) + 1;
            if (specCounts[s] > maxCount) {
              maxCount = specCounts[s];
              targetEngineerUsage = s;
            }
          }
        }
        if (!targetEngineerUsage || targetEngineerUsage <= 0) {
          targetEngineerUsage = masterUsagePcs || 0;
        }

        const clusters = sortClusters(getClusters(d_usages, bestEps), targetEngineerUsage);
        const bestCluster = clusters[0];
        const minVal = bestCluster[0];
        const maxVal = bestCluster[bestCluster.length - 1];
        
        stats.pRecords.forEach(r => {
          if (!r.isExcluded && (r.total_usage < minVal || r.total_usage > maxVal)) {
            r.isExcluded = true;
            r.exclusionReason = "หลุดกลุ่มฐานนิยม (DBSCAN)";
          }
        });
      }
      allCleanRecords.push(...stats.pRecords.filter(r => !r.isExcluded));
    }

    const cleanDataAll = allCleanRecords;

    let engineerUsage = masterUsagePcs;
    const specs = cleanDataAll.map(r => r.ratio > 0 ? Math.round(r.total_usage / r.ratio) : 0).filter(s => s > 0);
    if (specs.length > 0) {
      const specCounts = {};
      let maxCount = 0;
      for (const s of specs) {
        specCounts[s] = (specCounts[s] || 0) + 1;
        if (specCounts[s] > maxCount) {
          maxCount = specCounts[s];
          engineerUsage = s;
        }
      }
    }

    const brokenCount = validDataForLogic.filter(r => r.tooling_status === 'broken').length;
    const brokenRate = validDataForLogic.length > 0 ? (brokenCount / validDataForLogic.length) * 100 : 0;
    const isBroken100 = validDataForLogic.length > 0 && brokenCount === validDataForLogic.length;

    let finalAvgUsage = 0;
    let achieveRate = 100;
    let advanceAchieveRate = 100;

    if (isBroken100) {
      finalAvgUsage = engineerUsage;
      achieveRate = 100;
      advanceAchieveRate = 100;
    } else {
      const sumRatioAll = cleanDataAll.reduce((acc, r) => acc + r.ratio, 0);
      const meanRatioAll = cleanDataAll.length > 0 ? sumRatioAll / cleanDataAll.length : 0;
      finalAvgUsage = engineerUsage > 0 ? Math.round(meanRatioAll * engineerUsage) : 0;
      achieveRate = meanRatioAll * 100;
    }

    const usageBurrCount = validDataForLogic.filter(r => r.tooling_status === 'usage' || r.tooling_status === 'burr').length;
    const pB = validDataForLogic.length > 0 ? (usageBurrCount / validDataForLogic.length) : 1.0;

    if (!isBroken100) {
      advanceAchieveRate = Math.round((pB * achieveRate) * 100) / 100;
    }

    const summary = {
      totalRecords: validDataForLogic.length,
      includedCount: cleanDataAll.length,
      excludedCount: records.length - cleanDataAll.length,
      finalAvgUsage: finalAvgUsage,
      masterUsagePcs: engineerUsage,
      ratio: achieveRate / 100,
      variancePercent: engineerUsage > 0 ? ((finalAvgUsage - engineerUsage) / engineerUsage) * 100 : 0,
      pB: pB,
      usageCaseCount: usageBurrCount,
      advanceAchieveRate: advanceAchieveRate,
      brokenRate: Math.round(brokenRate),
      isBroken100: isBroken100
    };

    res.status(200).json({ records: records, summary });
  } catch (error) {
    console.error("API Audit Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getDailyIssue = async (req, res) => {
  try {
    const { year, month } = req.query;
    let yearMonth = '';
    if (year && month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      let mInt = monthNames.findIndex(m => m.toLowerCase() === String(month).toLowerCase()) + 1;
      if (mInt === 0) {
        mInt = parseInt(month, 10);
      }
      if (mInt > 0) {
        yearMonth = `${year}${String(mInt).padStart(2, '0')}`;
      }
    }

    if (!yearMonth) {
      const now = new Date();
      yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const pool8g = await poolPbgm8gPromise;
    if (!pool8g) {
      return res.status(500).json({ error: "Cannot connect to PBGM8G database" });
    }

    const request = pool8g.request();
    request.input('YearMonth', sql.NVarChar, yearMonth);
    const query = `
      IF EXISTS (
        SELECT 1 FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_stock_summary_daily]
        WHERE year_month = @YearMonth
      )
      BEGIN
        WITH LatestSnapshot AS (
          SELECT MAX(download_date) as max_date
          FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_stock_summary_daily]
          WHERE year_month = @YearMonth
        )
        SELECT 
          UPPER(LTRIM(RTRIM(s.item_no))) as item_no,
          SUM(ISNULL(s.issued_qty, 0)) as issue_qty,
          MAX(s.download_date) as issue_date,
          MAX(s.download_date) as last_trans_date,
          MAX(s.download_date) as download_date
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_stock_summary_daily] s
        JOIN LatestSnapshot ls ON s.download_date = ls.max_date
        WHERE s.year_month = @YearMonth
        GROUP BY UPPER(LTRIM(RTRIM(s.item_no)));
      END
      ELSE
      BEGIN
        SELECT 
          UPPER(LTRIM(RTRIM(item_no))) as item_no,
          SUM(quantity) as issue_qty,
          MAX(date_downloaded) as issue_date,
          MAX(transaction_date) as last_trans_date,
          MAX(date_downloaded) as download_date
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_factory_supply_expense_daily]
        WHERE division = 'DZ' AND year_month = @YearMonth
        GROUP BY UPPER(LTRIM(RTRIM(item_no)));
      END
    `;
    const result = await request.query(query);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getDailyIssue Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.clearStockCache = () => {
  cachedStockData = null;
  lastStockFetch = 0;
  console.log("[Stock] Cache cleared by AutoloadWatcher");
};

exports.getAutoloadStatus = (req, res) => {
  try {
    const autoloadWatcher = require('../services/autoloadWatcher.service');
    const status = autoloadWatcher.getStatus();
    res.status(200).json(status);
  } catch (err) {
    console.error("getAutoloadStatus Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCuttingToolsStockSummary = async (req, res) => {
  try {
    const { year, month } = req.query;
    let yearMonth = '';
    if (year && month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      let mInt = monthNames.findIndex(m => m.toLowerCase() === String(month).toLowerCase()) + 1;
      if (mInt === 0) {
        mInt = parseInt(month, 10);
      }
      if (mInt > 0) {
        yearMonth = `${year}${String(mInt).padStart(2, '0')}`;
      }
    }

    if (!yearMonth) {
      const now = new Date();
      yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const pool8g = await poolPbgm8gPromise;
    if (!pool8g) {
      return res.status(500).json({ error: "Cannot connect to PBGM8G database" });
    }

    const request = pool8g.request();
    request.input('YearMonth', yearMonth);
    const query = `
      WITH TargetSnapshot AS (
        SELECT MAX(download_date) as max_date
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_stock_summary_daily]
        WHERE year_month = @YearMonth
      )
      SELECT 
        UPPER(LTRIM(RTRIM(s.item_no))) as item_no,
        SUM(s.beginning_qty) as beginning_qty,
        SUM(s.received_qty) as received_qty,
        SUM(s.received_amount) as received_amount,
        SUM(s.issued_qty) as issued_qty,
        SUM(s.issued_amount) as issued_amount,
        SUM(s.closing_qty) as closing_qty,
        SUM(s.closing_amount) as closing_amount,
        MAX(s.download_date) as download_date
      FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_stock_summary_daily] s
      JOIN TargetSnapshot ts ON s.download_date = ts.max_date
      WHERE s.year_month = @YearMonth
      GROUP BY UPPER(LTRIM(RTRIM(s.item_no)))
    `;
    const result = await request.query(query);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getCuttingToolsStockSummary Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCuttingToolsInventoryDaily = async (req, res) => {
  try {
    const { year, month } = req.query;
    let yearMonth = '';
    if (year && month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      let mInt = monthNames.findIndex(m => m.toLowerCase() === String(month).toLowerCase()) + 1;
      if (mInt === 0) {
        mInt = parseInt(month, 10);
      }
      if (mInt > 0) {
        yearMonth = `${year}${String(mInt).padStart(2, '0')}`;
      }
    }

    if (!yearMonth) {
      const now = new Date();
      yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const pool8g = await poolPbgm8gPromise;
    if (!pool8g) {
      return res.status(500).json({ error: "Cannot connect to PBGM8G database" });
    }

    const request = pool8g.request();
    request.input('YearMonth', yearMonth);
    const query = `
      WITH TargetSnapshot AS (
        SELECT MAX(date_downloaded) as max_date
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_inventory_daily]
        WHERE year_month = @YearMonth
      )
      SELECT 
        UPPER(LTRIM(RTRIM(d.tooling_name))) as item_no,
        SUM(d.tooling_qty) as tooling_qty,
        MAX(d.date_downloaded) as date_downloaded,
        MAX(d.loaded_at) as loaded_at
      FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_inventory_daily] d
      JOIN TargetSnapshot ts ON d.date_downloaded = ts.max_date
      WHERE d.year_month = @YearMonth
      GROUP BY UPPER(LTRIM(RTRIM(d.tooling_name)))
    `;
    const result = await request.query(query);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getCuttingToolsInventoryDaily Error:", err);
    res.status(500).json({ error: err.message });
  }
};


