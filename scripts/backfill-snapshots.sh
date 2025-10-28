#!/bin/bash
# Backfill historical portfolio snapshots

set -e

# Configuration
API_URL="${API_URL:-https://401k.mreedon.com}"
API_TOKEN="${API_TOKEN:-$VITE_401K_TOKEN}"

if [ -z "$API_TOKEN" ]; then
  echo "Error: API_TOKEN not set"
  echo "Usage: API_TOKEN=your_token ./scripts/backfill-snapshots.sh"
  exit 1
fi

echo "📸 Starting portfolio snapshot backfill..."
echo "API URL: $API_URL"
echo ""

# Call backfill endpoint
response=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/api/snapshots/backfill" \
  -H "X-401K-Token: $API_TOKEN" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

echo "Response:"
echo "$body" | jq '.'

if [ "$http_code" -eq 200 ]; then
  echo ""
  echo "✅ Backfill completed successfully"

  # Extract summary
  created=$(echo "$body" | jq -r '.created')
  errors=$(echo "$body" | jq -r '.errors')
  skipped=$(echo "$body" | jq -r '.skipped')
  total=$(echo "$body" | jq -r '.total')

  echo ""
  echo "Summary:"
  echo "  - Created: $created snapshots"
  echo "  - Skipped: $skipped (already exist)"
  echo "  - Errors: $errors"
  echo "  - Total dates: $total"
  echo ""
  echo "Your portfolio timeline graph will now show daily values!"
else
  echo ""
  echo "❌ Backfill failed with status $http_code"
  exit 1
fi
