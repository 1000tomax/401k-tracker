# 401K Tracker 🚀

A modern, secure web application for tracking your 401k and investment portfolio performance with **automatic Plaid integration** for real-time data synchronization and comprehensive debugging tools.

## 🔗 Live Demo

**[Try it now: https://401k.mreedon.com](https://401k.mreedon.com)**

### Demo Features
- **Plaid Integration**: Connect real 401k/investment accounts securely
- **Mock Data Mode**: Test with realistic sample data in development
- **Live Portfolio Tracking**: Real-time updates from connected accounts
- **Advanced Debugging**: 5-tab debugging interface for data inspection
- **Encrypted Storage**: Secure browser persistence for connected accounts

## ✨ Key Features

### 🏦 Plaid Integration
- **Real-time Account Connection**: Securely connect 401k and investment accounts
- **Automatic Transaction Import**: Import investment transactions, holdings, and account data
- **Persistent Connections**: Encrypted browser storage with 30-day expiration
- **Dual Environment Support**: Mock data for development, live Plaid for production
- **Comprehensive Debugging**: 5-tab interface for inspecting all imported data

### 📊 Portfolio Analytics
- **Real-time Portfolio Overview** with market value, contributions, and performance
- **Interactive Growth Charts** comparing market value vs. contributions over time
- **Investment Transaction History** with detailed fund breakdown
- **ROI Calculation** and comprehensive gain/loss tracking
- **Securities Analysis** with real-time pricing and performance metrics

### 🔒 Security & Privacy
- **Bank-Level Security**: Plaid's institutional-grade encryption and security
- **Password-Protected Access**: Multi-layer authentication system
- **Encrypted Local Storage**: AES-GCM encryption with PBKDF2 key derivation
- **No Data Sharing**: Your financial data stays private and secure
- **Session Management**: 8-hour secure sessions with automatic logout

### 🛠️ Developer Tools
- **Advanced Debugging Interface**: 5 comprehensive tabs for data inspection
  - Overview: Key metrics and connection status
  - Raw Transactions: Direct API response data
  - Converted Data: Processed transaction format
  - Securities: Holdings and investment details
  - Accounts: Connected account information
- **Enhanced Logging**: Emoji-coded console logs throughout data flow
- **Mock Data Service**: Realistic test data for development
- **Environment Detection**: Automatic dev/production mode switching

### 📱 Modern Interface
- **Responsive Design** optimized for desktop, tablet, and mobile
- **Professional Financial UI** with dark theme for comfortable viewing
- **Real-time Updates** with live data synchronization
- **Intuitive Navigation** between portfolio, import, and debugging tools

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Plaid account (for production use)
- Modern web browser with localStorage support

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
   # Plaid Configuration (Production)
   VITE_PLAID_CLIENT_ID=your-plaid-client-id
   VITE_PLAID_SECRET=your-plaid-secret
   VITE_PLAID_ENV=production  # or 'sandbox' for testing
   VITE_PLAID_ACCESS_PASSWORD=secure-access-password

   # Legacy GitHub Integration (Optional)
   GITHUB_PAT=your-github-personal-access-token
   GITHUB_USERNAME=your-github-username
   GITHUB_REPO=401k-tracker
   GITHUB_BRANCH=main
   GITHUB_DATA_PATH=data/401k-data.json

   # API Security
   API_SHARED_TOKEN=your-secure-random-token
   VITE_401K_TOKEN=your-secure-random-token
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser** to `http://localhost:5173`

## 💡 Usage Guide

### Connecting Your Accounts

#### Development Mode
1. **Mock Data**: Click "Connect with Mock Data" for instant testing
2. **Real Plaid**: Enter access password and connect actual accounts

#### Production Mode
1. Enter your secure access password
2. Click "Connect Your 401k Account"
3. Select your financial institution through Plaid Link
4. Authenticate with your bank credentials
5. Choose accounts to connect

### Using the Debugging Interface

The 5-tab debugging interface provides comprehensive data inspection:

1. **Overview Tab**: Connection status, account summary, key metrics
2. **Raw Transactions Tab**: Direct API responses from Plaid
3. **Converted Tab**: Processed data in application format
4. **Securities Tab**: Investment holdings and fund details
5. **Accounts Tab**: Connected account information

### Data Persistence

Your connected accounts automatically persist:
- **Encrypted Storage**: Data encrypted in browser localStorage
- **30-Day Expiration**: Automatic cleanup of old connections
- **Session Management**: 8-hour authenticated sessions
- **Clear Data**: Development tools for testing and cleanup

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 18 with modern hooks and context
- Vite for fast development and building
- React Router 6 for navigation
- Recharts for data visualization

**Integration:**
- Plaid API for financial data
- react-plaid-link for secure authentication
- Web Crypto API for encryption
- localStorage for persistence

**Development:**
- Comprehensive debugging interface
- Mock data services
- Environment-based configuration
- Hot module replacement

### Project Structure

```
src/
├── components/
│   ├── PlaidDebugger.jsx      # 5-tab debugging interface
│   ├── PlaidLink.jsx          # Secure account connection
│   ├── MockPlaidLink.jsx      # Development mock service
│   ├── ImportMethodSelector.jsx # Dual environment selector
│   └── PlaidAuth.jsx          # Authentication component
├── contexts/
│   └── PlaidAuthContext.jsx   # Authentication & session state
├── services/
│   ├── PlaidService.js        # Main Plaid API service
│   ├── MockPlaidService.js    # Development mock data
│   └── PlaidStorageService.js # Encrypted browser storage
├── pages/
│   ├── Dashboard.jsx          # Portfolio overview
│   └── Import.jsx             # Data import & debugging
├── utils/
│   ├── parseTransactions.js   # Legacy CSV parsing
│   └── formatters.js          # Data formatting utilities
└── App.jsx                    # Main application
```

### Security Features

- **Plaid Security**: Bank-level encryption and compliance
- **Local Encryption**: AES-GCM with 100,000 PBKDF2 iterations
- **Password Protection**: Multi-layer authentication system
- **Session Security**: Automatic timeout and secure storage
- **No External Services**: Data stays between you, Plaid, and your browser

## 🚀 Advanced Features

### Plaid Integration Highlights

- **Real-time Data**: Live investment transactions and holdings
- **Multi-Account Support**: Connect multiple 401k/investment accounts
- **Comprehensive Coverage**: Transactions, securities, account details
- **Error Handling**: Robust error recovery and user feedback
- **Rate Limit Protection**: Built-in safeguards against API abuse

### Debugging System

- **Development Tools**: Comprehensive data inspection interface
- **Live Data Monitoring**: Real-time API response viewing
- **Mock Data Testing**: Realistic sample data for development
- **Error Diagnostics**: Detailed logging and error tracking
- **Performance Monitoring**: API call tracking and optimization

### Data Processing

- **Smart Conversion**: Plaid data → application format transformation
- **Transaction Mapping**: Investment transaction type normalization
- **Duplicate Detection**: Automatic duplicate transaction filtering
- **Data Validation**: Comprehensive schema validation with Zod
- **Performance Optimization**: Efficient data processing and caching

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build optimized production bundle
- `npm run preview` - Preview production build locally

### Environment Modes

**Development Mode:**
- Mock data integration for testing
- Real Plaid connections available
- Enhanced debugging and logging
- Hot module replacement

**Production Mode:**
- Secure Plaid-only connections
- Optimized performance
- Enhanced security measures
- Error boundary protection

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on every push to main

### Environment Variables for Production

```bash
# Plaid Production Configuration
VITE_PLAID_CLIENT_ID=your-production-client-id
VITE_PLAID_SECRET=your-production-secret
VITE_PLAID_ENV=production
VITE_PLAID_ACCESS_PASSWORD=secure-production-password

# Optional Legacy Features
GITHUB_PAT=github-token-if-needed
GITHUB_USERNAME=your-username
GITHUB_REPO=your-repo-name
API_SHARED_TOKEN=secure-api-token
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing code patterns and security practices
4. Test thoroughly in both development and production modes
5. Submit a pull request with detailed description

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Troubleshooting

### Common Issues

**Connection Problems:**
- Verify Plaid credentials are correct
- Check network connectivity
- Ensure institution supports Plaid integration
- Review browser console for detailed error messages

**Development Issues:**
- Use mock data mode for testing without API calls
- Check environment variable configuration
- Clear browser localStorage if needed
- Monitor debugging interface for data flow issues

**Authentication Problems:**
- Verify access password is correct
- Check session hasn't expired (8-hour limit)
- Clear authentication data and re-login
- Ensure browser supports localStorage and Web Crypto API

### Getting Help

For questions, bug reports, or feature requests:
1. Check existing issues in the repository
2. Review the debugging interface for data insights
3. Include browser console logs when reporting issues
4. Provide steps to reproduce any problems

**Security Note**: Never share your Plaid credentials, access passwords, or sensitive financial data when seeking support.