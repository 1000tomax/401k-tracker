/**
 * Check Plaid environment and credentials
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

console.log('🔍 Plaid Configuration\n');
console.log('═'.repeat(80));
console.log(`\nEnvironment: ${process.env.PLAID_ENV || 'not set'}`);
console.log(`Client ID: ${process.env.PLAID_CLIENT_ID ? process.env.PLAID_CLIENT_ID.substring(0, 10) + '...' : 'not set'}`);
console.log(`Secret: ${process.env.PLAID_SECRET ? process.env.PLAID_SECRET.substring(0, 10) + '...' : 'not set'}`);
console.log(`Products: ${process.env.PLAID_PRODUCTS || 'auth,transactions,investments'}`);
console.log(`\n💡 Check your Plaid dashboard at: https://dashboard.plaid.com/activity`);
console.log(`   Make sure you're viewing the "${process.env.PLAID_ENV || 'production'}" environment`);
console.log('\n' + '═'.repeat(80));