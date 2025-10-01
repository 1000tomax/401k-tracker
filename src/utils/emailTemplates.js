/**
 * Email Template Generators
 * Creates HTML and plain text email content for all notification types
 */

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatShortDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Base email styles (dark mode friendly)
const emailStyles = `
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #e2e8f0;
    background-color: #0f172a;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  }
  .header {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    padding: 30px;
    border-radius: 12px 12px 0 0;
    text-align: center;
  }
  .header h1 {
    margin: 0;
    color: #ffffff;
    font-size: 24px;
  }
  .header p {
    margin: 8px 0 0 0;
    color: #e0e7ff;
    font-size: 14px;
  }
  .content {
    background-color: #1e293b;
    padding: 30px;
    border-radius: 0 0 12px 12px;
  }
  .section {
    margin-bottom: 30px;
  }
  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
    margin-bottom: 15px;
    border-bottom: 2px solid #334155;
    padding-bottom: 8px;
  }
  .transaction-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .transaction-item {
    background-color: #334155;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 10px;
  }
  .transaction-account {
    font-weight: 600;
    color: #a5b4fc;
    font-size: 14px;
  }
  .transaction-details {
    color: #cbd5e1;
    font-size: 13px;
    margin-top: 5px;
  }
  .transaction-amount {
    color: #34d399;
    font-weight: 600;
    font-size: 16px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
    margin-top: 20px;
  }
  .stat-card {
    background-color: #334155;
    padding: 15px;
    border-radius: 8px;
  }
  .stat-label {
    font-size: 12px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    margin-top: 5px;
  }
  .stat-value.positive {
    color: #34d399;
  }
  .stat-value.negative {
    color: #f87171;
  }
  .cta-button {
    display: inline-block;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #ffffff;
    text-decoration: none;
    padding: 14px 28px;
    border-radius: 8px;
    font-weight: 600;
    margin-top: 20px;
  }
  .footer {
    text-align: center;
    color: #64748b;
    font-size: 12px;
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid #334155;
  }
  @media (prefers-color-scheme: light) {
    body { background-color: #f8fafc; color: #1e293b; }
    .content { background-color: #ffffff; }
    .header p { color: #ddd6fe; }
    .section-title { color: #0f172a; border-bottom-color: #e2e8f0; }
    .transaction-item { background-color: #f1f5f9; }
    .transaction-account { color: #6366f1; }
    .transaction-details { color: #475569; }
    .stat-card { background-color: #f1f5f9; }
    .stat-label { color: #64748b; }
    .stat-value { color: #0f172a; }
    .footer { color: #94a3b8; border-top-color: #e2e8f0; }
  }
</style>
`;

/**
 * Transaction Summary Email
 */
export function generateTransactionEmail(data) {
  const { recentActivity, portfolio, ytdContributions } = data;

  if (!recentActivity || recentActivity.transactionCount === 0) {
    return null; // No email needed
  }

  const totalAdded = formatCurrency(recentActivity.totalAmount);

  // Build transaction list HTML
  let transactionsHTML = '';
  for (const [account, transactions] of Object.entries(recentActivity.byAccount)) {
    for (const tx of transactions) {
      const amount = formatCurrency(Math.abs(tx.amount));
      const shares = tx.units ? `${tx.units.toFixed(4)} shares` : '';
      const price = tx.unitPrice ? `@ ${formatCurrency(tx.unitPrice)}` : '';

      transactionsHTML += `
        <li class="transaction-item">
          <div class="transaction-account">${account}</div>
          <div class="transaction-details">
            ${tx.fund} ${shares} ${price}
          </div>
          <div class="transaction-amount">+${amount}</div>
        </li>
      `;
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Retirement Contributions</title>
  ${emailStyles}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 New Retirement Contributions</h1>
      <p>${formatDate(new Date().toISOString())}</p>
    </div>
    <div class="content">
      <div class="section">
        <h2 class="section-title">Recent Transactions</h2>
        <ul class="transaction-list">
          ${transactionsHTML}
        </ul>
      </div>

      <div class="section">
        <div class="stat-card" style="text-align: center; padding: 20px;">
          <div class="stat-label">Total Added</div>
          <div class="stat-value positive" style="font-size: 32px;">${totalAdded}</div>
          <div style="color: #94a3b8; font-size: 14px; margin-top: 8px;">
            ${recentActivity.transactionCount} transaction${recentActivity.transactionCount > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="https://401k.mreedon.com" class="cta-button">View Full Dashboard →</a>
      </div>

      <div class="footer">
        <p>401k Tracker • Automated Portfolio Monitoring</p>
        <p>You're receiving this because new transactions were detected in your retirement accounts.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
New Retirement Contributions - ${formatDate(new Date().toISOString())}

Total Added: ${totalAdded}
${recentActivity.transactionCount} transaction${recentActivity.transactionCount > 1 ? 's' : ''}

View your full dashboard at: https://401k.mreedon.com

---
401k Tracker • Automated Portfolio Monitoring
  `;

  return {
    html,
    text,
    subject: `New retirement contributions - ${totalAdded} added`,
  };
}

/**
 * Weekly/Monthly Recap Email
 * (Will expand this later with Claude commentary)
 */
export function generateRecapEmail(data, period = 'weekly', claudeCommentary = null) {
  // TODO: Implement in next phase
  return null;
}

/**
 * Quarterly Projection Email
 * (Will expand this later with retirement projections)
 */
export function generateQuarterlyEmail(data, claudeAnalysis = null) {
  // TODO: Implement in next phase
  return null;
}
