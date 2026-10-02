/**
 * Notification Constants and Utilities
 * Centralizes Event Types and Role Aliasing Logic
 */

const EVENT_TYPES = {
    // Production Requests
    REQUEST_SENT: 'REQUEST_SENT',
    REQUEST_COMPLETED: 'REQUEST_COMPLETED',

    // PC Planning
    NEW_PLAN: 'NEW_PLAN',
    PLAN_REVISION: 'PLAN_REVISION',
    CANCEL_PLAN: 'CANCEL_PLAN',
    UPDATE_PLAN: 'UPDATE_PLAN',

    // Returns
    RETURN_SENT: 'RETURN_SENT',
    RETURN_COMPLETED: 'RETURN_COMPLETED',

    // General
    INFO: 'INFO',
    WARNING: 'WARNING',
    ERROR: 'ERROR'
};

/**
 * Maps a list of roles or usernames to their expanded alias strings.
 * e.g. ['purchase'] -> 'purchase,ph'
 * e.g. ['production'] -> 'production,pd'
 * @param {string|string[]} roles
 * @returns {string} Comma-separated expanded role string
 */
const resolveRoles = (roles) => {
    if (!roles) return 'ALL';

    const roleList = Array.isArray(roles)
        ? roles
        : roles.split(',').map(r => r.trim());

    const expanded = new Set();

    roleList.forEach(r => {
        const lowerR = r.toLowerCase();
        expanded.add(lowerR);

        // Alias Mapping
        if (lowerR === 'purchase' || lowerR === 'ph') {
            expanded.add('purchase');
            expanded.add('ph');
        } else if (lowerR === 'production' || lowerR === 'pd') {
            expanded.add('production');
            expanded.add('pd');
        } else if (lowerR === 'engineer' || lowerR === 'eng' || lowerR === 'en') {
            expanded.add('engineer');
            expanded.add('eng');
            expanded.add('en');
        } else if (lowerR === 'qc' || lowerR === 'quality' || lowerR === 'quality control') {
            expanded.add('qc');
            expanded.add('quality');
            expanded.add('quality control');
        } else if (lowerR === 'gague' || lowerR === 'gauge') {
            expanded.add('gague');
            expanded.add('gauge');
        } else if (lowerR === 'pc' || lowerR === 'planner' || lowerR === 'production control') {
            expanded.add('pc');
            expanded.add('planner');
            expanded.add('production control');
        } else {
            expanded.add(lowerR);
        }
    });

    return Array.from(expanded).join(',');
};

/**
 * Maps division labels or IDs to the numeric Division_Id.
 * e.g. '71DZ' or 'PMC' -> 2
 * e.g. '7122' or 'GM' -> 3
 * @param {string|number} division
 * @returns {number|null} 2 for PMC, 3 for GM
 */
const resolveDivisionId = (division) => {
    if (!division) return null;
    const d = String(division).toUpperCase();
    if (d.includes('PMC') || d.includes('71DZ') || d === '2') return 2;
    if (d.includes('GM') || d.includes('7122') || d === '3') return 3;
    return null;
};

/**
 * DB-backed division lookup — loads from tb_Master_Division_MMD on first use.
 * Resolves ANY division input (code, profit center, purchase code, or raw ID)
 * to a clean INT. Cached in memory after first load.
 *
 * @param {string|number} division - e.g. '71DZ', 'PMC', '7122', 'GM', '2', '3'
 * @returns {Promise<number|null>} the Division_Id or null if unresolvable
 */
let _divisionMap = null;

async function resolveDivisionIdDb(division) {
    if (!division && division !== 0) return null;
    const d = String(division).toUpperCase().trim();

    // ── Lazy-load the mapping from the canonical DB table ──
    if (!_divisionMap) {
        try {
            const { poolPromise } = require('../config/database');
            const pool = await poolPromise;
            const result = await pool.request().query(
                'SELECT Division_Id, Division_Code, Profit_Center, Division_Purchase FROM db_Cost_Data_Centralized.master.tb_Master_Division_MMD'
            );
            _divisionMap = new Map();
            for (const row of result.recordset) {
                const id = row.Division_Id;
                _divisionMap.set(String(row.Division_Code).toUpperCase(), id);
                _divisionMap.set(String(row.Profit_Center).toUpperCase(), id);
                _divisionMap.set(String(row.Division_Purchase).toUpperCase(), id);
                _divisionMap.set(String(id), id);
            }
            console.log('[DivisionMap] Loaded', _divisionMap.size, 'lookup keys from tb_Master_Division_MMD');
        } catch (err) {
            console.error('[DivisionMap] DB load failed, using hardcoded fallback:', err.message);
            _divisionMap = null; // force retry next call
        }
    }

    // ── Look up in map ──
    if (_divisionMap && _divisionMap.has(d)) return _divisionMap.get(d);

    // ── Fallback: hardcoded values (for when DB is unreachable) ──
    if (d === '71DZ' || d === 'PMC' || d === '2') return 2;
    if (d === '7122' || d === 'GM' || d === '3') return 3;
    if (d === '7108' || d === '4') return 4;

    // ── Parse as raw integer ──
    const intVal = parseInt(d, 10);
    if (!isNaN(intVal) && String(intVal) === d) return intVal;

    return null;
}

module.exports = {
    EVENT_TYPES,
    resolveRoles,
    resolveDivisionId,
    resolveDivisionIdDb
};
