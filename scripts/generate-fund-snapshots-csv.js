/**
 * Generate Fund Snapshots CSV
 *
 * Reads holdings_snapshots from Supabase and generates a CSV file
 * with fund-level snapshots (aggregated across accounts).
 *
 * Usage: node scripts/generate-fund-snapshots-csv.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
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

async function generateFundSnapshotsCsv() {
  console.log('📊 Generating fund snapshots CSV...\n');

  try {
    // Get all holdings snapshots
    const { data: holdings, error } = await supabase
      .from('holdings_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true });

    if (error) throw error;

    if (!holdings || holdings.length === 0) {
      console.error('❌ No holdings snapshots found');
      process.exit(1);
    }

    console.log(`Found ${holdings.length} holding records`);

    // Group by date
    const dateGroups = {};
    for (const holding of holdings) {
      const date = holding.snapshot_date;
      if (!dateGroups[date]) {
        dateGroups[date] = [];
      }
      dateGroups[date].push(holding);
    }

    const dates = Object.keys(dateGroups).sort();
    console.log(`Processing ${dates.length} unique dates\n`);

    // Generate fund snapshots
    const fundSnapshots = [];

    for (const date of dates) {
      const holdings = dateGroups[date];

      // Aggregate by fund
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

      // Create fund snapshot records for this date
      for (const fund of Object.values(fundAggregates)) {
        const avgCostPerShare = fund.shares > 0 ? fund.cost_basis / fund.shares : 0;
        const gainLoss = fund.market_value - fund.cost_basis;
        const gainLossPercent = fund.cost_basis > 0 ? (gainLoss / fund.cost_basis) * 100 : 0;

        fundSnapshots.push({
          snapshot_date: date,
          snapshot_time: new Date().toISOString(),
          ticker: fund.ticker,
          fund_name: fund.fund_name,
          shares: fund.shares.toFixed(8),
          cost_basis: fund.cost_basis.toFixed(2),
          market_value: fund.market_value.toFixed(2),
          avg_cost_per_share: avgCostPerShare.toFixed(8),
          current_price: fund.current_price.toFixed(8),
          gain_loss: gainLoss.toFixed(2),
          gain_loss_percent: gainLossPercent.toFixed(4),
          created_at: new Date().toISOString(),
        });
      }

      console.log(`  ${date}: ${Object.keys(fundAggregates).length} funds (${Object.keys(fundAggregates).join(', ')})`);
    }

    console.log(`\n✅ Generated ${fundSnapshots.length} fund snapshot records\n`);

    // Generate CSV
    const csvHeaders = [
      'snapshot_date',
      'snapshot_time',
      'ticker',
      'fund_name',
      'shares',
      'cost_basis',
      'market_value',
      'avg_cost_per_share',
      'current_price',
      'gain_loss',
      'gain_loss_percent',
      'created_at',
    ];

    const csvRows = fundSnapshots.map(snapshot => {
      return csvHeaders.map(header => {
        const value = snapshot[header];
        // Escape commas and quotes in strings
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    const csv = [csvHeaders.join(','), ...csvRows].join('\n');

    // Write to file
    const outputPath = join(__dirname, '..', 'fund_snapshots.csv');
    writeFileSync(outputPath, csv, 'utf-8');

    console.log(`📄 CSV file saved to: fund_snapshots.csv`);
    console.log(`\n📝 To import:`);
    console.log(`   1. Go to Supabase dashboard`);
    console.log(`   2. Open the fund_snapshots table`);
    console.log(`   3. Click "Insert" → "Import data from CSV"`);
    console.log(`   4. Upload fund_snapshots.csv`);
    console.log(`   5. Match columns and import\n`);

  } catch (error) {
    console.error('\n❌ Failed to generate CSV:', error.message);
    process.exit(1);
  }
}

generateFundSnapshotsCsv();
