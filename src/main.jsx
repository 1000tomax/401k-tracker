import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerServiceWorker } from './utils/registerServiceWorker';
import performanceMonitor from './utils/performance/PerformanceMonitor';

// Register service worker for PWA support
registerServiceWorker();

// Initialize performance monitoring
performanceMonitor.init({
  enableWebVitals: true,
  enableRUM: true,
  enableApiTracking: true,
  enableCustomMetrics: true,
  enableBundleAnalysis: true,
  enableBudgetCheck: true,
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
