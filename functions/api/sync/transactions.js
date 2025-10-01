/**
 * Plaid Transaction Sync Endpoint
 * Triggers an immediate sync of Plaid investment transactions
 * Updated to use transaction-based tracking instead of snapshots
 */
import { initializePlaidClient } from '../../../src/lib/plaidConfig.js';
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

// Import filtering logic
function shouldImportTransaction(transaction, accountName) {
  // Match Roth IRA accounts
  const lowerName = (accountName || '').toLowerCase();
  const isRothIRA = lowerName.includes('roth') && lowerName.includes('ira');

  if (isRothIRA) {
    // Roth IRA: Only import specific symbols
    const allowedSymbols = ['VTI', 'DES', 'SCHD', 'QQQM'];
    const symbol = (transaction.fund || '').toUpperCase().trim();

    if (!allowedSymbols.includes(symbol)) {
      return false;
    }

    // Only buy/sell transactions
    const activity = (transaction.activity || '').toUpperCase();
    const isAllowedType = ['PURCHASED', 'SOLD', 'BUY', 'SELL'].some(type =>
      activity.includes(type)
    );

    if (!isAllowedType) {
      return false;
    }

    // Ignore dividends
    if (/dividend/i.test(transaction.activity || '')) {
      return false;
    }

    // Ignore cash transfers
    const isCashTransfer = /transfer|deposit|ach|cash/i.test(transaction.activity || '');
    const hasNoShares = !transaction.units || Math.abs(transaction.units) < 0.0001;
    if (isCashTransfer || hasNoShares) {
      return false;
    }
  }

  // For non-Roth accounts (401k, etc.), import all
  return true;
}

