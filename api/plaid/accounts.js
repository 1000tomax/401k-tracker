/**
 * Get accounts information from Plaid
 */
import { initializePlaidClient } from '../../lib/plaidConfig.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    // Read the request body for Vite dev server
    let body = '';
    if (req.body) {
      body = req.body;
    } else {
      // For Vite dev server, we need to read the body stream
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString();
    }

    const { access_token } = JSON.parse(body || '{}');

    if (!access_token) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Missing access_token' }));
    }

    const { plaidClient } = initializePlaidClient();
    const accountsRequest = {
      access_token: access_token,
    };

    const accountsResponse = await plaidClient.accountsGet(accountsRequest);
    const accounts = accountsResponse.data.accounts;
    const item = accountsResponse.data.item;

    console.log(`Retrieved ${accounts.length} accounts for item ${item.item_id}`);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      accounts: accounts,
      item: item,
    }));

  } catch (error) {
    console.error('Error getting accounts:', error);
    
    if (error.response) {
      // Plaid API error
      res.statusCode = error.response.status || 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: error.response.data || 'Plaid API error',
      }));
    } else {
      // Other error
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }));
    }
  }
}