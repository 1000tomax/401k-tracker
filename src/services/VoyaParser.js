/**
 * Voya Data Parser
 * Parses copy-pasted text from Voya website to extract account information
 */

class VoyaParser {
  /**
   * Parse pasted Voya data containing fund balances and source balances
   * @param {string} pastedText - Raw text copied from Voya website
   * @returns {object} Parsed account data with holdings and sources
   */
  parse(pastedText) {
    try {
      console.log('🔍 VoyaParser: Starting parse of pasted data');

      const result = {
        timestamp: new Date().toISOString(),
        account: {
          name: 'AUTOMATED HEALTH SYSTEMS 401(K) RETIREMENT PLAN',
          type: '401k',
          balance: 0
        },
        holdings: [],
        sources: []
      };

      // Parse fund balances section
      const holdings = this.parseFundBalances(pastedText);
      if (holdings.length > 0) {
        result.holdings = holdings;
        // Calculate total balance from holdings
        result.account.balance = holdings.reduce((sum, h) => sum + h.value, 0);
      }

      // Parse source balances section
      const sources = this.parseSourceBalances(pastedText);
      if (sources.length > 0) {
        result.sources = sources;
        // If we didn't get balance from holdings, use source total
        if (result.account.balance === 0) {
          result.account.balance = sources.reduce((sum, s) => sum + s.balance, 0);
        }
      }

      // Validation
      if (result.holdings.length === 0 && result.sources.length === 0) {
        throw new Error('No valid data found in pasted text. Please make sure you copied the fund balances and source balances sections.');
      }

      console.log('✅ VoyaParser: Parse successful', {
        balance: result.account.balance,
        holdings: result.holdings.length,
        sources: result.sources.length
      });

      return result;
    } catch (error) {
      console.error('❌ VoyaParser: Parse failed:', error);
      throw error;
    }
  }

  /**
   * Parse fund balances section
   * Example format:
   * "0899 Vanguard 500 Index Fund Adm: 100%"
   * "$ 39.17	184.44	$7,224.90"
   */
  parseFundBalances(text) {
    const holdings = [];

    try {
      // Pattern to match fund lines like "0899 Vanguard 500 Index Fund Adm: 100%"
      const fundNamePattern = /(\d{4})\s+([^:]+):\s*(\d+(?:\.\d+)?)%/g;

      // Pattern to match value lines like "$ 39.17	184.44	$7,224.90"
      // More flexible to handle various spacing/tabs
      const valuePattern = /\$\s*([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+\$\s*([\d,]+\.?\d*)/g;

      const fundMatches = [...text.matchAll(fundNamePattern)];
      const valueMatches = [...text.matchAll(valuePattern)];

      // Match funds with their values
      for (let i = 0; i < fundMatches.length && i < valueMatches.length; i++) {
        const fundMatch = fundMatches[i];
        const valueMatch = valueMatches[i];

        const fundCode = fundMatch[1];
        const fundName = fundMatch[2].trim();
        const percentage = parseFloat(fundMatch[3]);

        const price = parseFloat(valueMatch[1].replace(/,/g, ''));
        const shares = parseFloat(valueMatch[2].replace(/,/g, ''));
        const value = parseFloat(valueMatch[3].replace(/,/g, ''));

        // Map fund names to tickers (we know VFIAX, can add more)
        let ticker = 'UNKNOWN';
        if (fundName.toLowerCase().includes('vanguard 500') || fundName.toLowerCase().includes('vfiax')) {
          ticker = 'VFIAX';
        }

        holdings.push({
          fundCode,
          name: fundName,
          ticker,
          shares,
          price,
          value,
          percentage
        });

        console.log(`✅ VoyaParser: Found holding: ${ticker} - ${shares} shares @ $${price} = $${value}`);
      }
    } catch (error) {
      console.warn('⚠️ VoyaParser: Error parsing fund balances:', error);
    }

    return holdings;
  }

  /**
   * Parse source balances section
   * Example format:
   * "Employee PreTax"
   * "$ 4,161.19	$ 4,161.19"
   * "ROTH"
   * "$ 74.14	$ 74.14"
   */
  parseSourceBalances(text) {
    const sources = [];

    try {
      // Common source names to look for
      const sourcePatterns = [
        { pattern: /Employee PreTax/i, name: 'Employee PreTax' },
        { pattern: /ROTH/i, name: 'ROTH' },
        { pattern: /Safe Harbor Match/i, name: 'Safe Harbor Match' },
        { pattern: /Employer Match/i, name: 'Employer Match' },
        { pattern: /Profit Sharing/i, name: 'Profit Sharing' }
      ];

      for (const { pattern, name } of sourcePatterns) {
        const match = text.match(pattern);
        if (match) {
          // Find the dollar amount after this source name
          const startIndex = match.index + match[0].length;
          const remainingText = text.substring(startIndex);

          // Look for dollar amount pattern: $ 4,161.19 or $4,161.19
          const amountMatch = remainingText.match(/\$\s*([\d,]+\.?\d*)/);

          if (amountMatch) {
            const balance = parseFloat(amountMatch[1].replace(/,/g, ''));
            sources.push({ name, balance });
            console.log(`✅ VoyaParser: Found source: ${name} = $${balance}`);
          }
        }
      }

      // Alternative pattern: try to find "Source Name" followed by amounts
      // Pattern like: "Employee PreTax\n$ 4,161.19	$ 4,161.19"
      const linePattern = /(Employee PreTax|ROTH|Safe Harbor Match|Employer Match|Profit Sharing)\s*\n?\s*\$\s*([\d,]+\.?\d*)/gi;
      const lineMatches = [...text.matchAll(linePattern)];

      for (const match of lineMatches) {
        const sourceName = match[1];
        const balance = parseFloat(match[2].replace(/,/g, ''));

        // Check if we already have this source
        const existing = sources.find(s => s.name === sourceName);
        if (!existing) {
          sources.push({ name: sourceName, balance });
          console.log(`✅ VoyaParser: Found source (alt): ${sourceName} = $${balance}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ VoyaParser: Error parsing source balances:', error);
    }

    return sources;
  }

  /**
   * Validate parsed data
   */
  validate(parsedData) {
    if (!parsedData.account || !parsedData.account.balance) {
      throw new Error('No balance found in parsed data');
    }

    if (parsedData.account.balance <= 0) {
      throw new Error('Invalid balance: must be greater than 0');
    }

    if (parsedData.holdings.length === 0 && parsedData.sources.length === 0) {
      throw new Error('No holdings or sources found in parsed data');
    }

    return true;
  }
}

export default new VoyaParser();
