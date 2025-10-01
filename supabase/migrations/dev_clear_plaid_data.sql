-- Development helper: Clear all Plaid data for fresh sync testing
-- WARNING: This deletes data! Only use for testing.

-- First, let's see what we're about to delete
SELECT 'BEFORE DELETE - Transactions from Plaid/Roth' as info, COUNT(*) as count
FROM transactions
WHERE source_type = 'plaid' OR account LIKE '%Roth%';

SELECT 'BEFORE DELETE - Raw Plaid transactions' as info, COUNT(*) as count
FROM raw_plaid_transactions;

SELECT 'BEFORE DELETE - Dividends' as info, COUNT(*) as count
FROM dividends;

SELECT 'BEFORE DELETE - Total transactions (including Voya)' as info, COUNT(*) as count
FROM transactions;

-- Clear all raw Plaid transactions (these are all from M1 Finance)
DELETE FROM raw_plaid_transactions;

-- Clear all dividends (these are all from Plaid currently)
DELETE FROM dividends WHERE source_type = 'plaid';

-- Clear only transactions that came from Plaid (keeps manual Voya imports)
DELETE FROM transactions WHERE source_type = 'plaid';

-- Show what's left after deletion
SELECT 'AFTER DELETE - Transactions remaining' as info, COUNT(*) as count FROM transactions
UNION ALL
SELECT 'AFTER DELETE - Raw Plaid transactions remaining', COUNT(*) FROM raw_plaid_transactions
UNION ALL
SELECT 'AFTER DELETE - Dividends remaining', COUNT(*) FROM dividends;
