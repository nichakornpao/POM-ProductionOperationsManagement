/**
 * SSEManager.js
 * Centralized manager for Server-Sent Events (SSE) connections.
 * Allows broadcast of real-time updates to connected frontend clients.
 */

class SSEManager {
    constructor() {
        this.clients = [];
    }

    /**
     * Adds a new client to the SSE connection pool.
     * Sets headers required for keep-alive streaming.
     */
    addClient(req, res) {
        // Set standard SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Flush headers immediately
        res.flushHeaders();

        // Optional: Send initial 'connected' event
        res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date() })}\n\n`);

        // Add to our list
        this.clients.push(res);

        // Remove client when connection closes
        req.on('close', () => {
            this.clients = this.clients.filter(client => client !== res);
            console.log(`[SSE] Client disconnected. Total clients: ${this.clients.length}`);
        });

        console.log(`[SSE] Client connected. Total clients: ${this.clients.length}`);
    }

    /**
     * Broadcasts a JSON message to ALL connected clients.
     * @param {Object} data - The payload to send
     */
    broadcast(data) {
        if (this.clients.length === 0) return;

        const payload = `data: ${JSON.stringify(data)}\n\n`;
        this.clients.forEach(client => {
            try {
                client.write(payload);
            } catch (err) {
                console.error('[SSE] Failed to write to client:', err);
            }
        });
        console.log(`[SSE] Broadcast event: ${data.type} to ${this.clients.length} clients`);
    }
}

// Export a singleton instance
module.exports = new SSEManager();
