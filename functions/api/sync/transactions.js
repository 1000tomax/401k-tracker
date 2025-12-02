/**
 * @file functions/api/sync/transactions.js
 * @description This Cloudflare Worker is the main endpoint for synchronizing investment
 * transactions from Plaid. It is triggered to fetch recent transactions for all connected
 * accounts, process them, and store them in the database.
 */
import { initializePlaidClient } from '../../../src/lib/plaidConfig.js';
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';
import { decryptJson } from '../../../src/lib/encryption.js';
import {
  generateTransactionHash,
  generateDividendHash,
  shouldImportTransaction,
} from '../../../src/utils/transactionSync.js';

/**
 * Handles POST requests to trigger a transaction sync. This function iterates through all
 * connected Plaid accounts, fetches new transactions, and saves them to the database.
 * The process involves three main passes:
 * 1. Save all raw, unfiltered transactions from Plaid.
 * 2. Specifically identify and save dividend transactions.
 * 3. Save filtered buy/sell transactions for portfolio tracking.
 *
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response summarizing the sync operation.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const supabase = createSupabaseAdmin(env);
    const { plaidClient } = initializePlaidClient(env);

    // Get all active Plaid connections
    const { data: connections, error: dbError } = await supabase
      .from('plaid_connections')
      .select('*');

    if (dbError) throw dbError;

    if (!connections || connections.length === 0) {
      return jsonResponse({
        ok: true,
        message: 'No Plaid connections found',
        synced: 0,
      }, 200, env);
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 PLAID TRANSACTION SYNC');
    console.log('='.repeat(80));
    console.log(`Connections to process: ${connections.length}`);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log(`Date range: ${startDate} to ${endDate}`);
    console.log('='.repeat(80) + '\n');

    let totalTransactions = 0;
    let totalImported = 0;
    let totalDuplicates = 0;
    let totalDividends = 0;
    let totalDividendsDuplicates = 0;
    const errors = [];
    const results = [];

    for (const connection of connections) {
      try {
        console.log('\n' + '-'.repeat(80));
        console.log(`🏦 INSTITUTION: ${connection.institution_name}`);
        console.log('-'.repeat(80));

        // SECURITY: Decrypt the access token before using it
        const decryptedData = await decryptJson(connection.access_token, env);
        const accessToken = decryptedData.token;

        // Fetch investment transactions from Plaid
        const response = await plaidClient.investmentsTransactionsGet({
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
        });

        const { investment_transactions, accounts, securities } = response.data;

        console.log(`📥 Received: ${investment_transactions.length} raw transactions`);
        console.log(`📋 Accounts: ${accounts.length} | Securities: ${securities.length}`);

        // Show security symbols for quick verification
        const symbols = securities.map(s => s.ticker_symbol).filter(Boolean).join(', ');
        if (symbols) {
          console.log(`🏷️  Symbols: ${symbols}`);
        }

        // Transaction type breakdown
        const typeBreakdown = {};
        investment_transactions.forEach(tx => {
          const key = `${tx.type || 'null'}/${tx.subtype || 'null'}`;
          typeBreakdown[key] = (typeBreakdown[key] || 0) + 1;
        });
        console.log(`\n📊 Transaction Types:`);
        Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
          console.log(`   ${type.padEnd(30)} ${count.toString().padStart(3)}`);
        });

        let connectionImported = 0;
        let connectionDuplicates = 0;
        let connectionFiltered = 0;
        let rawTransactionsSaved = 0;
        let dividendsImported = 0;
        let dividendsDuplicates = 0;

        // Create lookup maps
        const securitiesMap = new Map(securities.map(sec => [sec.security_id, sec]));
        const accountsMap = new Map(accounts.map(acc => [acc.account_id, acc]));

        console.log(`\n💾 Processing Stages:`);

        // Check for dividend transactions
        const dividendTxs = investment_transactions.filter(tx =>
          tx.type === 'cash' && tx.subtype === 'dividend'
        );
        console.log(`   Stage 1: Saving ${investment_transactions.length} raw transactions...`);
        console.log(`   Stage 2: Processing ${dividendTxs.length} dividend transactions...`);

        // Prepare batch of raw transactions to insert
        const rawTxToInsert = [];
        for (const plaidTx of investment_transactions) {
          const security = securitiesMap.get(plaidTx.security_id);
          const account = accountsMap.get(plaidTx.account_id);

          // Skip if no account (always required)
          if (!account) continue;

          // For dividends, security_id is often null, so we'll extract CUSIP from name field later
          // For non-dividends, require a security
          const isDividend = plaidTx.type === 'cash' && plaidTx.subtype === 'dividend';
          if (!security && !isDividend) continue;

          rawTxToInsert.push({
            plaid_transaction_id: plaidTx.investment_transaction_id,
            plaid_account_id: plaidTx.account_id,
            plaid_security_id: plaidTx.security_id,
            source_connection_id: connection.item_id,
            institution_name: connection.institution_name,
            account_name: account.name,
            date: plaidTx.date,
            type: plaidTx.type,
            subtype: plaidTx.subtype,
            security_symbol: security?.ticker_symbol || null,
            security_name: security?.name || null,
            security_cusip: security?.cusip || null,
            quantity: plaidTx.quantity,
            price: plaidTx.price,
            amount: plaidTx.amount,
            fees: plaidTx.fees || 0,
            currency_code: plaidTx.iso_currency_code || 'USD',
            raw_json: plaidTx,
            imported_at: new Date().toISOString(),
          });
        }

        // Batch insert raw transactions
        if (rawTxToInsert.length > 0) {
          const { error: rawError } = await supabase
            .from('raw_plaid_transactions')
            .upsert(rawTxToInsert, {
              onConflict: 'plaid_transaction_id',
              ignoreDuplicates: false,
            });

          if (rawError) {
            console.error(`❌ Error batch inserting raw transactions:`, rawError.message);
          } else {
            rawTransactionsSaved = rawTxToInsert.length;
          }
        }

        console.log(`✅ Saved ${rawTransactionsSaved} raw transactions`);

        // Second pass: Extract and save dividends (separate from buy/sell transactions)
        console.log(`💰 Processing dividends...`);

        // Pre-load security lookup table to avoid subrequest limit
        const { data: securityLookups } = await supabase
          .from('security_lookup')
          .select('cusip, ticker_symbol, security_name');

        const cusipLookupMap = new Map(
          (securityLookups || []).map(s => [s.cusip, s])
        );
        console.log(`📋 Loaded ${cusipLookupMap.size} securities from lookup table`);

        const dividendsToInsert = [];

        for (const plaidTx of investment_transactions) {
          const account = accountsMap.get(plaidTx.account_id);
          if (!account) continue;

          // Check if this is a dividend transaction
          const txType = plaidTx.type?.toLowerCase();
          const txName = plaidTx.name?.toLowerCase() || '';
          const isDividend = ['dividend', 'cash'].includes(txType) || txName.includes('dividend');

          if (!isDividend) continue;

          // Get security - for dividends, security_id might be in description instead
          let security = securitiesMap.get(plaidTx.security_id);
          let extractedCusip = null;

          // If no security but transaction name has CUSIP, try to extract it
          if (!security && plaidTx.name) {
            // M1 Finance format: "Dividend of 97717W604 $0.09 received. - DIVIDEND"
            // Extract CUSIP (9 characters: 8 alphanumeric + 1 check digit)
            const cusipMatch = plaidTx.name.match(/\b([0-9]{3}[0-9A-Z]{5}[0-9])\b/);
            if (cusipMatch) {
              extractedCusip = cusipMatch[1];
              console.log(`📍 Extracted CUSIP from dividend: ${extractedCusip}`);

              // Try to find security by CUSIP
              for (const [secId, sec] of securitiesMap) {
                if (sec.cusip === extractedCusip) {
                  security = sec;
                  console.log(`✅ Matched CUSIP ${extractedCusip} to security: ${sec.ticker_symbol}`);
                  break;
                }
              }

              if (!security) {
                console.log(`❌ Could not match CUSIP ${extractedCusip} to any security in the list`);
              }
            }

            // If still no match, try ticker symbol
            if (!security) {
              for (const [secId, sec] of securitiesMap) {
                if (sec.ticker_symbol && plaidTx.name.toLowerCase().includes(sec.ticker_symbol.toLowerCase())) {
                  security = sec;
                  console.log(`✅ Matched ticker to security: ${sec.ticker_symbol}`);
                  break;
                }
              }
            }
          }

          // If we still can't identify the security from Plaid data, try our lookup table
          let tickerFromLookup = null;
          if (!security && extractedCusip) {
            const lookupResult = cusipLookupMap.get(extractedCusip);
            if (lookupResult) {
              tickerFromLookup = lookupResult.ticker_symbol;
              console.log(`✅ Found ticker from lookup table: ${extractedCusip} -> ${tickerFromLookup}`);
            }
          }

          // If we still can't identify the security, log warning but continue
          // We'll use the extracted CUSIP for the record
          if (!security && !extractedCusip && !tickerFromLookup) {
            console.warn(`⚠️ Dividend without identifiable security or CUSIP: ${plaidTx.name}`);
            continue;
          }

          // Create dividend record
          const fundName = security?.ticker_symbol || tickerFromLookup || extractedCusip || 'Unknown';
          const dividend = {
            date: plaidTx.date,
            fund: fundName,
            account: account.name,
            amount: Math.abs(parseFloat(plaidTx.amount) || 0),
          };

          // Generate hash for deduplication
          const dividendHash = generateDividendHash(dividend);

          dividendsToInsert.push({
            date: dividend.date,
            fund: dividend.fund,
            account: dividend.account,
            amount: dividend.amount,
            source_type: 'plaid',
            source_id: connection.item_id,
            plaid_transaction_id: plaidTx.investment_transaction_id,
            plaid_account_id: plaidTx.account_id,
            security_id: security?.cusip || extractedCusip || plaidTx.security_id,
            security_type: security?.type || 'etf',
            dividend_type: 'ordinary',
            dividend_hash: dividendHash,
            imported_at: new Date().toISOString(),
            metadata: {
              institution: connection.institution_name,
              security_ticker: security?.ticker_symbol || tickerFromLookup || null,
              security_name: security?.name || null,
              security_cusip: extractedCusip || null,
              fees: plaidTx.fees || 0,
              original_type: plaidTx.type,
              original_name: plaidTx.name,
            },
          });
        }

        // Query existing dividends to identify duplicates
        if (dividendsToInsert.length > 0) {
          // Get list of plaid_transaction_ids we're trying to insert
          const plaidDivIds = dividendsToInsert.map(div => div.plaid_transaction_id);

          // Query for existing dividends
          const { data: existingDivs, error: divQueryError } = await supabase
            .from('dividends')
            .select('plaid_transaction_id')
            .in('plaid_transaction_id', plaidDivIds);

          if (divQueryError) {
            console.error('Error querying existing dividends:', divQueryError);
          }

          // Create set of existing IDs for fast lookup
          const existingDivIds = new Set((existingDivs || []).map(div => div.plaid_transaction_id));

          // Separate new from duplicate dividends
          const newDividends = dividendsToInsert.filter(div => !existingDivIds.has(div.plaid_transaction_id));
          const duplicateDivCount = dividendsToInsert.length - newDividends.length;

          dividendsDuplicates = duplicateDivCount;
          dividendsImported = newDividends.length;

          // Only insert new dividends
          if (newDividends.length > 0) {
            const { error: divError } = await supabase
              .from('dividends')
              .insert(newDividends);

            if (divError) {
              console.error('Error batch saving dividends:', divError);
            }
          }
        }

        console.log(`✅ Dividends: ${dividendsImported} new, ${dividendsDuplicates} duplicates`);

        // Third pass: Process buy/sell transactions with filtering for main table
        const transactionsToInsert = [];

        for (const plaidTx of investment_transactions) {
          const security = securitiesMap.get(plaidTx.security_id);
          const account = accountsMap.get(plaidTx.account_id);

          if (!security || !account) continue;

          // Convert to app format
          const activity = plaidTx.type === 'buy' || plaidTx.type === 'purchase' ? 'Purchased' :
                          plaidTx.type === 'sell' ? 'Sold' : plaidTx.type;

          const rawUnits = parseFloat(plaidTx.quantity) || 0;
          const rawAmount = parseFloat(plaidTx.amount) || 0;
          const isSell = activity === 'Sold';

          const transaction = {
            date: plaidTx.date,
            fund: security.ticker_symbol || security.name,
            moneySource: account.name,
            activity: activity,
            units: isSell ? -Math.abs(rawUnits) : Math.abs(rawUnits),
            unitPrice: parseFloat(plaidTx.price) || 0,
            amount: isSell ? -Math.abs(rawAmount) : Math.abs(rawAmount),
          };

          // Apply account-specific filtering
          if (!shouldImportTransaction(transaction, account.name)) {
            connectionFiltered++;
            continue;
          }

          // Generate hash for deduplication
          const transactionHash = generateTransactionHash(transaction);

          transactionsToInsert.push({
            date: transaction.date,
            fund: transaction.fund,
            money_source: transaction.moneySource,
            activity: transaction.activity,
            units: transaction.units,
            unit_price: transaction.unitPrice,
            amount: transaction.amount,
            source_type: 'plaid',
            source_id: connection.item_id,
            plaid_transaction_id: plaidTx.investment_transaction_id,
            plaid_account_id: plaidTx.account_id,
            transaction_hash: transactionHash,
            imported_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            metadata: {
              institution: connection.institution_name,
              security_id: plaidTx.security_id,
              fees: plaidTx.fees || 0,
            },
          });
        }

        // Query existing transactions to identify duplicates
        // Check BOTH plaid_transaction_id AND transaction_hash to handle re-linked accounts
        if (transactionsToInsert.length > 0) {
          // Get list of plaid_transaction_ids and hashes we're trying to insert
          const plaidTxIds = transactionsToInsert.map(tx => tx.plaid_transaction_id);
          const txHashes = transactionsToInsert.map(tx => tx.transaction_hash);

          // Query for existing transactions by plaid_transaction_id
          const { data: existingByPlaidId, error: queryError1 } = await supabase
            .from('transactions')
            .select('plaid_transaction_id')
            .in('plaid_transaction_id', plaidTxIds);

          if (queryError1) {
            console.error('Error querying existing transactions by plaid_id:', queryError1);
          }

          // Query for existing transactions by transaction_hash (catches re-linked duplicates)
          const { data: existingByHash, error: queryError2 } = await supabase
            .from('transactions')
            .select('transaction_hash')
            .in('transaction_hash', txHashes);

          if (queryError2) {
            console.error('Error querying existing transactions by hash:', queryError2);
          }

          // Create sets for fast lookup
          const existingPlaidIds = new Set((existingByPlaidId || []).map(tx => tx.plaid_transaction_id));
          const existingHashes = new Set((existingByHash || []).map(tx => tx.transaction_hash));

          // Separate new from duplicate transactions (check both ID and hash)
          const newTransactions = transactionsToInsert.filter(tx =>
            !existingPlaidIds.has(tx.plaid_transaction_id) && !existingHashes.has(tx.transaction_hash)
          );
          const duplicateCount = transactionsToInsert.length - newTransactions.length;

          connectionDuplicates = duplicateCount;
          connectionImported = newTransactions.length;

          // Only insert new transactions
          if (newTransactions.length > 0) {
            const { error: insertError } = await supabase
              .from('transactions')
              .insert(newTransactions);

            if (insertError) {
              console.error('Error batch saving transactions:', insertError);
              errors.push({
                institution: connection.institution_name,
                error: insertError.message,
              });
            } else {
              totalImported += connectionImported;
            }
          }

          totalDuplicates += connectionDuplicates;
        }

        totalTransactions += investment_transactions.length;
        totalDividends += dividendsImported;
        totalDividendsDuplicates += dividendsDuplicates;

        // Update last_synced_at for this connection
        await supabase
          .from('plaid_connections')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', connection.id);

        results.push({
          institution: connection.institution_name,
          total_fetched: investment_transactions.length,
          raw_saved: rawTransactionsSaved,
          transactions_imported: connectionImported,
          transactions_duplicates: connectionDuplicates,
          transactions_filtered: connectionFiltered,
          dividends_imported: dividendsImported,
          dividends_duplicates: dividendsDuplicates,
        });

        console.log(`\n✅ RESULTS:`);
        console.log(`   Raw Saved:     ${rawTransactionsSaved.toString().padStart(4)}`);
        console.log(`   Transactions:  ${connectionImported.toString().padStart(4)} imported | ${connectionDuplicates.toString().padStart(3)} duplicates | ${connectionFiltered.toString().padStart(3)} filtered`);
        console.log(`   Dividends:     ${dividendsImported.toString().padStart(4)} imported | ${dividendsDuplicates.toString().padStart(3)} duplicates`);

      } catch (error) {
        console.error(`❌ Error syncing ${connection.institution_name}:`, error.message);
        errors.push({
          institution: connection.institution_name,
          error: error.message,
        });
      }
    }

    // Build formatted summary for both console and response
    const summaryLines = [];
    summaryLines.push('');
    summaryLines.push('='.repeat(80));
    summaryLines.push('📊 PLAID TRANSACTION SYNC SUMMARY');
    summaryLines.push('='.repeat(80));
    summaryLines.push(`Institutions processed:  ${connections.length}`);
    summaryLines.push(`Date range:              ${startDate} to ${endDate}`);
    summaryLines.push('');
    summaryLines.push(`Total raw fetched:       ${totalTransactions.toString().padStart(4)}`);
    summaryLines.push(`Transactions imported:   ${totalImported.toString().padStart(4)}`);
    summaryLines.push(`Transactions duplicates: ${totalDuplicates.toString().padStart(4)}`);
    summaryLines.push(`Dividends imported:      ${totalDividends.toString().padStart(4)}`);
    summaryLines.push(`Dividends duplicates:    ${totalDividendsDuplicates.toString().padStart(4)}`);

    // Per-institution breakdown
    if (results.length > 0) {
      summaryLines.push('');
      summaryLines.push('Per Institution:');
      results.forEach(result => {
        summaryLines.push(`  🏦 ${result.institution}`);
        summaryLines.push(`     Raw saved:      ${result.raw_saved.toString().padStart(4)}`);
        summaryLines.push(`     Transactions:   ${result.transactions_imported.toString().padStart(4)} imported | ${result.transactions_duplicates.toString().padStart(3)} duplicates | ${result.transactions_filtered.toString().padStart(3)} filtered`);
        summaryLines.push(`     Dividends:      ${result.dividends_imported.toString().padStart(4)} imported | ${result.dividends_duplicates.toString().padStart(3)} duplicates`);
      });
    }

    if (errors.length > 0) {
      summaryLines.push('');
      summaryLines.push(`⚠️  Errors: ${errors.length}`);
      errors.forEach(err => {
        summaryLines.push(`   - ${err.institution}: ${err.error}`);
      });
    }

    summaryLines.push('='.repeat(80));
    summaryLines.push('✅ SYNC COMPLETE');
    summaryLines.push('');

    const formattedSummary = summaryLines.join('\n');

    // Log to console
    console.log(formattedSummary);

    return jsonResponse({
      ok: true,
      message: 'Transaction sync complete',
      synced: totalImported,
      total_transactions: totalTransactions,
      transactions_imported: totalImported,
      transactions_duplicates: totalDuplicates,
      dividends_imported: totalDividends,
      dividends_duplicates: totalDividendsDuplicates,
      results,
      errors: errors.length > 0 ? errors : undefined,
      date_range: { start: startDate, end: endDate },
      formatted_summary: formattedSummary,
    }, 200, env);

  } catch (error) {
    console.error('❌ Transaction sync failed:', error);
    return jsonResponse({
      ok: false,
      error: 'Sync failed',
      details: error.message,
    }, 500, env);
  }
}
