const { poolPromise } = require("../config/database");
const sql = require('mssql');

/**
 * API: ตรวจสอบการเข้าสู่ระบบ (Login) — 2-Step Force-Logout Flow
 * Step 1: ConfirmForce = false (default) → SP checks if session is active (IsAlreadyIn)
 * Step 2: ConfirmForce = true           → SP forcefully takes over the session with a new SessionToken
 */
exports.Login = async (req, res) => {
  const { Username, Password, ConfirmForce = false } = req.body;

  if (!Username || !Password) {
    return res.status(400).json({ message: 'Please input Username and Password' });
  }

  try {
    const pool = await poolPromise;

    // Call the SP — @ConfirmForce controls whether to check-only or force-takeover
    const result = await pool.request()
      .input('Username', sql.NVarChar, Username)
      .input('Password', sql.NVarChar, Password)
      .input('ConfirmForce', sql.Bit, ConfirmForce ? 1 : 0)
      .query('EXEC [dbo].[stored_Find_CuttingTool_Employee] @Username, @Password, @ConfirmForce');

    if (!result.recordset || result.recordset.length === 0) {
      // No matching user found → invalid credentials
      return res.status(401).json({ message: 'Username or Password invalid please check again' });
    }

    const user = result.recordset[0];

    // SP returns IsAlreadyIn = 1 when another session is active and ConfirmForce was 0
    if (user.IsAlreadyIn === 1) {
      return res.status(409).json({
        status: 'SESSION_ACTIVE',
        message: 'บัญชีนี้มีการใช้งานอยู่ คุณต้องการเข้าสู่ระบบและตัดการเชื่อมต่อผู้ใช้เดิมหรือไม่?'
      });
    }

    // Successful login: SP already updated IsLoggedIn=1 and SessionToken=NEWID()
    const rawData = `${user.Username}-${user.Role}-${Date.now()}`;
    const token = Buffer.from(rawData).toString('base64');

    // --- NEW: Real-time Kick-Out ---
    // If this was a forced takeover, instantly broadcast to all connected clients.
    // The old client will see this, realize its sessionToken no longer matches, and kick itself out.
    if (ConfirmForce) {
      const io = req.app.get('socketio');
      if (io) {
        io.emit('forceLogout', { 
          Employee_ID: user.Employee_ID, 
          newSessionToken: user.SessionToken 
        });
        console.log(`[Login] Emitted forceLogout for Employee_ID: ${user.Employee_ID}`);
      }
    }

    return res.status(200).json({
      message: 'Sign in successful',
      user: user,
      token: token,
      sessionToken: user.SessionToken  // New: client stores this for Heartbeat validation
    });

  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ', error: err.message });
  }
};

/**
 * API: Heartbeat — keeps session alive + validates SessionToken integrity
 * Reads x-session-token from the request header (injected by Angular interceptor).
 * If the token in DB does not match the client's token, the session was forcibly taken
 * over by another login. Return 409 SESSION_TERMINATED to trigger the "kicked" modal.
 */
exports.Heartbeat = async (req, res) => {
  const { Employee_ID } = req.body;
  const clientToken = req.headers['x-session-token'] || null;

  if (!Employee_ID) return res.status(400).send('Employee_ID required');

  try {
    const pool = await poolPromise;

    // Step 1: Validate SessionToken if client has one
    if (clientToken) {
      const tokenCheck = await pool.request()
        .input('TargetID', sql.NVarChar, Employee_ID)
        .query(`
          SELECT SessionToken FROM [dbo].[tb_CuttingTool_Employee]
          WHERE Employee_ID = @TargetID
        `);

      if (tokenCheck.recordset.length > 0) {
        const dbToken = tokenCheck.recordset[0].SessionToken;
        // If DB token differs from client token, this session was forcibly terminated
        if (dbToken && dbToken !== clientToken) {
          return res.status(409).json({
            status: 'SESSION_TERMINATED',
            message: 'เซสชันของคุณถูกตัดการเชื่อมต่อโดยการเข้าสู่ระบบจากที่อื่น'
          });
        }
      }
    }

    // Step 2: Token valid (or not yet set) — update LastActive
    await pool.request()
      .input('TargetID', sql.NVarChar, Employee_ID)
      .query(`
        UPDATE [dbo].[tb_CuttingTool_Employee]
        SET LastActive = GETDATE()
        WHERE Employee_ID = @TargetID
      `);

    return res.status(200).send('Heartbeat updated');

  } catch (err) {
    console.error('Heartbeat error:', err);
    return res.status(500).send('Error updating heartbeat');
  }
};

/**
 * API: Logout — releases the session lock and clears the SessionToken.
 * Setting SessionToken = NULL prevents any stale ghost-match on the next login.
 * AUDIT: IsLoggedIn = 0 AND SessionToken = NULL in a single atomic UPDATE.
 */
exports.Logout = async (req, res) => {
  const { Employee_ID } = req.body;
  console.log(`[Logout API] Attempting to logout Employee_ID: ${Employee_ID}`);

  if (!Employee_ID) {
    console.warn(`[Logout API] Error: Employee_ID is missing from request body.`);
    return res.status(400).send('Employee_ID required');
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('TargetID', sql.NVarChar, Employee_ID)
      .query(`
        UPDATE [dbo].[tb_CuttingTool_Employee]
        SET IsLoggedIn = 0, SessionToken = NULL
        WHERE Employee_ID = @TargetID
      `);
      
    console.log(`[Logout API] Update attempt for ${Employee_ID}. Rows affected: ${result.rowsAffected[0]}`);
    
    if (result.rowsAffected[0] === 0) {
      console.warn(`[Logout API] Warning: Target ID ${Employee_ID} not found in tb_CuttingTool_Employee!`);
      // Warning returned, but we still allow the client to clear their local session.
    }

    return res.status(200).send('Logged out successfully');
  } catch (err) {
    console.error('[Logout API] SQL Execution error:', err);
    return res.status(500).send('Error during logout');
  }
};