# 401k Tracker

A modern, secure web application for tracking your 401k portfolio performance with automatic data synchronization to GitHub for backup and historical analysis.

## 🔗 Live Demo

**[Try it now: https://401k.mreedon.com](https://401k.mreedon.com)**

### Demo Instructions
1. Visit the live demo link above
2. Click the **"🎯 Load Demo Data"** button on the dashboard
3. Explore the features:
   - View portfolio analytics with $20k+ market value and realistic gains
   - Check the interactive growth charts showing 2+ years of investment performance
   - Browse transaction history across multiple fund types
   - Test the CSV import functionality on the "Add Transactions" page

*Demo includes realistic 401k data with $13k+ contributions and 50%+ ROI over 2 years.*

## Features

### 📊 Portfolio Tracking
- **Real-time portfolio overview** with market value, contributions, and performance metrics
- **Interactive growth charts** comparing market value vs. contributions over time
- **Detailed fund breakdown** with individual performance analytics
- **Transaction history** with expandable details for each pay period

### 📈 Analytics & Insights
- **ROI calculation** and gain/loss tracking
- **Pay period analysis** with contribution patterns
- **Fund performance comparison** across different investment sources
- **Timeline visualization** of your investment journey

### 🔒 Secure Data Management
- **GitHub integration** for secure, versioned data storage
- **Local storage** with automatic cloud backup
- **Privacy-first** - your data stays in your control
- **Token-based authentication** for API security

### 📱 Modern Interface
- **Responsive design** that works on desktop, tablet, and mobile
- **Clean, professional UI** optimized for financial data
- **Dark theme** for comfortable viewing
- **Intuitive navigation** between dashboard and import functions

## Quick Start

### Prerequisites
- Node.js 18+
- GitHub account (for data storage)
- GitHub Personal Access Token

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/1000tomax/401k-tracker.git
   cd 401k-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env.local` file in the root directory:
   ```bash
   # API Security
   API_SHARED_TOKEN=your-secure-random-token
   VITE_401K_TOKEN=your-secure-random-token  # Must match API_SHARED_TOKEN

   # GitHub Integration
   GITHUB_PAT=your-github-personal-access-token
   GITHUB_USERNAME=your-github-username
   GITHUB_REPO=401k-tracker  # Repository name for data storage
   GITHUB_BRANCH=main
   GITHUB_DATA_PATH=data/401k-data.json

   # CORS (optional, defaults to localhost:3000 in development)
   CORS_ORIGIN=http://localhost:5173
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser** to `http://localhost:5173`

## Usage

### Importing Transaction Data

The application supports two ways to import your 401k transaction data:

#### Option 1: CSV Upload (Recommended)
1. Export your transaction history from Voya (or your 401k provider) as CSV
2. Navigate to the "Add Transactions" page
3. Use the file upload feature to select your CSV file
4. Review the parsed transactions and confirm the import

#### Option 2: Text Paste
1. Copy transaction data from your 401k provider's website
2. Navigate to the "Add Transactions" page
3. Paste the data into the text area
4. Review and confirm the import

### Viewing Your Portfolio

The dashboard provides several views of your data:

- **Account Overview**: Summary cards showing key metrics
- **Growth Chart**: Visual timeline of your portfolio vs. contributions
- **Portfolio Breakdown**: Detailed table of fund performance
- **Recent Activity**: Transaction history with expandable details

### Data Synchronization

Your data is automatically:
- Saved locally in your browser
- Backed up to GitHub when you click "Sync to GitHub"
- Retrieved from GitHub when you refresh or reload the app

## Technology Stack

- **Frontend**: React 18 with Vite
- **Routing**: React Router 6
- **Charts**: Recharts for data visualization
- **Validation**: Zod for data schema validation
- **Styling**: Modern CSS with custom design system
- **Storage**: Local storage + GitHub for persistence
- **API**: GitHub REST API via Octokit

## 🚀 Technical Highlights

**Advanced Features Implemented:**
- **Custom CSV Parser**: Robust transaction parsing with error handling and duplicate detection
- **Real-time Calculations**: Dynamic portfolio valuation, ROI tracking, and gain/loss analytics
- **Data Visualization**: Interactive charts with responsive design and custom tooltips
- **Schema Validation**: Type-safe data handling with Zod validation schemas
- **Multi-account Architecture**: Extensible design supporting multiple investment account types
- **GitHub Integration**: Automated data backup and versioning using GitHub as secure storage
- **Responsive Design**: Mobile-first approach with professional financial UI/UX
- **Error Boundaries**: Graceful error handling and user feedback systems

## Security Features

- **Token authentication** for all API endpoints
- **CORS protection** with configurable origins
- **No sensitive data logging** in production
- **Client-side encryption** of authentication tokens
- **GitHub as secure storage** - no third-party data services

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

### Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── SummaryOverview.jsx
│   └── PortfolioTable.jsx
├── pages/              # Main application pages
│   ├── Dashboard.jsx
│   └── Import.jsx
├── utils/              # Utility functions
│   ├── parseTransactions.js
│   ├── formatters.js
│   └── schemas.js
├── App.jsx             # Main application component
├── main.jsx            # Application entry point
└── index.css           # Global styles and design system
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on every push to main

### Environment Variables for Production

Ensure these are set in your production environment:

```bash
API_SHARED_TOKEN=strong-production-token
VITE_401K_TOKEN=strong-production-token
GITHUB_PAT=github-pat-with-repo-access
GITHUB_USERNAME=your-username
GITHUB_REPO=your-repo-name
GITHUB_BRANCH=main
GITHUB_DATA_PATH=data/401k-data.json
CORS_ORIGIN=https://your-domain.com
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter issues:

1. Check that all environment variables are correctly set
2. Ensure your GitHub token has appropriate repository permissions
3. Verify that your 401k provider's export format is supported
4. Review the browser console for any error messages

For questions or feature requests, please open an issue in the repository.