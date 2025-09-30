/**
 * Verify if the access token in database is actually valid with Plaid
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializePlaidClient } from '../lib/plaidConfig.js';
import { createSupabaseAdmin } from '../src/lib/supabaseAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local file
const envPath = join(__dirname, '..', '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (error) {
  console.error('⚠️  Could not load .env.local file');
}

async function verifyToken() {
  try {
    console.log('🔍 Verifying Plaid access tokens...\n');

    const { plaidClient } = initializePlaidClient();
    const supabase = createSupabaseAdmin();

    const { data: connections, error: dbError } = await supabase
      .from('plaid_connections')
      .select('*');

    if (dbError) throw dbError;

    if (!connections || connections.length === 0) {
      console.log('ℹ️  No connections found in database');
      return;
    }

    for (const connection of connections) {
      console.log(`\n${'═'.repeat(80)}`);
      console.log(`Item ID: ${connection.item_id}`);
      console.log(`Institution: ${connection.institution_name || 'Unknown'}`);
      console.log(`Access Token: ${connection.access_token.substring(0, 20)}...`);
      console.log(`Connected At: ${connection.connected_at || 'Unknown'}`);
      console.log(`Last Synced At: ${connection.last_synced_at || 'Never'}`);

      try {
        // Try to get item info from Plaid
        const itemResponse = await plaidClient.itemGet({
          access_token: connection.access_token,
        });

        console.log(`\n✅ TOKEN IS VALID WITH PLAID`);
        console.log(`   Item ID from Plaid: ${itemResponse.data.item.item_id}`);
        console.log(`   Institution ID: ${itemResponse.data.item.institution_id || 'N/A'}`);
        console.log(`   Billed Products: ${itemResponse.data.item.billed_products?.join(', ') || 'None'}`);
        console.log(`   Available Products: ${itemResponse.data.item.available_products?.join(', ') || 'None'}`);
        console.log(`   Webhook: ${itemResponse.data.item.webhook || 'None'}`);

        if (itemResponse.data.item.error) {
          console.log(`   ⚠️  Item Error: ${JSON.stringify(itemResponse.data.item.error)}`);
        }

        // Try to get institution info
        try {
          const instResponse = await plaidClient.institutionsGetById({
            institution_id: itemResponse.data.item.institution_id,
            country_codes: ['US'],
          });
          console.log(`   Institution Name: ${instResponse.data.institution.name}`);
        } catch (instError) {
          console.log(`   Could not fetch institution name`);
        }

      } catch (error) {
        console.log(`\n❌ TOKEN IS INVALID OR REVOKED`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Error Code: ${error.response?.data?.error_code || 'Unknown'}`);
        console.log(`\n   💡 This token should be removed from your database`);
      }
    }

    console.log(`\n${'═'.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyToken();