-- Update existing dividends with correct ticker symbols based on CUSIP
-- This is a one-time fix for the dividends that were imported with CUSIPs instead of tickers

UPDATE dividends
SET fund = 'DES'
WHERE fund = '97717W604';

UPDATE dividends
SET fund = 'SCHD'
WHERE fund = '808524797';

UPDATE dividends
SET fund = 'PCY'
WHERE fund = '46138E784';

UPDATE dividends
SET fund = 'AVUV'
WHERE fund = '025072877';

UPDATE dividends
SET fund = 'VWO'
WHERE fund = '922042858';

-- Also update metadata to include ticker for future reference
UPDATE dividends
SET metadata = jsonb_set(metadata, '{security_ticker}', '"DES"')
WHERE security_id = '97717W604';

UPDATE dividends
SET metadata = jsonb_set(metadata, '{security_ticker}', '"SCHD"')
WHERE security_id = '808524797';

UPDATE dividends
SET metadata = jsonb_set(metadata, '{security_ticker}', '"PCY"')
WHERE security_id = '46138E784';

UPDATE dividends
SET metadata = jsonb_set(metadata, '{security_ticker}', '"AVUV"')
WHERE security_id = '025072877';

UPDATE dividends
SET metadata = jsonb_set(metadata, '{security_ticker}', '"VWO"')
WHERE security_id = '922042858';
