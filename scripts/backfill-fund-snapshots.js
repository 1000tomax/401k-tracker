/**
 * Backfill Fund Snapshots
 *
 * Generates fund-level snapshots from existing holdings_snapshots data.
 * This aggregates holdings by fund (across all accounts) for each snapshot date.
 *
 * Usage: node scripts/backfill-fund-snapshots.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env file manually
const envPath = join(__dirname, '..', '.env');
let SUPABASE_URL, SUPABASE_SERVICE_KEY;

try {
  const envContent = readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'VITE_SUPABASE_URL') SUPABASE_URL = value;
      if (key === 'SUPABASE_SERVICE_KEY') SUPABASE_SERVICE_KEY = value;
    }
  }
} catch (error) {
  console.error('❌ Could not read .env file');
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('   Need: VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function backfillFundSnapshots() {
  console.log('📊 Starting fund snapshots backfill...\n');

  try {
    // Get all unique snapshot dates from holdings_snapshots
    const { data: dates, error: datesError } = await supabase
      .from('holdings_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: true });

    if (datesError) throw datesError;

    const uniqueDates = [...new Set(dates.map(d => d.snapshot_date))];
    console.log(`Found ${uniqueDates.length} unique snapshot dates\n`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const date of uniqueDates) {
      try {
        // Check if fund snapshots already exist for this date
        const { data: existing } = await supabase
          .from('fund_snapshots')
          .select('snapshot_date')
          .eq('snapshot_date', date)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`⏭️  ${date}: Fund snapshots already exist, skipping`);
          skippedCount++;
          continue;
        }

        // Get all holdings for this date
        const { data: holdings, error: holdingsError } = await supabase
          .from('holdings_snapshots')
          .select('*')
          .eq('snapshot_date', date);

        if (holdingsError) throw holdingsError;

        if (!holdings || holdings.length === 0) {
          console.log(`⚠️  ${date}: No holdings found`);
          continue;
        }

        // Aggregate holdings by fund
        const fundAggregates = {};

        for (const holding of holdings) {
          const ticker = holding.fund;
          if (!fundAggregates[ticker]) {
            fundAggregates[ticker] = {
              ticker,
              fund_name: ticker,
              shares: 0,
              cost_basis: 0,
              market_value: 0,
              current_price: parseFloat(holding.unit_price) || 0,
            };
          }

          fundAggregates[ticker].shares += parseFloat(holding.shares) || 0;
          fundAggregates[ticker].cost_basis += parseFloat(holding.cost_basis) || 0;
          fundAggregates[ticker].market_value += parseFloat(holding.market_value) || 0;
          fundAggregates[ticker].current_price = parseFloat(holding.unit_price) || 0;
        }

        // Create fund snapshots
        const fundSnapshots = Object.values(fundAggregates).map(fund => {
          const avgCostPerShare = fund.shares > 0 ? fund.cost_basis / fund.shares : 0;
          const gainLoss = fund.market_value - fund.cost_basis;
          const gainLossPercent = fund.cost_basis > 0 ? (gainLoss / fund.cost_basis) * 100 : 0;

          return {
            snapshot_date: date,
            snapshot_time: new Date().toISOString(),
            ticker: fund.ticker,
            fund_name: fund.fund_name,
            shares: fund.shares,
            cost_basis: fund.cost_basis,
            market_value: fund.market_value,
            avg_cost_per_share: avgCostPerShare,
            current_price: fund.current_price,
            gain_loss: gainLoss,
            gain_loss_percent: gainLossPercent,
          };
        });

        // Insert fund snapshots
        const { error: insertError } = await supabase
          .from('fund_snapshots')
          .insert(fundSnapshots);

        if (insertError) {
          console.error(`❌ ${date}: Failed to insert fund snapshots:`, insertError.message);
          errorCount++;
          continue;
        }

        console.log(`✅ ${date}: Created ${fundSnapshots.length} fund snapshots (${fundSnapshots.map(f => f.ticker).join(', ')})`);
        successCount++;

      } catch (error) {
        console.error(`❌ ${date}: Error processing:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Backfill Summary:');
    console.log(`   ✅ Success: ${successCount} dates`);
    console.log(`   ⏭️  Skipped: ${skippedCount} dates`);
    console.log(`   ❌ Errors: ${errorCount} dates`);

    // Show total fund snapshots created
    const { count } = await supabase
      .from('fund_snapshots')
      .select('*', { count: 'exact', head: true });

    console.log(`\n   Total fund snapshots in database: ${count}`);

  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  }
}

backfillFundSnapshots();
