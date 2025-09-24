/**
 * Plaid Webhook Endpoint
 * Receives notifications about account events, transactions, and other updates
 */

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
    // For now, just log and acknowledge

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