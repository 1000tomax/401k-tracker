import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import snapshotHandler from './api/snapshot.js';
import pushHandler from './api/push.js';
import createLinkTokenHandler from './api/plaid/createLinkToken.js';
import exchangeTokenHandler from './api/plaid/exchangeToken.js';
import accountsHandler from './api/plaid/accounts.js';
import investmentTransactionsHandler from './api/plaid/investmentTransactions.js';

function createDevApiPlugin() {
  const wrap = handler => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Dev API handler error:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Internal dev API error.' }));
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
      server.middlewares.use('/api/snapshot', wrap(snapshotHandler));
      server.middlewares.use('/api/push', wrap(pushHandler));
      
      // Plaid API endpoints
      server.middlewares.use('/api/plaid/create_link_token', wrap(createLinkTokenHandler));
      server.middlewares.use('/api/plaid/exchange_public_token', wrap(exchangeTokenHandler));
      server.middlewares.use('/api/plaid/accounts', wrap(accountsHandler));
      server.middlewares.use('/api/plaid/investment_transactions', wrap(investmentTransactionsHandler));
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
