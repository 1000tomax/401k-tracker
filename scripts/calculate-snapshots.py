#!/usr/bin/env python3
"""
Calculate portfolio snapshots from transaction data using historical prices
Generates CSV files for upload to Supabase
"""
from datetime import datetime, timedelta
from collections import defaultdict
import csv
import sys

# Historical closing prices (parsed from Yahoo Finance data)
HISTORICAL_PRICES = {
    'VTI': {
        '2025-09-02': 315.99, '2025-09-03': 317.33, '2025-09-04': 320.14,
        '2025-09-05': 319.55, '2025-09-08': 320.57, '2025-09-09': 320.98,
        '2025-09-10': 321.80, '2025-09-11': 324.78, '2025-09-12': 324.31,
        '2025-09-15': 325.89, '2025-09-16': 325.45, '2025-09-17': 325.16,
        '2025-09-18': 327.21, '2025-09-19': 328.44, '2025-09-22': 329.86,
        '2025-09-23': 328.09, '2025-09-24': 326.89, '2025-09-25': 325.14,
        '2025-09-26': 327.18, '2025-09-29': 327.10, '2025-09-30': 328.17,
        '2025-10-01': 329.31, '2025-10-02': 329.79, '2025-10-03': 329.97,
        '2025-10-06': 331.21, '2025-10-07': 329.62, '2025-10-08': 331.81,
        '2025-10-09': 330.66, '2025-10-10': 321.80, '2025-10-13': 326.93,
        '2025-10-14': 326.83, '2025-10-15': 328.38, '2025-10-16': 325.77,
        '2025-10-17': 327.30, '2025-10-20': 330.95, '2025-10-21': 330.91,
        '2025-10-22': 328.90, '2025-10-23': 331.01, '2025-10-24': 333.71,
        '2025-10-27': 337.43, '2025-10-28': 338.51,
    },
    'QQQM': {
        '2025-09-02': 232.85, '2025-09-03': 234.63, '2025-09-04': 236.79,
        '2025-09-05': 237.15, '2025-09-08': 238.28, '2025-09-09': 238.99,
        '2025-09-10': 239.06, '2025-09-11': 240.46, '2025-09-12': 241.50,
        '2025-09-15': 243.60, '2025-09-16': 243.38, '2025-09-17': 242.89,
        '2025-09-18': 245.12, '2025-09-19': 246.79, '2025-09-22': 247.90,
        '2025-09-23': 246.25, '2025-09-24': 245.39, '2025-09-25': 244.33,
        '2025-09-26': 245.37, '2025-09-29': 246.48, '2025-09-30': 247.12,
        '2025-10-01': 248.33, '2025-10-02': 249.33, '2025-10-03': 248.32,
        '2025-10-06': 250.17, '2025-10-07': 248.85, '2025-10-08': 251.71,
        '2025-10-09': 251.41, '2025-10-10': 242.67, '2025-10-13': 247.83,
        '2025-10-14': 246.21, '2025-10-15': 247.88, '2025-10-16': 247.00,
        '2025-10-17': 248.61, '2025-10-20': 251.76, '2025-10-21': 251.69,
        '2025-10-22': 249.26, '2025-10-23': 251.39, '2025-10-24': 254.02,
        '2025-10-27': 258.58, '2025-10-28': 261.02,
    },
    'SCHD': {
        '2025-09-02': 27.84, '2025-09-03': 27.60, '2025-09-04': 27.69,
        '2025-09-05': 27.64, '2025-09-08': 27.44, '2025-09-09': 27.45,
        '2025-09-10': 27.50, '2025-09-11': 27.72, '2025-09-12': 27.48,
        '2025-09-15': 27.34, '2025-09-16': 27.42, '2025-09-17': 27.47,
        '2025-09-18': 27.45, '2025-09-19': 27.33, '2025-09-22': 27.25,
        '2025-09-23': 27.40, '2025-09-24': 27.16, '2025-09-25': 26.99,
        '2025-09-26': 27.21, '2025-09-29': 27.10, '2025-09-30': 27.30,
        '2025-10-01': 27.53, '2025-10-02': 27.34, '2025-10-03': 27.41,
        '2025-10-06': 27.34, '2025-10-07': 27.28, '2025-10-08': 27.18,
        '2025-10-09': 27.00, '2025-10-10': 26.54, '2025-10-13': 26.63,
        '2025-10-14': 26.87, '2025-10-15': 26.78, '2025-10-16': 26.57,
        '2025-10-17': 26.79, '2025-10-20': 26.99, '2025-10-21': 27.07,
        '2025-10-22': 26.99, '2025-10-23': 27.03, '2025-10-24': 27.03,
        '2025-10-27': 27.12, '2025-10-28': 27.03,
    },
    'DES': {
        '2025-09-02': 33.82, '2025-09-03': 33.89, '2025-09-04': 34.36,
        '2025-09-05': 34.38, '2025-09-08': 34.28, '2025-09-09': 33.91,
        '2025-09-10': 33.86, '2025-09-11': 34.49, '2025-09-12': 34.07,
        '2025-09-15': 34.07, '2025-09-16': 33.97, '2025-09-17': 33.98,
        '2025-09-18': 34.54, '2025-09-19': 34.03, '2025-09-22': 34.02,
        '2025-09-23': 34.08, '2025-09-24': 33.90, '2025-09-25': 33.57,
        '2025-09-26': 33.84, '2025-09-29': 33.65, '2025-09-30': 33.68,
        '2025-10-01': 33.70, '2025-10-02': 33.61, '2025-10-03': 33.79,
        '2025-10-06': 33.75, '2025-10-07': 33.49, '2025-10-08': 33.52,
        '2025-10-09': 33.19, '2025-10-10': 32.32, '2025-10-13': 32.91,
        '2025-10-14': 33.55, '2025-10-15': 33.50, '2025-10-16': 32.92,
        '2025-10-17': 33.03, '2025-10-20': 33.55, '2025-10-21': 33.53,
        '2025-10-22': 33.53, '2025-10-23': 33.64, '2025-10-24': 33.89,
        '2025-10-27': 33.74, '2025-10-28': 33.44,
    },
    'VOO': {
        '2025-09-02': 588.71, '2025-09-03': 591.72, '2025-09-04': 596.59,
        '2025-09-05': 594.96, '2025-09-08': 596.50, '2025-09-09': 597.95,
        '2025-09-10': 599.68, '2025-09-11': 604.57, '2025-09-12': 604.44,
        '2025-09-15': 607.59, '2025-09-16': 606.79, '2025-09-17': 606.09,
        '2025-09-18': 608.94, '2025-09-19': 611.78, '2025-09-22': 614.76,
        '2025-09-23': 611.54, '2025-09-24': 609.50, '2025-09-25': 606.59,
        '2025-09-26': 610.16, '2025-09-29': 610.13, '2025-09-30': 612.38,
        '2025-10-01': 614.57, '2025-10-02': 615.25, '2025-10-03': 615.30,
        '2025-10-06': 617.40, '2025-10-07': 615.20, '2025-10-08': 618.77,
        '2025-10-09': 617.10, '2025-10-10': 600.51, '2025-10-13': 609.61,
        '2025-10-14': 608.75, '2025-10-15': 611.43, '2025-10-16': 607.39,
        '2025-10-17': 610.76, '2025-10-20': 617.17, '2025-10-21': 617.09,
        '2025-10-22': 613.97, '2025-10-23': 617.44, '2025-10-24': 622.55,
        '2025-10-27': 630.00, '2025-10-28': 632.72,
    },
}

