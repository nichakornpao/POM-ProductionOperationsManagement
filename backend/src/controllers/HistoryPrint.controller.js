const sql = require("mssql");
const { poolPromise } = require("../config/database");

/**
 * API: บันทึกข้อมูลประวัติการพิมพ์เอกสาร (Save History Print)
 * หน้าที่: บันทึกข้อมูลว่าพนักงานคนไหน (EmployeeID) พิมพ์เอกสารเบิกแผนกอะไร (Division) 
 * เลขที่เอกสาร (DocNo), พาร์ท (PratNo), วันที่ครบกำหนด (DueDate), ประเภทการพิมพ์และจำนวนไปกี่แผ่น
 * (ข้อมูลจะถูกบันทึกผ่าน Stored Procedure: stored_Master_HistoryPrint_Insert)
 */
exports.SaveHistoryPrint = async (req, res) => {
  try {
    const { EmployeeID, Division, DocNo, PratNo, DueDate, TypePrint, Total } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input('EmployeeID', sql.NVarChar, EmployeeID) // ใช้ค่าจาก req.body
      .input('Division', sql.NVarChar, Division)
      .input('DocNo', sql.NVarChar, DocNo)
      .input('PratNo', sql.NVarChar, PratNo)
      .input('DueDate', sql.Date, DueDate)
      .input('TypePrint', sql.NVarChar, TypePrint)
      .input('Total', sql.Int, Total)
      .execute('stored_Master_HistoryPrint_Insert');

    res.json({ success: true, message: "บันทึกประวัติการพิมพ์สำเร็จ" });
  } catch (err) {
    console.error("Error SaveHistoryPrint:", err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};



/**
 * API: ดึงรายชื่อพนักงานที่มีสิทธิ์พิมพ์ (Get Employee Print Permission List)
 * หน้าที่: ค้นหาว่าในระบบมีพนักงาน (Employee_ID) คนไหนบ้างที่ได้รับอนุญาตให้กดปุ่ม Print ได้ 
 * @uses SP: trans.Stored_Get_EmpPermissionPrint
 */
exports.EmpPrint = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .execute('trans.Stored_Get_EmpPermissionPrint');

    res.json(result.recordset);
  } catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ตรวจสอบสิทธิ์การพิมพ์ของพนักงานรายบุคคล (Check Print Permission)
 * หน้าที่: รับไอดีพนักงาน (Employee_ID) มาเช็คตรงๆ ว่ามีสิทธิ์พิมพ์หรือไม่
 * @uses SP: trans.Stored_Check_PrintPermission
 */
exports.checkPrintPermission = async (req, res) => {
  try {
    const { Employee_ID } = req.query;
    if (!Employee_ID) return res.status(400).json({ error: 'Employee_ID required' });

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('Employee_ID', sql.NVarChar, Employee_ID)
      .execute('trans.Stored_Check_PrintPermission');

    const allowed = result.recordset[0].count > 0;
    res.json({ allowed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * API: ดึงข้อมูลประวัติการพิมพ์ทั้งหมด (Get All History Print)
 * หน้าที่: ดึงข้อมูลดิบประวัติการปริ้นต์จากตาราง tb_Cuttingtool_HistoryPrint ทั้งหมด 
 * @uses SP: trans.Stored_Get_HistoryPrint
 */
exports.HistoryPrint = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .execute('trans.Stored_Get_HistoryPrint');

    res.json(result.recordset);
  } catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};