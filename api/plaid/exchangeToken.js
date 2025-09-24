/**
 * Exchange Plaid public token for access token
 */
import { initializePlaidClient } from '../../src/lib/plaidConfig.js';

// In-memory storage for development (replace with database in production)
const tokenStore = new Map();

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

    const { public_token } = JSON.parse(body || '{}');

    console.log('Token exchange request received:', {
      public_token: public_token?.substring(0, 20) + '...',
      body_length: body?.length,
      has_public_token: !!public_token
    });

    if (!public_token) {
      console.log('Missing public_token in request');
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Missing public_token' }));
    }

    // Exchange the public_token for an access_token
    const { plaidClient } = initializePlaidClient();
    const exchangeRequest = {
      public_token: public_token,
    };

    const exchangeResponse = await plaidClient.itemPublicTokenExchange(exchangeRequest);
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Store the access token (in production, store this securely in a database)
    tokenStore.set(itemId, {
      access_token: accessToken,
      item_id: itemId,
      created_at: new Date().toISOString(),
    });

    console.log('Plaid token exchange successful:', {
      item_id: itemId,
      token_length: accessToken.length,
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      access_token: accessToken,
      item_id: itemId,
    }));

  } catch (error) {
    console.error('Error exchanging public token:', error);
    console.error('Full error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      code: error.code
    });
    
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

// Export token store for other endpoints
export { tokenStore };