# Map fund names to ticker symbols
FUND_TICKER_MAP = {
    'VTI': 'VTI',
    'QQQM': 'QQQM',
    'SCHD': 'SCHD',
    'DES': 'DES',
    '0899 Vanguard 500 Index Fund Adm': 'VOO',
}

# Conversion ratio for Voya 0899 fund (matches the ratio in api/prices/refresh.js)
VOYA_CONVERSION_RATIO = 15.577

def get_closing_price(fund_name, date_str):
    """Get the closing price for a fund on a specific date"""
    ticker = FUND_TICKER_MAP.get(fund_name)
    if not ticker:
        print(f"Warning: Unknown fund '{fund_name}'", file=sys.stderr)
        return None

    price = HISTORICAL_PRICES.get(ticker, {}).get(date_str)
    if price is None:
        print(f"Warning: No price data for {ticker} on {date_str}", file=sys.stderr)
        return None

    # Apply Voya conversion ratio for the 0899 fund
    if fund_name == '0899 Vanguard 500 Index Fund Adm':
        price = price / VOYA_CONVERSION_RATIO

    return price

def read_transactions(csv_path):
    """Read transactions from CSV file"""
    transactions = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            transactions.append({
                'date': row['date'],
                'fund': row['fund'],
                'money_source': row['money_source'],
                'activity': row['activity'],
                'units': float(row['units']),
                'unit_price': float(row['unit_price']),
                'amount': float(row['amount']),
            })
    return transactions

