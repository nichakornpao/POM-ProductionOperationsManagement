const express = require('express');
const router = express.Router();
const SSEManager = require('../utils/SSEManager');

// Route for SSE connection
// URL: /api/events/planlist
router.get('/planlist', (req, res) => {
    SSEManager.addClient(req, res);
});

module.exports = router;
