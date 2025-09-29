#!/usr/bin/env node
/**
 * Test database connectivity and endpoints
 * Run with: node scripts/test-database.js
 */

import 'dotenv/config';

const API_URL = process.env.API_URL || 'http://localhost:5173';
const AUTH_TOKEN = process.env.VITE_401K_TOKEN || process.env.API_SHARED_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ No auth token found. Set VITE_401K_TOKEN or API_SHARED_TOKEN in .env.local');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

async function testEndpoint(name, url, options = {}) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`   URL: ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`   ✅ Success (${response.status})`);
      console.log(`   Response:`, JSON.stringify(data, null, 2).slice(0, 500));
      return { success: true, data };
    } else {
      console.log(`   ❌ Failed (${response.status})`);
      console.log(`   Error:`, data);
      return { success: false, error: data };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 401K Tracker Database Tests');
  console.log('================================\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Auth Token: ${AUTH_TOKEN.substring(0, 20)}...`);

  const results = [];

  // Test 1: Check migration status
  results.push(
    await testEndpoint(
      'Migration Status',
      `${API_URL}/api/db/migrate`,
      { method: 'POST' }
    )
  );

  // Test 2: Get connections
  results.push(
    await testEndpoint(
      'Get Plaid Connections',
      `${API_URL}/api/db/plaid/get-connections`,
      { method: 'GET' }
    )
  );

  // Test 3: List transactions (first 5)
  results.push(
    await testEndpoint(
      'List Transactions',
      `${API_URL}/api/db/transactions/list?limit=5`,
      { method: 'GET' }
    )
  );

  // Test 4: Dry run data migration
  results.push(
    await testEndpoint(
      'Data Migration (Dry Run)',
      `${API_URL}/api/db/migrate-data`,
      {
        method: 'POST',
        body: JSON.stringify({ dryRun: true }),
      }
    )
  );

  // Summary
  console.log('\n\n📊 Test Summary');
  console.log('================================');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📝 Total:  ${results.length}`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
    console.log('💡 Make sure:');
    console.log('   1. Dev server is running (npm run dev)');
    console.log('   2. Supabase schema is migrated');
    console.log('   3. Environment variables are set correctly');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! Database is ready to use.');
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});