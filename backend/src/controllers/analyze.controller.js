const { poolPromise } = require("../config/database");
const Type = require("mssql").TYPES;
const sql = require("mssql");


/**
 * API: ดึงข้อมูลการวิเคราะห์ค่าใช้จ่ายทั้งหมด (All Cost Analyze Data)
 * หน้าที่: ดึงข้อมูลสรุปค่าใช้จ่ายการเบิกจ่าย Tooling ของทุกแผนกจาก View_Cost_Analyze_Complete
 * เพื่อนำไปแสดงผลในหน้า Dashboard หรือ Export ข้อมูล
 * @uses SP: trans.Stored_Get_Cost_Analyze
 */
exports.getdataall = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    request.stream = true;
    res.setHeader('Content-Type', 'application/json');
    res.write('[');
    let isFirst = true;

    request.on('row', row => {
      if (!isFirst) res.write(',');
      res.write(JSON.stringify(row));
      isFirst = false;
    });

    request.on('done', () => {
      res.write(']');
      res.end();
    });

    request.on('error', err => {
      console.error("Stream error in getdataall:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error", details: err.message });
      } else {
        res.end();
      }
    });

    request.execute('trans.Stored_Get_Cost_Analyze');
  }
  catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ดึงข้อมูลสำหรับหน้า Cost Analyze
 * หน้าที่: ดึงข้อมูลสรุปค่าใช้จ่ายจาก View_Cost_Analyze_Complete เพื่อนำไปแสดงผลเป็นกราฟ
 * และตารางสรุปในหน้าจอ Cost Analyze โดยเฉพาะ
 * @uses SP: trans.Stored_Get_Cost_Analyze
 */
exports.getcostanalyze = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    request.stream = true;
    res.setHeader('Content-Type', 'application/json');
    res.write('[');
    let isFirst = true;

    request.on('row', row => {
      if (!isFirst) res.write(',');
      res.write(JSON.stringify(row));
      isFirst = false;
    });

    request.on('done', () => {
      res.write(']');
      res.end();
    });

    request.on('error', err => {
      console.error("Stream error in getcostanalyze:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error", details: err.message });
      } else {
        res.end();
      }
    });

    request.execute('trans.Stored_Get_Cost_Analyze');
  }
  catch (error) {
    console.error("Error executing Cost Analyze query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
