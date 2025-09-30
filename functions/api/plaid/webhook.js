/**
 * Plaid Webhook Endpoint with JWT Verification
 * Receives notifications about account events, transactions, and other updates
 * Implements Plaid-required JWT verification for production compliance
 * Cloudflare Workers function
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import jwt from 'jsonwebtoken';
import { handleCors, jsonResponse } from '../../../src/utils/cors-workers.js';

// Key cache for webhook verification (using KV would be better in production)
const keyCache = new Map();
const KEY_CACHE_TIME = 300000; // 5 minutes

// Initialize Plaid client
function initializePlaidClient(env) {
  const PLAID_CLIENT_ID = env.PLAID_CLIENT_ID;
  const PLAID_SECRET = env.PLAID_SECRET;
  const PLAID_ENV = env.PLAID_ENV || 'sandbox';

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
async function getWebhookVerificationKey(keyId, env) {
  const cacheKey = `webhook-key-${keyId}`;
  const cached = keyCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < KEY_CACHE_TIME) {
    return cached.key;
  }

  try {
    const plaidClient = initializePlaidClient(env);
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
async function verifyWebhookJWT(requestBody, jwtToken, env) {
  try {
    // Decode JWT header to get key ID
    const header = jwt.decode(jwtToken, { complete: true })?.header;
    if (!header?.kid) {
      throw new Error('Missing key ID in JWT header');
    }

    // Get verification key
    const verificationKey = await getWebhookVerificationKey(header.kid, env);

    // Verify JWT signature and get payload
    const payload = jwt.verify(jwtToken, verificationKey.pem, { algorithms: ['ES256'] });

    // Verify request body hash
    const encoder = new TextEncoder();
    const data = encoder.encode(requestBody);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const bodyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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

// Discord notification function for real webhook processing
async function notifyDiscord(webhook) {
  const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1411197542380867604/-L14Xu0h1qwSkuCa4kgdu9OFd1PZGLH7WASrPRPn0TBtiuDzGshdftx2ooagM_cFv9B9';

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

    console.log('📤 Sending to Discord:', message.content);

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (response.ok) {
      console.log('✅ Discord notification sent successfully');
      return true;
    } else {
      console.error('❌ Discord API error:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('❌ Discord notification failed:', error.message);
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Handle CORS preflight
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  try {
    // Read the request body as text for hash verification
    const body = await request.text();

    // Get JWT token from headers
    const jwtToken = request.headers.get('plaid-verification');

    // For production, verify JWT token
    if (env.PLAID_ENV === 'production' && jwtToken) {
      const isValidJWT = await verifyWebhookJWT(body, jwtToken, env);
      if (!isValidJWT) {
        return jsonResponse({ error: 'Webhook verification failed' }, 401, env);
      }
    } else if (env.PLAID_ENV === 'production') {
      console.log('⚠️ Production webhook received without JWT token - this should not happen');
    }

    const webhook = JSON.parse(body);

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
    return jsonResponse({
      received: true,
      webhook_type: webhook.webhook_type,
      webhook_code: webhook.webhook_code,
      processed_at: new Date().toISOString()
    }, 200, env);

  } catch (error) {
    console.error('❌ Error processing webhook:', error);

    return jsonResponse({
      error: 'Internal server error',
      message: error.message,
    }, 500, env);
  }
}