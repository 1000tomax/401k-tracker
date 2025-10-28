/**
 * Import fund_snapshots.csv into Supabase
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read CSV file
const csvPath = join(__dirname, '..', 'fund_snapshots.csv');
const csvContent = readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

// Skip header
const dataLines = lines.slice(1);

console.log(`Found ${dataLines.length} records to import`);

// Generate INSERT statements (batch them in groups of 50 for performance)
const batchSize = 50;
const batches = [];

for (let i = 0; i < dataLines.length; i += batchSize) {
  const batch = dataLines.slice(i, i + batchSize);
  const values = batch.map(line => {
    const parts = line.split(',');
    return `(
      '${parts[0]}',
      '${parts[1]}',
      '${parts[2]}',
      '${parts[3]}',
      ${parts[4]},
      ${parts[5]},
      ${parts[6]},
      ${parts[7]},
      ${parts[8]},
      ${parts[9]},
      ${parts[10]},
      '${parts[11]}'
    )`;
  }).join(',\n    ');

  const sql = `INSERT INTO fund_snapshots (
    snapshot_date,
    snapshot_time,
    ticker,
    fund_name,
    shares,
    cost_basis,
    market_value,
    avg_cost_per_share,
    current_price,
    gain_loss,
    gain_loss_percent,
    created_at
  ) VALUES
    ${values};`;

  batches.push(sql);
}

// Write SQL file
const sqlPath = join(__dirname, '..', 'import_fund_snapshots.sql');
const fullSql = batches.join('\n\n');
writeFileSync(sqlPath, fullSql, 'utf-8');

console.log(`✅ Generated SQL file: import_fund_snapshots.sql`);
console.log(`   ${batches.length} batches, ${dataLines.length} total records`);
