# Import Voya Transactions

Parse and import Voya 401k transaction data that the user has pasted.

## Expected Data Format

The user should paste tab-separated data from the Voya website with these columns:
- **Date** (MM/DD/YYYY format)
- **Activity** (e.g., "Contribution", "Fund Transfer In", "Fee")
- **Fund** (fund name, often starts with "0899 Vanguard 500 Index Fund")
- **Money Source** (e.g., "ROTH", "Safe Harbor Match", "Employee PreTax")
- **# of Units/Shares** (decimal number)
- **Unit/Share Price** (e.g., $39.611)
- **Amount** (e.g., $83.78)

## Instructions

1. **Parse the data**: Extract all transactions from the pasted text
2. **Preview**: Show the user a clear summary:
   - Number of transactions found
   - Date range
   - Breakdown by money source (ROTH, Match, PreTax)
   - Total amount and shares
3. **Confirm**: Ask the user if they want to import these transactions
4. **Import**: If confirmed, use the `voya_import_transactions` MCP tool to insert into Supabase
5. **Summarize**: Report success and show updated portfolio totals

## Example Summary Format

```
Found 2 Voya transactions on 10/21/2025:

• ROTH contribution: 2.115 shares @ $39.611 = $83.78
• Safe Harbor Match: 1.692 shares @ $39.611 = $67.02

Total: 3.807 shares, $150.80

Ready to import these?
```

## Error Handling

If the data doesn't match the expected format:
- Tell the user what went wrong
- Show them what columns are expected
- Suggest they check they copied all columns from Voya

## Duplicate Detection

The MCP tool handles duplicate detection automatically using transaction hashes. If duplicates are found, report:
- How many were new
- How many were duplicates (already existed)
