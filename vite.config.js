import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import createLinkTokenHandler from './api/plaid/create_link_token.js';
import exchangeTokenHandler from './api/plaid/exchange_public_token.js';
import accountsHandler from './api/plaid/accounts.js';
import investmentTransactionsHandler from './api/plaid/investment_transactions.js';
import removeItemHandler from './api/plaid/removeItem.js';
import webhookHandler from './api/plaid/webhook.js';

// Database API endpoints
import migrateHandler from './api/db/migrate.js';
import migrateDataHandler from './api/db/migrate-data.js';
import saveConnectionHandler from './api/db/plaid/save-connection.js';
import getConnectionsHandler from './api/db/plaid/get-connections.js';
import listTransactionsHandler from './api/db/transactions/list.js';
import importTransactionsHandler from './api/db/transactions/import.js';
import syncTransactionsHandler from './api/db/transactions/sync.js';
import syncHistoryHandler from './api/db/transactions/sync-history.js';

function createDevApiPlugin() {
  const wrap = handler => async (req, res, next) => {
    try {
      console.log(`🔧 Dev API: ${req.method} ${req.url}`);

      // Parse request body for POST requests
      if (req.method === 'POST' && !req.body) {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        await new Promise(resolve => {
          req.on('end', () => {
            try {
              req.body = body ? JSON.parse(body) : {};
              console.log('📦 Parsed request body:', req.body);
            } catch (error) {
              console.error('❌ Failed to parse request body:', error);
              req.body = {};
            }
            resolve();
          });
        });
      }

      // Create a proper mock response object for Vercel compatibility
      const mockRes = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          if (res.setHeader) res.setHeader(key, value);
        },
        status: function(code) {
          this.statusCode = code;
          return { json: (data) => this.json(data) };
        },
        json: function(data) {
          this.setHeader('Content-Type', 'application/json');
          const response = JSON.stringify(data);
          if (res.end) {
            res.statusCode = this.statusCode;
            res.end(response);
          }
          return this;
        },
        end: function(data) {
          if (res.end) {
            res.statusCode = this.statusCode;
            res.end(data);
          }
        }
      };

      // Set default headers for CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }

      await handler(req, mockRes);
    } catch (error) {
      console.error('❌ Dev API handler error:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Internal dev API error.', details: error.message }));
      }
    }
    if (!res.writableEnded && typeof next === 'function') {
      next();
    }
  };

  return {
    name: 'dev-api-endpoints',
    apply: 'serve',
    configureServer(server) {
      // Plaid API endpoints
      server.middlewares.use('/api/plaid/create_link_token', wrap(createLinkTokenHandler));
      server.middlewares.use('/api/plaid/exchange_public_token', wrap(exchangeTokenHandler));
      server.middlewares.use('/api/plaid/accounts', wrap(accountsHandler));
      server.middlewares.use('/api/plaid/investment_transactions', wrap(investmentTransactionsHandler));
      server.middlewares.use('/api/plaid/removeItem', wrap(removeItemHandler));
      server.middlewares.use('/api/plaid/webhook', wrap(webhookHandler));

      // Database API endpoints
      server.middlewares.use('/api/db/migrate', wrap(migrateHandler));
      server.middlewares.use('/api/db/migrate-data', wrap(migrateDataHandler));
      server.middlewares.use('/api/db/plaid/save-connection', wrap(saveConnectionHandler));
      server.middlewares.use('/api/db/plaid/get-connections', wrap(getConnectionsHandler));
      server.middlewares.use('/api/db/transactions/list', wrap(listTransactionsHandler));
      server.middlewares.use('/api/db/transactions/import', wrap(importTransactionsHandler));
      server.middlewares.use('/api/db/transactions/sync', wrap(syncTransactionsHandler));
      server.middlewares.use('/api/db/transactions/sync-history', wrap(syncHistoryHandler));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), createDevApiPlugin()],
    server: {
      open: true,
      hmr: {
        overlay: true,
      },
    },
  };
});
