const { poolPbgm8gPromise } = require('../config/database');
const SSEManager = require('../utils/SSEManager');

class AutoloadWatcherService {
  constructor() {
    this.io = null;
    this.intervalId = null;
    this.intervalMs = 10000; // 10 seconds check
    this.isChecking = false;
    this.isInitialized = false;

    this.expense = {
      id: null,
      loaded_at: null
    };

    this.inventory = {
      id: null,
      loaded_at: null
    };

    this.stockSummary = {
      id: null,
      loaded_at: null
    };

    this.cuttingtoolsInventory = {
      id: null,
      loaded_at: null
    };

    this.lastChecked = null;
    this.status = 'idle';
  }

  /**
   * Start the watcher loop
   * @param {import('socket.io').Server} io
   */
  start(io) {
    if (this.intervalId) {
      console.log('[AutoloadWatcher] Already running.');
      return;
    }

    this.io = io;
    this.status = 'running';
    console.log('[AutoloadWatcher] Service started. Poll interval:', this.intervalMs, 'ms');

    // Run first check immediately
    this.checkUpdates();

    // Set recurring timer
    this.intervalId = setInterval(() => {
      this.checkUpdates();
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.status = 'stopped';
      console.log('[AutoloadWatcher] Service stopped.');
    }
  }

  /**
   * Check DB for latest records
   */
  async checkUpdates() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const pool = await poolPbgm8gPromise;
      if (!pool) {
        console.warn('[AutoloadWatcher] PBGM8G pool not available.');
        this.isChecking = false;
        return;
      }

      // 1. Check Expense Daily (division = 'DZ')
      const expenseRes = await pool.request().query(`
        SELECT TOP 1 id, loaded_at
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_factory_supply_expense_daily]
        WHERE division = 'DZ'
        ORDER BY id DESC
      `);

      const latestExpense = expenseRes.recordset && expenseRes.recordset[0] ? expenseRes.recordset[0] : null;

      // 2. Check Inventory Daily
      const invRes = await pool.request().query(`
        SELECT TOP 1 id, loaded_at
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_factory_supply_inventory_daily]
        ORDER BY id DESC
      `);

      const latestInv = invRes.recordset && invRes.recordset[0] ? invRes.recordset[0] : null;

      // 3. Check Cuttingtools Stock Summary Daily
      const stockSummaryRes = await pool.request().query(`
        SELECT TOP 1 id, loaded_at
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_stock_summary_daily]
        ORDER BY id DESC
      `);

      const latestStockSummary = stockSummaryRes.recordset && stockSummaryRes.recordset[0] ? stockSummaryRes.recordset[0] : null;

      // 4. Check Cuttingtools Inventory Daily
      const cuttingtoolsInvRes = await pool.request().query(`
        SELECT TOP 1 id, loaded_at
        FROM [cost_reduction_autoloader_production].[trans].[tb_autoload_all_cuttingtools_inventory_daily]
        ORDER BY id DESC
      `);

      const latestCuttingtoolsInv = cuttingtoolsInvRes.recordset && cuttingtoolsInvRes.recordset[0] ? cuttingtoolsInvRes.recordset[0] : null;

      this.lastChecked = new Date();

      if (!this.isInitialized) {
        // Initial snapshot
        if (latestExpense) {
          this.expense = { id: latestExpense.id, loaded_at: latestExpense.loaded_at };
        }
        if (latestInv) {
          this.inventory = { id: latestInv.id, loaded_at: latestInv.loaded_at };
        }
        if (latestStockSummary) {
          this.stockSummary = { id: latestStockSummary.id, loaded_at: latestStockSummary.loaded_at };
        }
        if (latestCuttingtoolsInv) {
          this.cuttingtoolsInventory = { id: latestCuttingtoolsInv.id, loaded_at: latestCuttingtoolsInv.loaded_at };
        }
        this.isInitialized = true;
        console.log('[AutoloadWatcher] Initialized with state:', {
          expense: this.expense,
          inventory: this.inventory,
          stockSummary: this.stockSummary,
          cuttingtoolsInventory: this.cuttingtoolsInventory
        });
        this.isChecking = false;
        return;
      }

      // Detect Expense updates
      if (latestExpense && (latestExpense.id !== this.expense.id || latestExpense.loaded_at !== this.expense.loaded_at)) {
        console.log(`[AutoloadWatcher] 🔥 Expense Daily updated! ID: ${this.expense.id} -> ${latestExpense.id}, loaded_at: ${latestExpense.loaded_at}`);
        this.expense = { id: latestExpense.id, loaded_at: latestExpense.loaded_at };

        const payload = {
          table: 'expense_daily',
          id: latestExpense.id,
          loaded_at: latestExpense.loaded_at,
          timestamp: new Date()
        };

        if (this.io) {
          this.io.emit('forecast:autoload-updated', payload);
        }
        SSEManager.broadcast({ type: 'FORECAST_AUTOLOAD_UPDATED', ...payload });
      }

      // Detect Cuttingtools Stock Summary updates
      if (latestStockSummary && (latestStockSummary.id !== this.stockSummary.id || latestStockSummary.loaded_at !== this.stockSummary.loaded_at)) {
        console.log(`[AutoloadWatcher] 🔥 Cuttingtools Stock Summary Daily updated! ID: ${this.stockSummary.id} -> ${latestStockSummary.id}, loaded_at: ${latestStockSummary.loaded_at}`);
        this.stockSummary = { id: latestStockSummary.id, loaded_at: latestStockSummary.loaded_at };

        const payload = {
          table: 'cuttingtools_stock_summary_daily',
          id: latestStockSummary.id,
          loaded_at: latestStockSummary.loaded_at,
          timestamp: new Date()
        };

        if (this.io) {
          this.io.emit('forecast:autoload-updated', payload);
        }
        SSEManager.broadcast({ type: 'FORECAST_AUTOLOAD_UPDATED', ...payload });
      }

      // Detect Inventory updates
      if (latestInv && (latestInv.id !== this.inventory.id || latestInv.loaded_at !== this.inventory.loaded_at)) {
        console.log(`[AutoloadWatcher] 🔥 Inventory Daily updated! ID: ${this.inventory.id} -> ${latestInv.id}, loaded_at: ${latestInv.loaded_at}`);
        this.inventory = { id: latestInv.id, loaded_at: latestInv.loaded_at };

        // Invalidate backend stock cache
        try {
          const forecastController = require('../controllers/forecast.controller');
          if (forecastController && typeof forecastController.clearStockCache === 'function') {
            forecastController.clearStockCache();
          }
        } catch (cErr) {
          // ignore cache clearing errors
        }

        const payload = {
          table: 'inventory_daily',
          id: latestInv.id,
          loaded_at: latestInv.loaded_at,
          timestamp: new Date()
        };

        if (this.io) {
          this.io.emit('forecast:autoload-updated', payload);
        }
        SSEManager.broadcast({ type: 'FORECAST_AUTOLOAD_UPDATED', ...payload });
      }

      // Detect Cuttingtools Inventory updates
      if (latestCuttingtoolsInv && (latestCuttingtoolsInv.id !== this.cuttingtoolsInventory.id || latestCuttingtoolsInv.loaded_at !== this.cuttingtoolsInventory.loaded_at)) {
        console.log(`[AutoloadWatcher] 🔥 Cuttingtools Inventory Daily updated! ID: ${this.cuttingtoolsInventory.id} -> ${latestCuttingtoolsInv.id}, loaded_at: ${latestCuttingtoolsInv.loaded_at}`);
        this.cuttingtoolsInventory = { id: latestCuttingtoolsInv.id, loaded_at: latestCuttingtoolsInv.loaded_at };

        const payload = {
          table: 'cuttingtools_inventory_daily',
          id: latestCuttingtoolsInv.id,
          loaded_at: latestCuttingtoolsInv.loaded_at,
          timestamp: new Date()
        };

        if (this.io) {
          this.io.emit('forecast:autoload-updated', payload);
        }
        SSEManager.broadcast({ type: 'FORECAST_AUTOLOAD_UPDATED', ...payload });
      }

    } catch (err) {
      console.error('[AutoloadWatcher] Error checking DB:', err.message);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Return status for client polling/verification
   */
  getStatus() {
    return {
      status: this.status,
      lastChecked: this.lastChecked,
      expense: this.expense,
      inventory: this.inventory,
      stockSummary: this.stockSummary,
      cuttingtoolsInventory: this.cuttingtoolsInventory,
      intervalMs: this.intervalMs
    };
  }
}

// Export singleton instance
module.exports = new AutoloadWatcherService();
