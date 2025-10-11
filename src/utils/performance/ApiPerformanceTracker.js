/**
 * API Performance Tracker
 *
 * Monitors API calls and backend performance:
 * - Request/response times
 * - Success/error rates
 * - Slow queries
 * - Failed requests
 * - Network conditions
 */

class ApiPerformanceTracker {
  constructor() {
    this.requests = [];
    this.maxRequests = 200; // Keep last 200 requests
    this.isDevelopment = import.meta.env.DEV;
    this.isProduction = import.meta.env.PROD;

    // Performance thresholds (in milliseconds)
    this.thresholds = {
      fast: 200,
      acceptable: 1000,
      slow: 3000,
    };
  }

  /**
   * Initialize API performance tracking
   */
  init() {
    if (typeof window === 'undefined') return;

    // Intercept fetch calls
    this.interceptFetch();

    // Intercept XMLHttpRequest
    this.interceptXHR();

    if (this.isDevelopment) {
      console.log('🌐 API Performance Tracker initialized');
    }
  }

  /**
   * Intercept fetch API
   */
  interceptFetch() {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      const method = config?.method || 'GET';

      const startTime = performance.now();
      const requestId = this.generateRequestId();

      const requestData = {
        id: requestId,
        url,
        method,
        startTime,
        timestamp: Date.now(),
      };

      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const duration = endTime - startTime;

        // Clone response to read body if needed
        const clonedResponse = response.clone();

        this.recordRequest({
          ...requestData,
          endTime,
          duration,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          type: 'fetch',
          size: this.getResponseSize(response),
        });

        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordRequest({
          ...requestData,
          endTime,
          duration,
          status: 0,
          statusText: 'Network Error',
          ok: false,
          type: 'fetch',
          error: error.message,
        });

        throw error;
      }
    };
  }

  /**
   * Intercept XMLHttpRequest
   */
  interceptXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._requestData = {
        id: this.generateRequestId(),
        url,
        method,
        timestamp: Date.now(),
      };
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      const startTime = performance.now();
      this._requestData.startTime = startTime;

      this.addEventListener('loadend', () => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordRequest({
          ...this._requestData,
          endTime,
          duration,
          status: this.status,
          statusText: this.statusText,
          ok: this.status >= 200 && this.status < 300,
          type: 'xhr',
          size: this.getResponseHeader('content-length'),
        });
      });

      return originalSend.call(this, ...args);
    };
  }

  /**
   * Get response size from headers
   */
  getResponseSize(response) {
    const contentLength = response.headers.get('content-length');
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  /**
   * Record API request
   */
  recordRequest(data) {
    const performance = this.analyzePerformance(data);

    const request = {
      ...data,
      performance,
    };

    this.requests.push(request);

    // Limit stored requests
    if (this.requests.length > this.maxRequests) {
      this.requests.shift();
    }

    // Log in development
    if (this.isDevelopment) {
      this.logRequest(request);
    }

    // Track slow or failed requests
    if (performance.rating === 'slow' || !data.ok) {
      this.handleSlowOrFailedRequest(request);
    }
  }

  /**
   * Analyze request performance
   */
  analyzePerformance(data) {
    let rating = 'fast';

    if (data.duration > this.thresholds.slow) {
      rating = 'slow';
    } else if (data.duration > this.thresholds.acceptable) {
      rating = 'acceptable';
    }

    if (!data.ok) {
      rating = 'failed';
    }

    return {
      rating,
      duration: data.duration,
      isSlow: data.duration > this.thresholds.slow,
      isFailed: !data.ok,
    };
  }

  /**
   * Handle slow or failed requests
   */
  handleSlowOrFailedRequest(request) {
    if (this.isDevelopment) {
      if (request.performance.isFailed) {
        console.error('❌ API request failed:', {
          url: request.url,
          status: request.status,
          duration: request.duration.toFixed(2) + 'ms',
        });
      } else if (request.performance.isSlow) {
        console.warn('🐌 Slow API request:', {
          url: request.url,
          duration: request.duration.toFixed(2) + 'ms',
        });
      }
    }

    // Send to analytics if in production
    if (this.isProduction) {
      this.sendToAnalytics(request);
    }
  }

  /**
   * Log request to console
   */
  logRequest(request) {
    const emoji = {
      fast: '⚡',
      acceptable: '✅',
      slow: '🐌',
      failed: '❌',
    }[request.performance.rating];

    const color = {
      fast: 'color: green',
      acceptable: 'color: blue',
      slow: 'color: orange',
      failed: 'color: red',
    }[request.performance.rating];

    console.log(
      `%c${emoji} ${request.method} ${request.url} - ${request.duration.toFixed(2)}ms (${request.status})`,
      color
    );
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all requests
   */
  getAllRequests() {
    return [...this.requests];
  }

  /**
   * Get requests by criteria
   */
  getRequests(filter = {}) {
    return this.requests.filter(request => {
      if (filter.method && request.method !== filter.method) return false;
      if (filter.status && request.status !== filter.status) return false;
      if (filter.rating && request.performance.rating !== filter.rating) return false;
      if (filter.urlPattern && !request.url.includes(filter.urlPattern)) return false;
      return true;
    });
  }

  /**
   * Get failed requests
   */
  getFailedRequests() {
    return this.requests.filter(r => !r.ok);
  }

  /**
   * Get slow requests
   */
  getSlowRequests() {
    return this.requests.filter(r => r.performance.isSlow);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    if (this.requests.length === 0) {
      return null;
    }

    const durations = this.requests.map(r => r.duration);
    const successful = this.requests.filter(r => r.ok);
    const failed = this.requests.filter(r => !r.ok);

    return {
      total: this.requests.length,
      successful: successful.length,
      failed: failed.length,
      successRate: (successful.length / this.requests.length) * 100,
      failureRate: (failed.length / this.requests.length) * 100,
      performance: {
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        p50: this.percentile(durations, 50),
        p75: this.percentile(durations, 75),
        p90: this.percentile(durations, 90),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
      },
      byStatus: this.groupByStatus(),
      byEndpoint: this.groupByEndpoint(),
      slow: this.requests.filter(r => r.performance.isSlow).length,
    };
  }

  /**
   * Calculate percentile
   */
  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * Group requests by status code
   */
  groupByStatus() {
    const grouped = {};
    this.requests.forEach(request => {
      const status = request.status;
      if (!grouped[status]) {
        grouped[status] = {
          count: 0,
          avgDuration: 0,
          durations: [],
        };
      }
      grouped[status].count++;
      grouped[status].durations.push(request.duration);
    });

    // Calculate averages
    Object.keys(grouped).forEach(status => {
      const durations = grouped[status].durations;
      grouped[status].avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      delete grouped[status].durations;
    });

    return grouped;
  }

  /**
   * Group requests by endpoint
   */
  groupByEndpoint() {
    const grouped = {};
    this.requests.forEach(request => {
      const endpoint = this.extractEndpoint(request.url);
      if (!grouped[endpoint]) {
        grouped[endpoint] = {
          count: 0,
          avgDuration: 0,
          durations: [],
          failed: 0,
        };
      }
      grouped[endpoint].count++;
      grouped[endpoint].durations.push(request.duration);
      if (!request.ok) {
        grouped[endpoint].failed++;
      }
    });

    // Calculate averages
    Object.keys(grouped).forEach(endpoint => {
      const durations = grouped[endpoint].durations;
      grouped[endpoint].avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      delete grouped[endpoint].durations;
    });

    return grouped;
  }

  /**
   * Extract endpoint from URL
   */
  extractEndpoint(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.pathname;
    } catch {
      return url;
    }
  }

  /**
   * Send data to analytics
   */
  sendToAnalytics(request) {
    // Implement your analytics endpoint
    /*
    fetch('/api/analytics/api-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      keepalive: true,
    }).catch(err => {
      console.error('Failed to send API performance data:', err);
    });
    */
  }

  /**
   * Clear all requests
   */
  clear() {
    this.requests = [];
  }

  /**
   * Export statistics as JSON
   */
  exportStats() {
    return {
      generated: new Date().toISOString(),
      statistics: this.getStatistics(),
      recentRequests: this.requests.slice(-50),
      failedRequests: this.getFailedRequests(),
      slowRequests: this.getSlowRequests(),
    };
  }
}

// Create singleton instance
const apiPerformanceTracker = new ApiPerformanceTracker();

export default apiPerformanceTracker;
