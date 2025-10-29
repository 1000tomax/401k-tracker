# Voya Transaction Import via MCP Server
## Comprehensive Implementation Plan

**Created**: October 28, 2025
**Updated**: October 28, 2025 (Simplified to Option C)
**Purpose**: Enable Voya 401k transaction imports via Claude Code (desktop) and Claude Chat (mobile) using a custom MCP server

**Chosen Approach**: Option C - Streamlined cloud MCP with explicit commands

---

## ⚡ Implementation Decision: Why Option C?

After review and consideration of Claude Chat's feedback, we chose the **streamlined approach**:

**What Changed from Original Plan:**
- ❌ Skip local MCP version (go straight to cloud)
- ❌ Skip auto-recognition Skill (use explicit `/import-voya` command)
- ✅ Keep cloud MCP server (Cloudflare Worker)
- ✅ Keep mobile access via Claude Chat
- ✅ Keep cleaner Accounts page UI
- ✅ Simpler, faster to build (~85 min vs ~180 min)

**Why This is Better:**
1. **Less Complexity**: One version (cloud), not two (local + cloud)
2. **Clearer UX**: Explicit command (`/import-voya`) vs auto-detection
3. **Still Achieves Goals**: Learning MCP ✓, Portfolio piece ✓, Mobile access ✓
4. **Faster to Ship**: Can validate the concept quickly
5. **No False Positives**: Won't accidentally try to import random CSV data

**Trade-offs We Accepted:**
- User types `/import-voya` instead of auto-magic recognition (but clearer intent!)
- No local-only option (but cloud works everywhere, so who cares?)

---

