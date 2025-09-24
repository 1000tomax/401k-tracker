/**
 * Test Plaid webhook endpoint
 * Fires a test webhook using the sandbox/item/fire_webhook endpoint
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Initialize Plaid client
function initializePlaidClient() {
  const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
  const PLAID_SECRET = process.env.PLAID_SECRET;
  const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new Error('Missing Plaid credentials. Please check your environment variables.');
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
        'Plaid-Version': '2020-09-14',
      },
    },
  });

  const plaidClient = new PlaidApi(configuration);
  return { plaidClient };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    // Read the request body
    let body = '';
    if (req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    } else {
      // For Vite dev server, read the body stream
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString();
    }

    const { access_token, webhook_code = 'NEW_ACCOUNTS_AVAILABLE' } = JSON.parse(body || '{}');

    if (!access_token) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Missing access_token' }));
    }

    const { plaidClient } = initializePlaidClient();

    console.log('🧪 Testing webhook with:', {
      webhook_code,
      access_token_length: access_token.length
    });

    // Fire the test webhook
    const fireWebhookRequest = {
      access_token: access_token,
      webhook_code: webhook_code
    };

    const response = await plaidClient.sandboxItemFireWebhook(fireWebhookRequest);

    console.log('✅ Webhook test fired successfully:', {
      webhook_fired: response.data.webhook_fired,
      request_id: response.data.request_id
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      webhook_fired: response.data.webhook_fired,
      request_id: response.data.request_id,
      webhook_code: webhook_code,
      message: 'Test webhook fired successfully. Check your webhook endpoint logs.'
    }));

  } catch (error) {
    console.error('❌ Error firing test webhook:', error);

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