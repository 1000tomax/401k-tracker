/**
 * Script to check Plaid billing items
 * Usage: node scripts/check-plaid-billing.js
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

async function checkBillingItems() {
  try {
    console.log('🔍 Checking Plaid billing items...\n');

    const { plaidClient } = initializePlaidClient();
    const supabase = createSupabaseAdmin();

    // Get all Plaid connections from the database
    const { data: connections, error: dbError } = await supabase
      .from('plaid_connections')
      .select('*');

    if (dbError) throw dbError;

    if (!connections || connections.length === 0) {
      console.log('ℹ️  No Plaid items found');
      return;
    }

    // Get billing info for each item
    const items = [];
    const errors = [];

    for (const connection of connections) {
      try {
        const response = await plaidClient.itemGet({
          access_token: connection.access_token,
        });

        const item = response.data.item;

        items.push({
          item_id: item.item_id,
          institution_name: connection.institution_name,
          institution_id: connection.institution_id,
          billed_products: item.billed_products || [],
          available_products: item.available_products || [],
          consented_products: item.consented_products || [],
          connected_at: connection.connected_at,
          last_synced_at: connection.last_synced_at,
          accounts: connection.accounts || [],
        });
      } catch (error) {
        errors.push({
          item_id: connection.item_id,
          institution_name: connection.institution_name,
          error: error.message,
        });
      }
    }

    if (items.length === 0) {
      console.log('ℹ️  No Plaid items found');
      return;
    }

    console.log(`📊 Total Plaid Items: ${items.length}\n`);
    console.log('═'.repeat(80));

    items.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.institution_name || 'Unknown Institution'}`);
      console.log('─'.repeat(80));
      console.log(`   Item ID: ${item.item_id}`);
      console.log(`   Institution ID: ${item.institution_id || 'N/A'}`);
      console.log(`   Connected At: ${new Date(item.connected_at).toLocaleString()}`);
      console.log(`   Last Synced: ${new Date(item.last_synced_at).toLocaleString()}`);
      console.log(`   \n   💰 Billed Products: ${item.billed_products.join(', ') || 'None'}`);
      console.log(`   ✅ Available Products: ${item.available_products.join(', ') || 'None'}`);
      console.log(`   📝 Consented Products: ${item.consented_products.join(', ') || 'None'}`);
      console.log(`   \n   🏦 Accounts (${item.accounts.length}):`);
      item.accounts.forEach(acc => {
        console.log(`      - ${acc.name} (${acc.type})`);
      });
    });

    console.log('\n' + '═'.repeat(80));

    if (errors && errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      errors.forEach(err => {
        console.log(`   - ${err.institution_name}: ${err.error}`);
      });
    }

    // Summary
    const totalBilledProducts = items.reduce((acc, item) => {
      item.billed_products.forEach(product => {
        acc[product] = (acc[product] || 0) + 1;
      });
      return acc;
    }, {});

    console.log('\n📈 Billing Summary:');
    Object.entries(totalBilledProducts).forEach(([product, count]) => {
      console.log(`   ${product}: ${count} item(s)`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkBillingItems();