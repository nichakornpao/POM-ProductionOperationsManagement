
require('dotenv').config({ override: true });

const express = require('express');
const http = require('http'); // สำหรับสร้าง server ให้ Socket.IO ใช้งาน
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
// const fileupload = require('express-fileupload'); // REMOVED: conflicts with multer
//นำเข้าroutesทุกroutesที่ใช้ในการรับส่งข้อมูล
const pcPlanRoutes = require('./src/routes/PCPlan.route');
const Request = require('./src/routes/Request.route.js');
const PurchaseRequest = require('./src/routes/PurchaseRequest.route.js');
const Login = require('./src/routes/Login.route.js');
const Upload = require('./src/routes/FileUpload.route.js');
const Read = require('./src/routes/FileRead.route.js');
const Detail = require('./src/routes/DetailPurchaseRequestlist.route.js');
const Analyze = require('./src/routes/analyze.route.js');
const AnalyzeSmartRack = require('./src/routes/analyzeSmartRack.route.js');
// const Update_Request = require('./src/routes/DetailPurchaseRequestlist.route.js');
const PurchaseHistory = require('./src/routes/PurchaseHistory.route.js');
const Employee = require('./src/routes/Employee.route.js');
const HistoryPrint = require('./src/routes/HistoryPrint.route.js');
const AS400 = require('./src/routes/as400.route.js');

const MasterPH = require('./src/routes/MasterPH.route.js');
const Return = require('./src/routes/Return.route.js');
const Events = require('./src/routes/events.route.js'); // SSE Route
const Email = require('./src/routes/Email.route.js');
const Forecast = require('./src/routes/forecast.route.js');
const EnSync = require('./src/routes/EnSync.route.js');
const { exec } = require('child_process');
const path = require('path');

// Simple native scheduler to avoid npm dependencies
function scheduleDaily(hour, minute, callback) {
  const now = new Date();
  const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);

  if (now > nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const msToWait = nextRun.getTime() - now.getTime();

  setTimeout(() => {
    callback();
    scheduleDaily(hour, minute, callback); // Schedule the next one
  }, msToWait);
}

// Schedule STK LOC Sync every 5 minutes
const STK_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  console.log('[CRON] Running frequent STK LOC Auto Load (Every 5 mins)...');
  const scriptPath = path.join(__dirname, '../auto/ItemMaster_Loader/auto_load_item_master.py');
  const workDir = path.join(__dirname, '../auto/ItemMaster_Loader');

  exec(`py "${scriptPath}"`, { cwd: workDir }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[CRON ERROR STK LOC SYNC]: ${error.message}`);
      return;
    }
    console.log(`[CRON SUCCESS STK LOC SYNC]: ${stdout}`);
  });
}, STK_SYNC_INTERVAL);

// Also run once on startup
setTimeout(() => {
  console.log('[CRON] Running initial STK LOC Auto Load on startup...');
  const scriptPath = path.join(__dirname, '../auto/ItemMaster_Loader/auto_load_item_master.py');
  const workDir = path.join(__dirname, '../auto/ItemMaster_Loader');

  exec(`py "${scriptPath}"`, { cwd: workDir }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[CRON ERROR STK LOC SYNC]: ${error.message}`);
      return;
    }
    console.log(`[CRON SUCCESS STK LOC SYNC]: ${stdout}`);
  });
}, 5000);

// --- EN Data Sync Cron ---
const EnSyncController = require('./src/controllers/EnSync.controller');
const EN_SYNC_INTERVAL = 3 * 60 * 1000; // 3 minutes
setInterval(() => {
  console.log('[CRON] Auto-syncing EN Data (Every 3 mins)...');
  EnSyncController.performSync();
}, EN_SYNC_INTERVAL);

// const FileSaver = require('/src/routes/FileSaver.route.js');
// const ExportToExcel = require('./src/routes/ExportToExcel.route.js');
// const updateItem = require('./src/routes/DetailPurchaseRequestlist.route.js');

// Create Instance and Express application
const app = express();
const port = process.env.PORT

// Define the routes
// app.use(fileupload());
// NOTE: Do NOT use express-fileupload globally — it conflicts with multer.
// File uploads are handled per-route using multer middleware instead.
// Parse and dynamically validate allowed origins (supports comma-separated FRONTEND_URL)
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);

const corsOriginDelegate = (origin, callback) => {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
  if (!origin) return callback(null, true);

  // If FRONTEND_URL is not set or wildcard '*', allow incoming origin
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    return callback(null, true);
  }

  // Exact match with configured origins
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  // Allow localhost, 127.0.0.1, or any frontend accessing on port 9696
  try {
    const url = new URL(origin);
    if (url.port === '9696' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return callback(null, true);
    }
  } catch (e) {}

  return callback(null, false);
};

app.use(cors({
  origin: corsOriginDelegate,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'Accept',
    'x-username', 'x-role', 'x-session-token'
  ]
}));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.raw())

// นำเข้าpathของrouterทุกหน้า
app.use('/api/pc-plan', pcPlanRoutes);
app.use('/api', Request);
app.use('/api', PurchaseRequest);
app.use('/api', Login);
app.use('/api', Upload);
app.use('/api', Read);
app.use('/api', Detail); //DetailPurchaseRequestlistRoutes
app.use('/api', Analyze);
app.use('/api', AnalyzeSmartRack);
app.use('/api', PurchaseHistory);
app.use('/api', Employee);
app.use('/api', HistoryPrint);
app.use('/api', AS400);

app.use('/api', MasterPH);
app.use('/api', Return);
app.use('/api', Email);
app.use('/api', Forecast);
app.use('/api', EnSync);
app.post('/api/client-log', (req, res) => { require('fs').appendFileSync('client_logs.txt', JSON.stringify(req.body) + '\n'); res.send('ok'); });
app.use('/api/events', Events); // Mount SSE Route

function logExpressRoutes(appInstance) {
  if (!appInstance || !appInstance._router || !appInstance._router.stack) {
    console.log('[ROUTES] No router stack available yet.');
    return;
  }

  const routes = [];
  appInstance._router.stack.forEach((middleware) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).map((m) => m.toUpperCase()).join(', ');
      routes.push(`${methods} ${middleware.route.path}`);
    } else if (middleware.name === 'router' && middleware.handle && middleware.handle.stack) {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).map((m) => m.toUpperCase()).join(', ');
          routes.push(`${methods} ${middleware.regexp && middleware.regexp.source ? middleware.regexp.source.replace('^\\/', '/').replace('\\/?$', '') : ''}${handler.route.path}`);
        }
      });
    }
  });

  if (routes.length === 0) {
    console.log('[ROUTES] No routes found.');
  } else {
    console.log('[ROUTES] Mounted Express routes:');
    routes.forEach((route) => console.log(`  ${route}`));
  }
}

logExpressRoutes(app);

// === Notification Routes === (Using direct controller import)
const NotificationController = require('./src/controllers/Notification.controller.js');
app.get('/api/notifications/list', NotificationController.getNotifications);
app.get('/api/notifications/trash', NotificationController.getTrashNotifications);
app.get('/api/notifications/:id/details', NotificationController.getNotificationDetails);
app.put('/api/notifications/read/:id', NotificationController.markAsRead);
app.put('/api/notifications/mark-all-read', NotificationController.markAllRead);
app.put('/api/notifications/delete-read', NotificationController.deleteReadNotifications);
app.put('/api/notifications/delete-by-ids', NotificationController.deleteByIds);
app.put('/api/notifications/restore/:id', NotificationController.restoreNotification);
// app.use('/api',FileSaver);
// app.use('/api',ExportToExcel);
// app.use('/api', updateItem);



// กำหนดเส้นทางหลัก
app.get('/', (req, res) => {
  res.send('This is backend!'); // ส่งข้อความ "Hello World!" เมื่อเข้า URL หลัก
});

// === เพิ่ม Socket.IO ===
const server = http.createServer(app); // ใช้ HTTP server ของ Node
const io = new Server(server, {
  cors: {
    origin: corsOriginDelegate,
    credentials: true
  }
});
app.set('socketio', io); // Expose io instance to use in controllers

// Start Autoload Watcher Service (checks DB autoloader tables periodically and broadcasts updates)
const autoloadWatcher = require('./src/services/autoloadWatcher.service');
autoloadWatcher.start(io);

// เมื่อ client เชื่อมต่อ
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // รับ event จาก client
  socket.on('sendNotification', (data) => {
    console.log('Notification received:', data);
    // ส่งไปทุก client
    io.emit('receiveNotification', data);
  });

  // เมื่อ client ตัดการเชื่อมต่อ
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// localhost
// server.listen(port, '0.0.0.0', () => {
//   console.log(`Server is running on http://localhost:${port}`);
// });

// ── Global error handlers — prevent process crashes from unhandled errors ──
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.stack || err.message || err);
  // Keep the process alive — do NOT exit
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason?.stack || reason?.message || reason);
  // Keep the process alive — do NOT exit
});

//server
server.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://pbgm8g:${port}`);
});
