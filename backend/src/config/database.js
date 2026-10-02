const sql = require("mssql"); // นำเข้าโมดูล mssql สำหรับการเชื่อมต่อฐานข้อมูล SQL Server
require('dotenv').config();

// กำหนดการตั้งค่าการเชื่อมต่อกับฐานข้อมูล
const dbConfig = {
  user: process.env.DB_USER_APP, // ชื่อผู้ใช้สำหรับการเชื่อมต่อฐานข้อมูล
  password: process.env.DB_PASSWORD, // รหัสผ่านสำหรับการเชื่อมต่อฐานข้อมูล
  server: process.env.DB_SERVER, // ที่อยู่เซิร์ฟเวอร์ฐานข้อมูล
  database: process.env.DB_NAME, // ชื่อฐานข้อมูลที่ต้องการเชื่อมต่อ
  requestTimeout: 300000, // 5 minutes timeout for large imports
  options: {
    trustServerCertificate: true, // เชื่อถือใบรับรองเซิร์ฟเวอร์
    trustedConnection: true, // ใช้การเชื่อมต่อที่เชื่อถือได้
    encrypt: false, // ปิดการเข้ารหัสการเชื่อมต่อ
  },
};

// สร้างการเชื่อมต่อฐานข้อมูลแบบ Pool
const poolPromise = new sql.ConnectionPool(dbConfig) // สร้าง ConnectionPool ด้วยการตั้งค่า dbConfig
  .connect() // เชื่อมต่อไปยังฐานข้อมูล
  .then(pool => {
    console.log('Connected to MSSQL'); // แสดงข้อความเมื่อเชื่อมต่อสำเร็จ
    return pool; // คืนค่า pool ที่เชื่อมต่อ

  })
  .catch(err => {
    console.error('Database Connection Failed!', err.stack); // แสดงข้อความข้อผิดพลาดหากการเชื่อมต่อไม่สำเร็จ
    throw err; // ขว้างข้อผิดพลาดเพื่อจัดการต่อไป
  });

// สร้างการเชื่อมต่อฐานข้อมูลแยกสำหรับ PBGM8G (Database: CostReduction)
const pbgm8gConfig = {
  user: process.env.DB_USER_APP || 'Cost_Team',
  password: process.env.DB_PASSWORD || 'Cost@User1',
  server: 'pbgm8g',
  database: 'CostReduction',
  requestTimeout: 10000,
  connectionTimeout: 3000,
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
};

const poolPbgm8gPromise = new sql.ConnectionPool(pbgm8gConfig)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL (PBGM8G - CostReduction)');
    return pool;
  })
  .catch(err => {
    console.warn('Database Connection to PBGM8G Failed! (Using fallback if possible)', err.message);
    return null;
  });

// สร้างการเชื่อมต่อฐานข้อมูลสำหรับ PBGM8G (Database: PurchaseAutoload) สำหรับ ItemMaster
const pbgm8gPurchaseConfig = {
  ...pbgm8gConfig,
  database: 'PurchaseAutoload',
};

const poolPurchaseAutoloadPromise = new sql.ConnectionPool(pbgm8gPurchaseConfig)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL (PBGM8G - PurchaseAutoload)');
    return pool;
  })
  .catch(err => {
    console.warn('Database Connection to PBGM8G PurchaseAutoload Failed!', err.message);
    return null;
  });

// สร้างการเชื่อมต่อสำหรับ ForecastProject (Database ที่เพิ่งสร้างใหม่)
const forecastProjectConfig = {
  ...pbgm8gConfig,
  database: 'ForecastProject',
};

const poolForecastProjectPromise = new sql.ConnectionPool(forecastProjectConfig)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL (PBGM8G - ForecastProject)');
    return pool;
  })
  .catch(err => {
    console.warn('Database Connection to PBGM8G ForecastProject Failed!', err.message);
    return null;
  });

// สร้างการเชื่อมต่อสำหรับ PBGM8G (Database: RequestindirrecMaterial) สำหรับ TestIssueAs400
const requestIndirrecConfig = {
  ...pbgm8gConfig,
  database: 'RequestindirrecMaterial',
  requestTimeout: 30000,
  connectionTimeout: 5000,
};

const poolRequestIndirrecPromise = new sql.ConnectionPool(requestIndirrecConfig)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL (PBGM8G - RequestindirrecMaterial)');
    return pool;
  })
  .catch(err => {
    console.warn('Database Connection to PBGM8G RequestindirrecMaterial Failed!', err.message);
    return null;
  });

// ส่งออกโมดูล sql และ poolPromise
module.exports = {
  sql,
  poolPromise,
  poolPbgm8gPromise,
  poolPurchaseAutoloadPromise,
  poolForecastProjectPromise,
  poolRequestIndirrecPromise
};