function generateTransactionHash(tx) {
  const data = `${tx.date}|${tx.amount}|${tx.fund?.toLowerCase() || ''}|${tx.activity?.toLowerCase() || ''}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

function generateDividendHash(dividend) {
  const data = `${dividend.date}|${dividend.fund?.toLowerCase() || ''}|${dividend.account?.toLowerCase() || ''}|${dividend.amount}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

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

    console.log(`📊 Transaction sync: Processing ${connections.length} connection(s)`);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let totalTransactions = 0;
    let totalImported = 0;
    let totalDuplicates = 0;
    let totalDividends = 0;
    let totalDividendsDuplicates = 0;
    const errors = [];
    const results = [];

    for (const connection of connections) {
      try {
        console.log(`🔍 Fetching transactions for ${connection.institution_name}`);

        // Fetch investment transactions from Plaid
        const response = await plaidClient.investmentsTransactionsGet({
          access_token: connection.access_token,
          start_date: startDate,
          end_date: endDate,
        });

        const { investment_transactions, accounts, securities } = response.data;

        console.log(`📥 Received ${investment_transactions.length} transactions from ${connection.institution_name}`);

        // Debug: Log ALL transaction types in the raw response
        const typeBreakdown = {};
        investment_transactions.forEach(tx => {
          const key = `${tx.type || 'null'}/${tx.subtype || 'null'}`;
          typeBreakdown[key] = (typeBreakdown[key] || 0) + 1;
        });
        console.log(`📊 Transaction type breakdown:`, JSON.stringify(typeBreakdown, null, 2));

        let connectionImported = 0;
        let connectionDuplicates = 0;
        let connectionFiltered = 0;
        let rawTransactionsSaved = 0;
        let dividendsImported = 0;
        let dividendsDuplicates = 0;

        // Create lookup maps
        const securitiesMap = new Map(securities.map(sec => [sec.security_id, sec]));
        const accountsMap = new Map(accounts.map(acc => [acc.account_id, acc]));

        console.log(`📋 Securities available: ${securities.length} (symbols: ${securities.map(s => s.ticker_symbol).join(', ')})`);
        console.log(`📋 Accounts available: ${accounts.length}`);

        // First pass: Save ALL raw transactions (no filtering)
        console.log(`💾 Saving ${investment_transactions.length} raw transactions...`);

        // Debug: Check for dividend transactions
        const dividendTxs = investment_transactions.filter(tx =>
          tx.type === 'cash' && tx.subtype === 'dividend'
        );
        console.log(`🔍 Found ${dividendTxs.length} dividend transactions in Plaid response`);
        if (dividendTxs.length > 0) {
          console.log('📊 Sample dividend transaction:', JSON.stringify(dividendTxs[0], null, 2));
        }

        for (const plaidTx of investment_transactions) {
          const security = securitiesMap.get(plaidTx.security_id);
          const account = accountsMap.get(plaidTx.account_id);

          // Skip if no account (always required)
          if (!account) {
            console.log(`⚠️ SKIPPING: No account found for tx ${plaidTx.investment_transaction_id}`);
            continue;
          }

          // For dividends, security_id is often null, so we'll extract CUSIP from name field later
          // For non-dividends, require a security
          const isDividend = plaidTx.type === 'cash' && plaidTx.subtype === 'dividend';
          if (!security && !isDividend) {
            console.log(`⚠️ SKIPPING: No security found for non-dividend tx ${plaidTx.investment_transaction_id}`);
            continue;
          }

          // Save raw transaction (upsert to handle duplicates)
          const { error: rawError } = await supabase
            .from('raw_plaid_transactions')
            .upsert({
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
            }, {
              onConflict: 'plaid_transaction_id',
            });

          if (!rawError) {
            rawTransactionsSaved++;
          } else if (rawError.code !== '23505') {
            // Log error if it's not a duplicate key violation
            console.warn(`⚠️ Error saving raw transaction ${plaidTx.investment_transaction_id}:`, rawError.message);
          }
        }

        console.log(`✅ Saved ${rawTransactionsSaved} raw transactions`);

        // Second pass: Extract and save dividends (separate from buy/sell transactions)
        console.log(`💰 Processing dividends...`);
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
            const { data: lookupResult } = await supabase
              .from('security_lookup')
              .select('ticker_symbol, security_name')
              .eq('cusip', extractedCusip)
              .single();

            if (lookupResult) {
              tickerFromLookup = lookupResult.ticker_symbol;
              console.log(`✅ Found ticker from lookup table: ${extractedCusip} -> ${tickerFromLookup}`);
            } else {
              console.log(`⚠️ CUSIP ${extractedCusip} not in lookup table`);
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

        // Batch insert dividends (upsert to handle duplicates)
        if (dividendsToInsert.length > 0) {
          const { data: insertedDivs, error: divError } = await supabase
            .from('dividends')
            .upsert(dividendsToInsert, {
              onConflict: 'plaid_transaction_id',
              ignoreDuplicates: true
            });

          if (divError) {
            console.error('Error batch saving dividends:', divError);
          } else {
            // Supabase doesn't return inserted count on upsert with ignoreDuplicates
            // So we'll assume all were processed
            dividendsImported = dividendsToInsert.length;
          }
        }

        console.log(`✅ Dividends: ${dividendsImported} processed`);

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

        // Batch insert transactions (upsert to handle duplicates)
        if (transactionsToInsert.length > 0) {
          const { data: insertedTxs, error: insertError } = await supabase
            .from('transactions')
            .upsert(transactionsToInsert, {
              onConflict: 'plaid_transaction_id',
              ignoreDuplicates: true
            });

          if (insertError) {
            console.error('Error batch saving transactions:', insertError);
            errors.push({
              institution: connection.institution_name,
              error: insertError.message,
            });
          } else {
            connectionImported = transactionsToInsert.length;
            totalImported += connectionImported;
          }
        }

        totalTransactions += investment_transactions.length;
        totalDuplicates += connectionDuplicates;
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

        console.log(`✅ ${connection.institution_name}: ${rawTransactionsSaved} raw saved, ${connectionImported} txns imported, ${dividendsImported} dividends imported, ${connectionDuplicates} duplicates, ${connectionFiltered} filtered`);

      } catch (error) {
        console.error(`❌ Error syncing ${connection.institution_name}:`, error.message);
        errors.push({
          institution: connection.institution_name,
          error: error.message,
        });
      }
    }

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
