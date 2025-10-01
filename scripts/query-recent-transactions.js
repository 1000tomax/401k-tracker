/**
 * Query Recent Transactions from Supabase
 * Run with: node scripts/query-recent-transactions.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple .env parser
const envPath = join(__dirname, '..', '.env.local');
const envFile = readFileSync(envPath, 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && !key.startsWith('#')) {
    env[key.trim()] = values.join('=').trim();
  }
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Need: SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryRecentTransactions() {
  console.log('🔍 Fetching recent transactions...\n');

  // Get most recent 20 transactions
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
    .limit(20);

  if (error) {
    console.error('❌ Error fetching transactions:', error);
    return;
  }

  if (!transactions || transactions.length === 0) {
    console.log('📭 No transactions found in database');
    return;
  }

  console.log(`✅ Found ${transactions.length} recent transactions:\n`);

  transactions.forEach((tx, index) => {
    console.log(`${index + 1}. ${tx.date} | ${tx.fund}`);
    console.log(`   Activity: ${tx.activity}`);
    console.log(`   Amount: $${tx.amount}`);
    if (tx.units) console.log(`   Units: ${tx.units} @ $${tx.unit_price}`);
    console.log(`   Source: ${tx.source_type}${tx.source_id ? ` (${tx.source_id})` : ''}`);
    console.log('');
  });

  // Get summary stats
  const { data: stats } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  if (stats) {
    console.log(`\n📊 Total transactions in database: ${stats.length || 0}`);
  }

  // Get account count
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*', { count: 'exact', head: true });

  if (accounts) {
    console.log(`📊 Total accounts: ${accounts.length || 0}`);
  }

  // Get connection count
  const { data: connections } = await supabase
    .from('plaid_connections')
    .select('*', { count: 'exact', head: true });

  if (connections) {
    console.log(`📊 Total Plaid connections: ${connections.length || 0}`);
  }
}

queryRecentTransactions();
