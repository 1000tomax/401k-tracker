/**
 * Performance Monitor - Main Entry Point
 *
 * Centralized performance monitoring system that coordinates:
 * - Web Vitals tracking
 * - Real User Monitoring
 * - API performance tracking
 * - Custom metrics
 * - Bundle analysis
 * - Performance budgets
 */

import webVitalsMonitor from './WebVitalsMonitor';
import realUserMonitoring from './RealUserMonitoring';
import apiPerformanceTracker from './ApiPerformanceTracker';
import customMetrics from './CustomMetrics';
import bundleAnalyzer from './BundleAnalyzer';
import performanceBudget from './PerformanceBudget';

class PerformanceMonitor {
  constructor() {
    this.isInitialized = false;
    this.isDevelopment = import.meta.env.DEV;
    this.isProduction = import.meta.env.PROD;
    this.config = {
      enableWebVitals: true,
      enableRUM: true,
      enableApiTracking: true,
      enableCustomMetrics: true,
      enableBundleAnalysis: true,
      enableBudgetCheck: true,
    };
  }

  /**
   * Initialize all performance monitoring
   */
  init(config = {}) {
    if (this.isInitialized) {
      console.warn('Performance Monitor already initialized');
      return;
    }

    // Merge config
    this.config = { ...this.config, ...config };

    console.log('🚀 Initializing Performance Monitor...');

    // Initialize all monitoring systems
    if (this.config.enableWebVitals) {
      webVitalsMonitor.init();
    }

    if (this.config.enableRUM) {
      realUserMonitoring.init();
    }

    if (this.config.enableApiTracking) {
      apiPerformanceTracker.init();
    }

    // Run bundle analysis after page load
    if (this.config.enableBundleAnalysis) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          bundleAnalyzer.analyzeBundles();
        }, 2000);
      });
    }

    // Check performance budgets after page load
    if (this.config.enableBudgetCheck) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          performanceBudget.checkBudgets();
        }, 3000);
      });
    }

    this.isInitialized = true;

    if (this.isDevelopment) {
      console.log('✅ Performance Monitor initialized');
      console.log('Configuration:', this.config);

      // Expose to window for debugging
      window.__performanceMonitor = this;
    }
  }

  /**
   * Get comprehensive performance report
   */
  async getReport() {
    const report = {
      timestamp: Date.now(),
      generated: new Date().toISOString(),
      environment: this.isDevelopment ? 'development' : 'production',
      webVitals: webVitalsMonitor.getSummary(),
      rum: realUserMonitoring.getSessionSummary(),
      api: apiPerformanceTracker.getStatistics(),
      customMetrics: customMetrics.getAllStats(),
      bundles: bundleAnalyzer.getTrends(),
      budgets: await performanceBudget.checkBudgets(),
    };

    return report;
  }

  /**
   * Export all performance data
   */
  exportData() {
    return {
      timestamp: Date.now(),
      generated: new Date().toISOString(),
      webVitals: webVitalsMonitor.getMetrics(),
      rum: realUserMonitoring.getAllSessions(),
      api: apiPerformanceTracker.exportStats(),
      customMetrics: customMetrics.exportMetrics(),
      bundles: bundleAnalyzer.exportAnalysis(),
      budgets: performanceBudget.getViolations(),
    };
  }

  /**
   * Download performance report as JSON
   */
  downloadReport() {
    const data = this.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Get quick health check
   */
  async getHealthCheck() {
    const webVitals = webVitalsMonitor.getSummary();
    const api = apiPerformanceTracker.getStatistics();
    const budgets = await performanceBudget.checkBudgets();

    const health = {
      status: 'healthy',
      score: 100,
      issues: [],
    };

    // Check Web Vitals
    if (webVitals.overallRating === 'poor') {
      health.status = 'unhealthy';
      health.score -= 30;
      health.issues.push({
        type: 'web-vitals',
        severity: 'high',
        message: 'Core Web Vitals are poor',
      });
    } else if (webVitals.overallRating === 'needs-improvement') {
      health.score -= 15;
      health.issues.push({
        type: 'web-vitals',
        severity: 'medium',
        message: 'Core Web Vitals need improvement',
      });
    }

    // Check API performance
    if (api && api.failureRate > 5) {
      health.status = 'unhealthy';
      health.score -= 25;
      health.issues.push({
        type: 'api',
        severity: 'high',
        message: `High API failure rate: ${api.failureRate.toFixed(2)}%`,
      });
    }

    // Check budget violations
    if (budgets.status === 'critical') {
      health.status = 'unhealthy';
      health.score -= 20;
      health.issues.push({
        type: 'budget',
        severity: 'high',
        message: `${budgets.summary.critical} critical budget violations`,
      });
    }

    if (health.score < 70) {
      health.status = 'unhealthy';
    } else if (health.score < 90) {
      health.status = 'warning';
    }

    return health;
  }

  /**
   * Clear all performance data
   */
  clearAll() {
    webVitalsMonitor.reset();
    apiPerformanceTracker.clear();
    customMetrics.clear();
    bundleAnalyzer.clearHistory();
    performanceBudget.clearViolations();

    if (this.isDevelopment) {
      console.log('🧹 All performance data cleared');
    }
  }

  /**
   * Public API - expose monitoring tools
   */
  get webVitals() {
    return webVitalsMonitor;
  }

  get rum() {
    return realUserMonitoring;
  }

  get api() {
    return apiPerformanceTracker;
  }

  get metrics() {
    return customMetrics;
  }

  get bundles() {
    return bundleAnalyzer;
  }

  get budget() {
    return performanceBudget;
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Export individual modules as well
export {
  webVitalsMonitor,
  realUserMonitoring,
  apiPerformanceTracker,
  customMetrics,
  bundleAnalyzer,
  performanceBudget,
};

export default performanceMonitor;