## Table of Contents
1. [Overview & Motivation](#overview--motivation)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Security Strategy](#security-strategy)
5. [Stage 1: Local MCP (Desktop)](#stage-1-local-mcp-desktop)
6. [Stage 2: Cloud MCP (Mobile)](#stage-2-cloud-mcp-mobile)
7. [User Experience Flows](#user-experience-flows)
8. [File Structure](#file-structure)
9. [Configuration & Setup](#configuration--setup)
10. [Testing Plan](#testing-plan)

---

## Overview & Motivation

### Current State
- Voya 401k transaction data is imported via web form on `/accounts` page
- User copies data from Voya website and pastes into textarea
- Frontend parses and sends to `/api/db/transactions` endpoint
- Works but requires navigating to website

### Goals
1. **Practical**: Import transactions directly in Claude Code/Chat by pasting data
2. **Portfolio Enhancement**: Show off modern AI tooling knowledge for job applications
3. **UI Improvement**: Make `/accounts` page cleaner and more professional
4. **Mobile Support**: Eventually enable imports from phone via Claude Chat

### Why MCP + Skill?
- **MCP Server**: Provides capability (parsing, database access)
- **Claude Skill**: Provides intelligence (auto-recognizes Voya data format)
- **Together**: Seamless experience - just paste data and it works

---

## Architecture

### Stage 1: Local MCP (Desktop Only)
```
┌──────────────────────────────────────────────┐
│  Claude Code (VSCode)                         │
│                                               │
│  ┌─────────────────────────────────────┐     │
│  │ Skill: voya-importer                 │     │
│  │ - Recognizes pasted Voya data        │     │
│  │ - Auto-invokes MCP tools             │     │
│  └─────────────────────────────────────┘     │
│                    ↓                          │
│  ┌─────────────────────────────────────┐     │
│  │ Local MCP Server (stdio)            │     │
│  │ - parse_voya_transactions()          │     │
│  │ - import_voya_transactions()         │     │
│  │ - get_portfolio_summary()            │     │
│  └─────────────────────────────────────┘     │
│                    ↓                          │
│            Reads .env file                    │
│                    ↓                          │
└────────────────────┼───────────────────────────┘
                     ↓
        ┌────────────────────────┐
        │  Supabase Database      │
        │  (via stored creds)     │
        └────────────────────────┘
```

**Characteristics**:
- Runs only when VSCode is open
- Credentials stored in local `.env` file
- No network exposure
- Works on desktop only

### Stage 2: Cloud MCP (Mobile + Desktop)
```
┌─────────────────────────┐      ┌─────────────────────────┐
│ Claude Code (Desktop)    │      │ Claude Chat (Mobile)     │
│ OR                       │      │                          │
│ Claude Chat (Desktop)    │      │                          │
└───────────┬──────────────┘      └───────────┬──────────────┘
            │                                  │
            │    Skill: voya-importer          │
            │    (same skill works everywhere) │
            │                                  │
            └──────────────┬───────────────────┘
                           ↓
            ┌──────────────────────────────────┐
            │ Cloud MCP Server                 │
            │ (Cloudflare Worker)              │
            │                                  │
            │ Auth: Bearer token required      │
            │                                  │
            │ Tools:                           │
            │ - parse_voya_transactions()      │
            │ - import_voya_transactions()     │
            │ - get_portfolio_summary()        │
            └──────────────┬───────────────────┘
                           ↓
            ┌──────────────────────────────────┐
            │ Supabase Database                │
            │ (Worker env vars store creds)    │
            └──────────────────────────────────┘
```

**Characteristics**:
- Always available (24/7 service)
- Works from any device (phone, tablet, desktop)
- Credentials stored in Cloudflare Worker secrets
- Auth token protects endpoint

---

## Components

### 1. Claude Skill
**Location**: `.claude/skills/voya-importer.md`

**Purpose**: Gives Claude context about Voya data format and how to handle it

**Content**:
```markdown
# Voya 401k Transaction Importer

Automatically import Voya 401k transactions when user pastes data.

## Recognition Pattern
Tab-separated data with these columns:
- Date (MM/DD/YYYY)
- Activity (e.g., "Contribution", "Fund Transfer In")
- Fund (fund name, often starts with "0899")
- Money Source (e.g., "ROTH", "Safe Harbor Match", "Employee PreTax")
- # of Units/Shares (decimal number)
- Unit/Share Price ($XX.XXX)
- Amount ($XX.XX)

## Workflow
1. Recognize pasted Voya format
2. Call parse_voya_transactions() to preview
3. Ask user to confirm
4. Call import_voya_transactions() to save
5. Call get_portfolio_summary() for updated totals
6. Report success with friendly summary

## Example Output
"I see 2 transactions on 10/21:
- ROTH contribution: $83.78 (2.115 shares)
- Safe Harbor Match: $67.02 (1.692 shares)
Total: $150.80 (3.807 shares)

Want me to import these?"
```

### 2. Local MCP Server
**Location**: `mcp-servers/voya-importer/server.js`

**Dependencies**:
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "@supabase/supabase-js": "^2.x",
  "dotenv": "^16.x"
}
```

**Tools Provided**:
1. `parse_voya_transactions(text)` - Parse and preview without saving
2. `import_voya_transactions(text)` - Parse and insert to Supabase
3. `get_portfolio_summary()` - Fetch current portfolio totals

**Key Logic**:
- Reuses existing `VoyaParser.js` parsing logic from frontend
- Handles duplicate detection via transaction hash
- Returns structured summaries

### 3. Cloud MCP Server
**Location**: `functions/mcp/voya-importer.js` (Cloudflare Worker)

**Same tools as local**, but:
- Runs as HTTP endpoint instead of stdio
- Requires Bearer token authentication
- Uses Cloudflare Worker secrets for credentials
- Returns JSON responses

**Security Features**:
- Auth token validation on every request
- Rate limiting (future enhancement)
- Audit logging (future enhancement)

### 4. Updated Accounts Page
**Location**: `src/pages/Accounts.jsx`

**Changes**:
- Collapse `VoyaPasteImport` component by default
- Add prominent "Import via Claude Code MCP" section
- Show last import timestamp
- Link to setup instructions
- Professional, clean design

**New UI Structure**:
```
┌─────────────────────────────────────────┐
│ Connected Accounts                       │
├─────────────────────────────────────────┤
│ Plaid Accounts                           │
│ ✓ Roth IRA - Last sync: 2h ago          │
├─────────────────────────────────────────┤
│ Voya 401(k)                              │
│ Last import: Oct 21, 2025               │
│                                          │
│ 🚀 Import via Claude Code                │
│ Just paste transaction data in your      │
│ Claude Code chat - automatic parsing!    │
│                                          │
│ [View Setup Instructions]                │
│                                          │
│ ▼ Manual Web Import                      │
│ (collapsed, click to expand)             │
└─────────────────────────────────────────┘
```

### 5. Setup Documentation
**Location**: `docs/MCP_SETUP_GUIDE.md`

**Contents**:
- How to install MCP server locally
- How to configure Claude Code
- How to use (example flow)
- Troubleshooting common issues
- Cloud deployment guide (Stage 2)

---

## Security Strategy

### Stage 1 (Local)
**Threat Model**: Local machine only, single user

**Protection**:
- Credentials in `.env` file (gitignored)
- MCP runs via stdio (no network exposure)
- Only accessible when VSCode is open
- Standard file system permissions

**Risk Level**: ⭐ Low (no network attack surface)

### Stage 2 (Cloud)
**Threat Model**: Public endpoint, potential abuse

**Protection Layers**:
1. **Bearer Token Authentication**
   - Random token required in Authorization header
   - Stored in Cloudflare Worker secrets
   - Claude Chat config stores token
   - Easy to rotate if compromised

2. **Supabase Credentials Storage**
   - Never exposed to client
   - Stored in Cloudflare Worker environment variables
   - Encrypted at rest by Cloudflare

3. **Request Validation**
   - Check token on every request
   - Validate data format before processing
   - Return generic errors (don't leak info)

4. **Future Enhancements**
   - Rate limiting (10 requests/minute)
   - IP allowlisting (optional)
   - Audit logging to separate table
   - Alerts on suspicious activity

**Risk Level**: ⭐⭐ Medium (requires token, but publicly accessible)

### Secrets Management

**Local (.env file)**:
```bash
VITE_401K_TOKEN=your_existing_token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

**Cloud (Cloudflare Worker)**:
```bash
# Set once via wrangler CLI
wrangler secret put MCP_AUTH_TOKEN
wrangler secret put VITE_401K_TOKEN
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
```

**Claude Chat MCP Config**:
```json
{
  "mcpServers": {
    "voya-importer": {
      "url": "https://401k-mcp.mreedon.com",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN_VALUE>"
      }
    }
  }
}
```

---

## Stage 1: Local MCP (Desktop)

### Goals
- ✅ Working local MCP server
- ✅ Claude Skill for auto-recognition
- ✅ Updated Accounts page UI
- ✅ Setup documentation

### Tasks
1. **Create MCP Server** (~45 min)
   - Set up project structure
   - Implement MCP protocol handler
   - Implement parsing (reuse VoyaParser logic)
   - Implement Supabase insertion
   - Handle duplicate detection
   - Test with sample data

2. **Create Claude Skill** (~15 min)
   - Write skill markdown
   - Test recognition patterns
   - Refine conversation flow

3. **Update Accounts Page** (~30 min)
   - Collapse VoyaPasteImport by default
   - Add MCP import section
   - Add setup instructions link
   - Style improvements

4. **Documentation** (~15 min)
   - Write setup guide
   - Add example usage
   - Troubleshooting section

**Total Time**: ~105 minutes

### Deliverables
- `mcp-servers/voya-importer/` - Working MCP server
- `.claude/skills/voya-importer.md` - Claude Skill
- Updated `src/pages/Accounts.jsx` - Cleaner UI
- `docs/MCP_SETUP_GUIDE.md` - User documentation
- `mcp-servers/voya-importer/package.json` - Dependencies
- `mcp-servers/voya-importer/.env.example` - Template

---

## Stage 2: Cloud MCP (Mobile)

### Goals
- ✅ Cloud-hosted MCP server
- ✅ Auth token protection
- ✅ Works from Claude Chat mobile
- ✅ Same skill works everywhere

### Tasks
1. **Create Cloudflare Worker** (~45 min)
   - Port MCP server logic to Worker
   - Implement HTTP-based MCP protocol
   - Add Bearer token authentication
   - Configure environment variables
   - Deploy to Cloudflare

2. **Update Claude Chat Config** (~5 min)
   - Add MCP server to Claude Chat
   - Configure auth token
   - Test connection

3. **Mobile Testing** (~25 min)
   - Test on Claude Chat mobile app
   - Verify parsing works
   - Verify imports succeed
   - Test error handling

**Total Time**: ~75 minutes

### Deliverables
- `functions/mcp/voya-importer.js` - Cloudflare Worker
- `wrangler.toml` - Worker configuration
- Updated `docs/MCP_SETUP_GUIDE.md` - Cloud setup section
- Claude Chat MCP config documented

---

## User Experience Flows

### Flow 1: First Time Setup (Local)
1. User reads setup guide
2. User runs `npm install` in `mcp-servers/voya-importer/`
3. User copies `.env.example` to `.env`, fills in credentials
4. User adds MCP to VSCode Claude Code config
5. User restarts VSCode
6. MCP auto-starts, ready to use

### Flow 2: Importing Transactions (Local)
**User**:
```
[Opens Claude Code]
[Pastes Voya data]
Date	Activity	Fund	Money Source	# of Units/Shares	Unit/Share Price	Amount
10/21/2025	Contribution	0899 Vanguard 500 Index Fund Adm	ROTH	2.115	$39.611	$83.78
10/21/2025	Contribution	0899 Vanguard 500 Index Fund Adm	Safe Harbor Match	1.692	$39.611	$67.02
```

**Claude** (auto-recognizes via Skill):
```
I see 2 Voya transactions on 10/21/2025:

• ROTH contribution: 2.115 shares @ $39.611 = $83.78
• Safe Harbor Match: 1.692 shares @ $39.611 = $67.02

Total: 3.807 shares, $150.80

Want me to import these?
```

**User**: "Yes"

**Claude** (calls import_voya_transactions):
```
✅ Imported 2 transactions successfully!

Your portfolio:
• Total shares: 188.05
• Market value: $7,896.34
• This import: +$150.80 (+1.94%)

All set! These will show up on your dashboard.
```

### Flow 3: Importing from Mobile (Cloud)
**Same experience as Flow 2**, but:
- Works from Claude Chat mobile app
- Uses cloud MCP endpoint
- No need for local machine to be on

### Flow 4: Duplicate Detection
**User**: [Pastes same data twice]

**Claude**:
```
I see 2 transactions, but they look like duplicates of data already imported on Oct 21.

Checking... ✓ Confirmed: These transactions already exist in your database.

No action needed - your data is up to date!
```

### Flow 5: Error Handling
**User**: [Pastes malformed data]

**Claude**:
```
I tried to parse that as Voya transaction data, but it doesn't match the expected format.

Expected columns:
Date | Activity | Fund | Money Source | Shares | Price | Amount

Could you check that you copied all columns from the Voya website?
```

---

## File Structure

```
401K-Tracker/
├── .claude/
│   └── skills/
│       └── voya-importer.md           # NEW: Claude Skill
│
├── mcp-servers/                        # NEW: MCP servers directory
│   └── voya-importer/
│       ├── package.json
│       ├── .env.example
│       ├── .env                        # Gitignored
│       ├── server.js                   # Main MCP server
│       └── README.md
│
├── functions/
│   └── mcp/                            # NEW: Cloud MCP (Stage 2)
│       └── voya-importer.js
│
├── src/
│   ├── pages/
│   │   └── Accounts.jsx                # MODIFIED: Cleaner UI
│   ├── services/
│   │   ├── VoyaParser.js               # REUSED: Parsing logic
│   │   └── VoyaDatabaseService.js      # REFERENCE: API patterns
│   └── components/
│       └── VoyaPasteImport.jsx         # MODIFIED: Collapsed by default
│
├── docs/
│   ├── VOYA_MCP_IMPLEMENTATION.md      # THIS FILE
│   └── MCP_SETUP_GUIDE.md              # NEW: User-facing setup guide
│
└── wrangler.toml                       # MODIFIED: Add MCP worker (Stage 2)
```

---

## Configuration & Setup

### Local MCP Configuration

**VSCode Settings** (`.vscode/settings.json` or user settings):
```json
{
  "mcp": {
    "servers": {
      "voya-importer": {
        "command": "node",
        "args": ["./mcp-servers/voya-importer/server.js"],
        "cwd": "${workspaceFolder}",
        "autostart": true,
        "env": {
          "NODE_ENV": "development"
        }
      }
    }
  }
}
```

**Environment Variables** (`mcp-servers/voya-importer/.env`):
```bash
# Supabase credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# API token for authentication
VITE_401K_TOKEN=your_401k_api_token
```

### Cloud MCP Configuration

**Cloudflare Worker Secrets**:
```bash
# One-time setup
cd 401K-Tracker
wrangler secret put MCP_AUTH_TOKEN
# Enter: Generate a secure random token (e.g., openssl rand -hex 32)

wrangler secret put VITE_401K_TOKEN
# Enter: Your existing 401k API token

wrangler secret put SUPABASE_URL
# Enter: https://your-project.supabase.co

wrangler secret put SUPABASE_ANON_KEY
# Enter: Your Supabase anon key
```

**Claude Chat Configuration**:
1. Open Claude Chat settings
2. Navigate to MCP Servers
3. Add new server:
   ```json
   {
     "name": "voya-importer",
     "url": "https://401k-mcp.mreedon.com",
     "headers": {
       "Authorization": "Bearer <YOUR_MCP_AUTH_TOKEN>"
     }
   }
   ```

---

## Testing Plan

### Stage 1: Local MCP Testing

**Unit Tests**:
- [ ] Parse valid Voya data
- [ ] Parse malformed data (expect error)
- [ ] Detect duplicates correctly
- [ ] Insert transactions to Supabase
- [ ] Calculate correct summaries

**Integration Tests**:
- [ ] MCP server starts successfully
- [ ] Claude Code can discover tools
- [ ] Skill recognizes Voya format
- [ ] End-to-end import flow works
- [ ] Error messages are helpful

**Manual Testing Checklist**:
```
Stage 1 Local MCP:
[ ] MCP server auto-starts with VSCode
[ ] Paste valid Voya data → Claude recognizes it
[ ] Preview shows correct parsing
[ ] Confirm import → Data appears in Supabase
[ ] Check dashboard → New transactions visible
[ ] Paste duplicate data → Detects duplicates
[ ] Paste malformed data → Shows helpful error
[ ] Accounts page looks professional
[ ] Setup guide is clear and complete
```

### Stage 2: Cloud MCP Testing

**Security Tests**:
- [ ] Request without auth token → 401 Unauthorized
- [ ] Request with invalid token → 401 Unauthorized
- [ ] Request with valid token → Success

**Functional Tests**:
- [ ] Same as Stage 1, but via cloud endpoint
- [ ] Mobile Claude Chat can connect
- [ ] Desktop Claude Chat can connect
- [ ] Desktop Claude Code can use cloud endpoint

**Manual Testing Checklist**:
```
Stage 2 Cloud MCP:
[ ] Worker deploys successfully
[ ] Health check endpoint works
[ ] Claude Chat mobile connects
[ ] Import from phone works
[ ] Import from desktop Claude Chat works
[ ] Auth token protection works
[ ] Same skill works on all platforms
```

---

## Success Criteria

### Stage 1 Complete When:
- ✅ Can paste Voya data in Claude Code and import automatically
- ✅ Accounts page looks professional (form collapsed)
- ✅ Setup guide exists and is clear
- ✅ All manual tests pass
- ✅ Portfolio piece ready to show in interviews

### Stage 2 Complete When:
- ✅ Can paste Voya data in Claude Chat mobile and import
- ✅ Same Skill works on all platforms
- ✅ Auth token protection working
- ✅ Cloud endpoint deployed and stable
- ✅ Documentation updated for cloud setup

---

## Interview Talking Points

### Technical Achievement
"I built a custom MCP server that integrates with Claude Code and Claude Chat to streamline 401k data imports. The MCP server parses transactions, validates duplicates via hash comparison, and inserts directly to Supabase. I deployed it both locally and to Cloudflare Workers to enable mobile access."

### Architecture Decision
"I chose MCP over a traditional API because it provides better integration with AI assistants - the Skill gives Claude contextual awareness to auto-recognize Voya data format, and the MCP provides the capability to act on it. It's a clean separation of intelligence and capability."

### Security Consideration
"For the cloud deployment, I implemented Bearer token authentication and stored credentials in Cloudflare Worker secrets. The local version uses environment variables. Both approaches keep credentials out of the codebase while enabling seamless functionality."

### UI/UX Improvement
"I redesigned the Accounts page to highlight the MCP import method while keeping the web form available but collapsed. This makes the primary interface cleaner and more professional while maintaining backward compatibility."

---

## Future Enhancements

### Phase 3: Advanced Features
- Rate limiting on cloud MCP
- Audit logging (track all imports)
- Email notifications on imports
- Support for other 401k providers
- Bulk historical imports
- Transaction editing/deletion via MCP

### Phase 4: Analytics
- "What if" scenario analysis via MCP
- Contribution optimization suggestions
- Tax planning tools
- Retirement projection calculator

---

## Rollback Plan

### If Stage 1 Has Issues
- Web form still works (unchanged functionality)
- Can disable MCP in VSCode settings
- No database schema changes

### If Stage 2 Has Issues
- Fall back to local MCP only
- Disable cloud MCP in Claude Chat
- Keep Cloudflare Worker but mark as maintenance mode

---

## Appendix: Key Decisions

### Why MCP Instead of REST API?
- **Better UX**: Auto-recognition via Skill
- **Less Code**: No need for frontend integration
- **Portfolio Value**: Shows understanding of modern AI tooling
- **Future-Proof**: Works across Claude products

### Why Cloudflare Workers for Cloud?
- **Already Using**: Site deployed on Cloudflare Pages
- **Free Tier**: 100k requests/day
- **Fast**: Edge computing, low latency
- **Simple**: No server management

### Why Not Replace Web Form Entirely?
- **Backward Compatibility**: Some users may prefer web
- **Fallback**: If MCP server is down
- **Testing**: Easier to test API directly
- **Progressive Enhancement**: MCP is additive, not replacement

---

## Questions to Revisit Later

1. Should we add other import sources (Fidelity, Vanguard)?
2. Should we build a generic "financial data MCP" with multiple tools?
3. Should we add export functionality (download CSV via MCP)?
4. Should we add portfolio analysis tools to the MCP?
5. Should we open-source this as a template for others?

---

**Last Updated**: October 28, 2025
**Status**: Planning Complete, Ready to Build Stage 1
**Next Step**: Create local MCP server structure
