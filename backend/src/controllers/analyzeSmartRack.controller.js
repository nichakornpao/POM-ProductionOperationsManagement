const { poolPromise } = require("../config/database");
const Type = require("mssql").TYPES;
const sql = require("mssql");


/**
 * @api {GET} /AnalyzeSmartRack
 * @description ดึงข้อมูล SmartRack ทั้งหมด
 * @uses SP: trans.Stored_Get_SmartRack
 */
exports.getdatasmartrack = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .execute('trans.Stored_Get_SmartRack');

    res.json(result.recordset);
  }
  catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};