def main():
    # Read transactions
    print("Reading transactions from transactions_rows.csv...")
    transactions = read_transactions('transactions_rows.csv')
    print(f"Loaded {len(transactions)} transactions")

    # Group transactions by date
    tx_by_date = defaultdict(list)
    for tx in transactions:
        tx_by_date[tx['date']].append(tx)

    # Determine date range
    all_tx_dates = sorted(tx_by_date.keys())
    start_date = datetime.strptime(all_tx_dates[0], '%Y-%m-%d')
    # End on today or the last date we have prices for
    end_date = datetime.strptime('2025-10-28', '%Y-%m-%d')

    print(f"Generating snapshots from {start_date.date()} to {end_date.date()}")

    # Generate all dates in range
    all_dates = []
    current = start_date
    while current <= end_date:
        all_dates.append(current.strftime('%Y-%m-%d'))
        current += timedelta(days=1)

    # Track positions over time
    positions = {}

    # Prepare CSV outputs
    portfolio_snapshots = []
    holdings_snapshots = []

    # Generate snapshots for each date
    for date in all_dates:
        # Process transactions for this date
        for tx in tx_by_date[date]:
            key = f"{tx['fund']}||{tx['money_source']}"

            if key not in positions:
                positions[key] = {
                    'fund': tx['fund'],
                    'account': tx['money_source'],
                    'shares': 0.0,
                    'cost_basis': 0.0,
                }

            pos = positions[key]
            units = tx['units']
            amount = tx['amount']

            # Update shares and cost basis
            if units > 0:
                # Buy
                purchase_cost = abs(amount)
                pos['cost_basis'] += purchase_cost
                pos['shares'] += units
            elif units < 0 and pos['shares'] > 0:
                # Sell/Fee
                avg_cost = pos['cost_basis'] / pos['shares'] if pos['shares'] > 0 else 0
                cost_reduction = avg_cost * min(abs(units), pos['shares'])
                pos['cost_basis'] = max(0, pos['cost_basis'] - cost_reduction)
                pos['shares'] = max(0, pos['shares'] - abs(units))

        # Now calculate snapshot using historical closing prices
        holdings = []
        total_market_value = 0.0
        total_cost_basis = 0.0

        for pos in positions.values():
            if abs(pos['shares']) < 0.0001:
                continue

            # Get historical closing price for this date
            closing_price = get_closing_price(pos['fund'], date)

            if closing_price is None:
                # No price data for this date, skip this holding
                # But keep the position for future dates
                continue

            market_value = pos['shares'] * closing_price
            gain_loss = market_value - pos['cost_basis']

            total_market_value += market_value
            total_cost_basis += pos['cost_basis']

            holdings.append({
                'snapshot_date': date,
                'fund': pos['fund'],
                'account_name': pos['account'],
                'shares': pos['shares'],
                'unit_price': closing_price,
                'market_value': market_value,
                'cost_basis': pos['cost_basis'],
                'gain_loss': gain_loss,
                'price_source': 'historical',
            })

        # Only create snapshot if we have holdings
        if holdings:
            total_gain_loss = total_market_value - total_cost_basis
            total_gain_loss_pct = (total_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0

            portfolio_snapshots.append({
                'snapshot_date': date,
                'total_market_value': round(total_market_value, 2),
                'total_cost_basis': round(total_cost_basis, 2),
                'total_gain_loss': round(total_gain_loss, 2),
                'total_gain_loss_percent': round(total_gain_loss_pct, 4),
                'snapshot_source': 'backfill',
                'market_status': 'closed',
            })

            holdings_snapshots.extend(holdings)

    # Write portfolio snapshots CSV
    print(f"\nWriting {len(portfolio_snapshots)} portfolio snapshots to portfolio_snapshots.csv...")
    with open('portfolio_snapshots.csv', 'w', newline='', encoding='utf-8') as f:
        if portfolio_snapshots:
            writer = csv.DictWriter(f, fieldnames=portfolio_snapshots[0].keys())
            writer.writeheader()
            writer.writerows(portfolio_snapshots)

    # Write holdings snapshots CSV
    print(f"Writing {len(holdings_snapshots)} holdings snapshots to holdings_snapshots.csv...")
    with open('holdings_snapshots.csv', 'w', newline='', encoding='utf-8') as f:
        if holdings_snapshots:
            writer = csv.DictWriter(f, fieldnames=holdings_snapshots[0].keys())
            writer.writeheader()
            writer.writerows(holdings_snapshots)

    print("\nDone! Summary:")
    print(f"  Date range: {all_dates[0]} to {all_dates[-1]}")
    print(f"  Total days: {len(all_dates)}")
    print(f"  Portfolio snapshots: {len(portfolio_snapshots)}")
    print(f"  Holdings snapshots: {len(holdings_snapshots)}")
    if portfolio_snapshots:
        last_snapshot = portfolio_snapshots[-1]
        print(f"\nFinal portfolio value (as of {last_snapshot['snapshot_date']}):")
        print(f"  Market Value: ${last_snapshot['total_market_value']:,.2f}")
        print(f"  Cost Basis: ${last_snapshot['total_cost_basis']:,.2f}")
        print(f"  Gain/Loss: ${last_snapshot['total_gain_loss']:,.2f} ({last_snapshot['total_gain_loss_percent']:.2f}%)")

if __name__ == '__main__':
    main()
