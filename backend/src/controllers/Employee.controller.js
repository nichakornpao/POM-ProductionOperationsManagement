const { poolPromise } = require("../config/database");
const sql = require('mssql');

/**
 * API: ดึงรายชื่อพนักงานทั้งหมด (Get All Employees)
 * หน้าที่: ดึงข้อมูลพนักงานทั้งหมดจาก View_CuttingTool_Employee เพื่อแสดงในหน้าจัดการผู้ใช้งาน
 * @uses SP: trans.Stored_Get_AllEmployees
 */
exports.ShowUser = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    // Automatically refresh the View metadata to ensure the new Subscription column is loaded
    try {
      await pool.query("EXEC sp_refreshview '[dbo].[View_CuttingTool_Employee]'");
    } catch (refreshErr) {
      console.warn('Warning: Could not refresh View_CuttingTool_Employee:', refreshErr.message);
    }

    const result = await pool
      .request()
      .execute('trans.Stored_Get_AllEmployees');
    res.json(result.recordset);
  } catch (err) {
    console.error(' Error GetEmployee:', err);
    res.status(500).json({ error: 'Cant get Employee data' });
  }
};

/**
 * API: เพิ่มผู้ใช้งานใหม่ (Add New Employee)
 * หน้าที่: รับข้อมูลจากฟอร์มหน้าเว็บ (รหัสพนักงาน, ชื่อ, Username, Password, บทบาท, อีเมล)
 * เพื่อบันทึกผู้ใช้งานใหม่ลงในฐานข้อมูลผ่าน Stored Procedure
 */
exports.AddUser = async (req, res) => {
  try {
    const {
      Employee_ID,
      Employee_Name,
      Username,
      Password,
      Role,
      Email
    } = req.body;

    const Subscription = (req.body.Subscription === 'Subscribed' || req.body.Subscription === 1 || req.body.Subscription === true || req.body.Subscription === '1') ? 1 : 0;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input('Employee_ID', sql.VarChar(50), Employee_ID)
      .input('Employee_Name', sql.NVarChar(100), Employee_Name)
      .input('Role', sql.VarChar(50), Role)
      .input('Username', sql.VarChar(50), Username)
      .input('Password', sql.VarChar(100), Password)
      .input('Email', sql.VarChar(200), Email)
      .input('Subscription', sql.Bit, Subscription)
      .query('EXEC dbo.Stored_Insert_tb_CuttingTool_Employee @Employee_ID, @Employee_Name, @Role, @Username, @Password, @Email, @Subscription');

    res.status(200).json({ success: true, message: 'Add success' });
  } catch (err) {
    console.error(' Error AddUser:', err);
    res.status(500).json({ success: false, error: err.message || 'Cannot add employee' });
  }
};

/**
 * API: ลบผู้ใช้งาน (Delete Employee)
 * หน้าที่: รับไอดีพนักงาน (Employee_ID) เพื่อค้นหาและลบผู้ใช้งานนั้นออกจากฐานข้อมูล (tb_CuttingTool_Employee)
 */
exports.DeleteEmployee = async (req, res) => {
  try {
    const empId = req.params.id;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('Employee_ID', sql.VarChar, empId)
      .query(`DELETE FROM tb_CuttingTool_Employee WHERE Employee_ID = @Employee_ID`);

    res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
};

/**
 * API: อัปเดตข้อมูลผู้ใช้งาน (Update Employee Info)
 * หน้าที่: แก้ไขข้อมูลผู้ใช้งานเดิมในระบบ หากมีการส่ง Password ใหม่มาจะทำการอัปเดต ถ้าไม่ส่งมาจะใช้รหัสเดิม
 */
exports.updateEmployee = async (req, res) => {
  try {
    const id = req.params.id;
    const { Employee_Name, Username, Password, Role, Email } = req.body || {};

    if (!id) return res.status(400).json({ message: 'ไม่พบ Employee_ID' });
    if (!Employee_Name || !Username || !Role || !Email) {
      return res.status(400).json({ message: 'กรอกข้อมูลไม่ครบ' });
    }

    const Subscription = (req.body.Subscription === 'Subscribed' || req.body.Subscription === 1 || req.body.Subscription === true || req.body.Subscription === '1') ? 1 : 0;

    const pool = await poolPromise;

    await pool.request()
      .input('Employee_ID', sql.VarChar(50), id)
      .input('Employee_Name', sql.NVarChar(100), Employee_Name)
      .input('Username', sql.VarChar(50), Username)
      .input('Password', sql.VarChar(100), Password || '')
      .input('Role', sql.VarChar(50), Role)
      .input('Email', sql.VarChar(200), Email)
      .input('Subscription', sql.Bit, Subscription)
      .query(`
        UPDATE tb_CuttingTool_Employee
        SET Employee_Name = @Employee_Name,
            Username = @Username,
            [Password] = CASE WHEN LEN(@Password) > 0 THEN @Password ELSE [Password] END,
            [Role] = @Role,
            Email = @Email,
            [Subscription] = @Subscription
        WHERE Employee_ID = @Employee_ID
      `);

    res.json({ message: 'updated' });
  } catch (err) {
    console.error('updateEmployee error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
