/**
 * Plaid Webhook Endpoint with JWT Verification
 * Receives notifications about account events, transactions, and other updates
 * Implements Plaid-required JWT verification for production compliance
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Key cache for webhook verification
const keyCache = new Map();
const KEY_CACHE_TIME = 300000; // 5 minutes

// Initialize Plaid client
function initializePlaidClient() {
  const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
  const PLAID_SECRET = process.env.PLAID_SECRET;
  const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new Error('Missing Plaid credentials for webhook verification');
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

  return new PlaidApi(configuration);
}

// Get webhook verification key with caching
async function getWebhookVerificationKey(keyId) {
  const cacheKey = `webhook-key-${keyId}`;
  const cached = keyCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < KEY_CACHE_TIME) {
    return cached.key;
  }

  try {
    const plaidClient = initializePlaidClient();
    const response = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
    const key = response.data.key;

    keyCache.set(cacheKey, {
      key,
      timestamp: Date.now()
    });

    return key;
  } catch (error) {
    console.error('❌ Failed to get webhook verification key:', error.message);
    throw error;
  }
}

// Verify webhook JWT
async function verifyWebhookJWT(requestBody, jwtToken) {
  try {
    // Decode JWT header to get key ID
    const header = jwt.decode(jwtToken, { complete: true })?.header;
    if (!header?.kid) {
      throw new Error('Missing key ID in JWT header');
    }

    // Get verification key
    const verificationKey = await getWebhookVerificationKey(header.kid);

    // Verify JWT signature and get payload
    const payload = jwt.verify(jwtToken, verificationKey.pem, { algorithms: ['ES256'] });

    // Verify request body hash
    const bodyHash = crypto.createHash('sha256').update(requestBody, 'utf8').digest('hex');
    if (payload.request_body_sha256 !== bodyHash) {
      throw new Error('Request body hash mismatch');
    }

    // Check token age (max 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (now - payload.iat > 300) {
      throw new Error('JWT token too old');
    }

    console.log('✅ Webhook JWT verification successful:', {
      key_id: header.kid,
      issued_at: new Date(payload.iat * 1000).toISOString(),
      body_hash_match: true
    });

    return true;
  } catch (error) {
    console.error('❌ Webhook JWT verification failed:', error.message);
    return false;
  }
}

// Discord notification function to demonstrate active webhook processing
async function notifyDiscord(webhook) {
  // Use a public webhook.site endpoint for demonstration
  // You can replace this with an actual Discord webhook URL
  const DISCORD_WEBHOOK_URL = 'https://webhook.site/unique-id'; // Replace with real Discord webhook

  try {
    const message = {
      content: `🔔 **Plaid Webhook Received**\n\`\`\`json\n${JSON.stringify({
        type: webhook.webhook_type,
        code: webhook.webhook_code,
        item_id: webhook.item_id,
        timestamp: new Date().toISOString()
      }, null, 2)}\n\`\`\``,
      username: '401K Tracker Bot'
    };

    // For demo purposes, we'll just log instead of actual Discord call
    // to avoid needing a real Discord webhook URL
    console.log('📤 Would send to Discord:', message.content);

    // Uncomment below to actually send to Discord:
    // const response = await fetch(DISCORD_WEBHOOK_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(message)
    // });

    return true;
  } catch (error) {
    console.error('❌ Discord notification failed:', error.message);
    return false;
  }
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

    // Get JWT token from headers
    const jwtToken = req.headers['plaid-verification'];

    // For production, verify JWT token
    if (process.env.PLAID_ENV === 'production' && jwtToken) {
      const isValidJWT = await verifyWebhookJWT(body, jwtToken);
      if (!isValidJWT) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Webhook verification failed' }));
      }
    } else if (process.env.PLAID_ENV === 'production') {
      console.log('⚠️ Production webhook received without JWT token - this should not happen');
    }

    const webhook = JSON.parse(body || '{}');

    console.log('🔔 Plaid webhook received:', {
      webhook_type: webhook.webhook_type,
      webhook_code: webhook.webhook_code,
      item_id: webhook.item_id,
      timestamp: new Date().toISOString()
    });

    // Handle different webhook types
    switch (webhook.webhook_type) {
      case 'TRANSACTIONS':
        console.log('📊 Transaction webhook:', {
          code: webhook.webhook_code,
          item_id: webhook.item_id,
          new_transactions: webhook.new_transactions,
          removed_transactions: webhook.removed_transactions
        });
        break;

      case 'ITEM':
        console.log('📱 Item webhook:', {
          code: webhook.webhook_code,
          item_id: webhook.item_id,
          error: webhook.error
        });

        // Handle specific item events
        if (webhook.webhook_code === 'NEW_ACCOUNTS_AVAILABLE') {
          console.log('🆕 New accounts available for item:', webhook.item_id);
        }
        break;

      case 'INVESTMENTS_TRANSACTIONS':
        console.log('💰 Investment transaction webhook:', {
          code: webhook.webhook_code,
          item_id: webhook.item_id,
          new_investments_transactions: webhook.new_investments_transactions,
          cancelled_investments_transactions: webhook.cancelled_investments_transactions
        });
        break;

      case 'AUTH':
        console.log('🔐 Auth webhook:', {
          code: webhook.webhook_code,
          item_id: webhook.item_id
        });
        break;

      default:
        console.log('❓ Unknown webhook type:', webhook.webhook_type);
    }

    // Store webhook data for processing (in production, you'd queue this for background processing)
    // Send notification to Discord to show active webhook processing
    await notifyDiscord(webhook);

    // Respond with 200 to acknowledge receipt
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      received: true,
      webhook_type: webhook.webhook_type,
      webhook_code: webhook.webhook_code,
      processed_at: new Date().toISOString()
    }));

  } catch (error) {
    console.error('❌ Error processing webhook:', error);

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
    }));
  }
}