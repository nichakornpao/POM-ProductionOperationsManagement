const { poolPromise } = require("../config/database");
const Type = require("mssql").TYPES;
const sql = require("mssql");

/**
 * @api {GET} /Purchase_Request
 * @description ดึงข้อมูลรายการขอเบิก Cutting Tool + Setup Tool รวมกัน เรียงตามวันที่ล่าสุด
 * @uses SP: trans.Stored_Get_PurchaseRequest (returns 2 recordsets)
 */
exports.Purchase_Request = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .execute('trans.Stored_Get_PurchaseRequest');

    // SP returns 2 recordsets: [0] = Cutting, [1] = Setup
    const combined = [...result.recordsets[0], ...result.recordsets[1]];

    // เรียงลำดับตามวันที่ (ล่าสุดขึ้นก่อน)
    combined.sort((a, b) => {
      const dateA = a.DateTime_Record ? new Date(a.DateTime_Record) : new Date(0);
      const dateB = b.DateTime_Record ? new Date(b.DateTime_Record) : new Date(0);
      return dateB - dateA;
    });

    res.json(combined);
  }
  catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
