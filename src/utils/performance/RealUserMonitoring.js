/**
 * Real User Monitoring (RUM)
 *
 * Tracks actual user experience metrics including:
 * - Page load performance
 * - User interactions
 * - Navigation patterns
 * - Browser and device information
 * - Error tracking
 */

class RealUserMonitoring {
  constructor() {
    this.sessions = [];
    this.currentSession = null;
    this.isProduction = import.meta.env.PROD;
    this.isDevelopment = import.meta.env.DEV;
    this.maxSessions = 100; // Keep last 100 sessions in memory
  }

  /**
   * Initialize RUM tracking
   */
  init() {
    if (typeof window === 'undefined') return;

    this.startSession();
    this.trackPageVisibility();
    this.trackUserInteractions();
    this.trackNetworkInfo();
    this.trackMemoryUsage();
    this.trackErrorsAndWarnings();

    // End session on unload
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });

    if (this.isDevelopment) {
      console.log('👤 Real User Monitoring initialized');
    }
  }

  /**
   * Start a new monitoring session
   */
  startSession() {
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      url: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      device: this.getDeviceInfo(),
      connection: this.getConnectionInfo(),
      interactions: [],
      pages: [window.location.pathname],
      errors: [],
      performance: {},
      metrics: {},
    };

    if (this.isDevelopment) {
      console.log('🆕 New RUM session started:', this.currentSession.id);
    }
  }

  /**
   * End current session
   */
  endSession() {
    if (!this.currentSession) return;

    this.currentSession.endTime = Date.now();
    this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;

    // Add to sessions history
    this.sessions.push(this.currentSession);

    // Limit sessions in memory
    if (this.sessions.length > this.maxSessions) {
      this.sessions.shift();
    }

    // Send session data to analytics
    this.sendSessionData(this.currentSession);

    if (this.isDevelopment) {
      console.log('✅ RUM session ended:', {
        id: this.currentSession.id,
        duration: this.currentSession.duration,
        interactions: this.currentSession.interactions.length,
        pages: this.currentSession.pages.length,
      });
    }

    this.currentSession = null;
  }

  /**
   * Track page visibility changes
   */
  trackPageVisibility() {
    let hiddenTime = null;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        hiddenTime = Date.now();
        this.recordEvent('page_hidden', { timestamp: hiddenTime });
      } else {
        const visibleTime = Date.now();
        const hiddenDuration = hiddenTime ? visibleTime - hiddenTime : 0;
        this.recordEvent('page_visible', {
          timestamp: visibleTime,
          hiddenDuration,
        });
        hiddenTime = null;
      }
    });
  }

  /**
   * Track user interactions
   */
  trackUserInteractions() {
    // Track clicks
    document.addEventListener('click', (event) => {
      this.recordInteraction('click', {
        target: this.getElementSelector(event.target),
        x: event.clientX,
        y: event.clientY,
      });
    });

    // Track input interactions
    const inputElements = ['input', 'textarea', 'select'];
    inputElements.forEach(tag => {
      document.addEventListener(`${tag}:focus`, (event) => {
        this.recordInteraction('input_focus', {
          type: event.target.type,
          name: event.target.name,
        });
      }, true);
    });

    // Track form submissions
    document.addEventListener('submit', (event) => {
      this.recordInteraction('form_submit', {
        action: event.target.action,
        method: event.target.method,
      });
    }, true);

    // Track scroll depth
    let maxScroll = 0;
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollPercent = Math.round(
          (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
        );
        if (scrollPercent > maxScroll) {
          maxScroll = scrollPercent;
          this.recordInteraction('scroll', {
            depth: scrollPercent,
          });
        }
      }, 100);
    });
  }

  /**
   * Track network information
   */
  trackNetworkInfo() {
    if (!navigator.connection) return;

    const connection = navigator.connection;

    // Track connection changes
    connection.addEventListener('change', () => {
      this.recordEvent('network_change', {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      });
    });
  }

  /**
   * Track memory usage (if available)
   */
  trackMemoryUsage() {
    if (!performance.memory) return;

    setInterval(() => {
      if (this.currentSession) {
        this.currentSession.metrics.memory = {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          timestamp: Date.now(),
        };
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Track errors and warnings
   */
  trackErrorsAndWarnings() {
    // Track JavaScript errors
    window.addEventListener('error', (event) => {
      this.recordError({
        type: 'javascript',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError({
        type: 'promise',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
      });
    });

    // Track resource errors
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        this.recordError({
          type: 'resource',
          element: event.target.tagName,
          src: event.target.src || event.target.href,
        });
      }
    }, true);
  }

  /**
   * Record a user interaction
   */
  recordInteraction(type, data = {}) {
    if (!this.currentSession) return;

    const interaction = {
      type,
      timestamp: Date.now(),
      ...data,
    };

    this.currentSession.interactions.push(interaction);

    if (this.isDevelopment && type !== 'scroll') {
      console.log('👆 Interaction:', interaction);
    }
  }

  /**
   * Record an event
   */
  recordEvent(type, data = {}) {
    if (!this.currentSession) return;

    const event = {
      type,
      timestamp: Date.now(),
      ...data,
    };

    if (!this.currentSession.events) {
      this.currentSession.events = [];
    }

    this.currentSession.events.push(event);

    if (this.isDevelopment) {
      console.log('📅 Event:', event);
    }
  }

  /**
   * Record an error
   */
  recordError(error) {
    if (!this.currentSession) return;

    const errorData = {
      ...error,
      timestamp: Date.now(),
      url: window.location.href,
    };

    this.currentSession.errors.push(errorData);

    if (this.isDevelopment) {
      console.error('❌ Error tracked:', errorData);
    }

    // Send error immediately if critical
    if (this.isProduction) {
      this.sendErrorData(errorData);
    }
  }

  /**
   * Record page navigation
   */
  recordPageView(path) {
    if (!this.currentSession) return;

    if (!this.currentSession.pages.includes(path)) {
      this.currentSession.pages.push(path);
    }

    this.recordEvent('page_view', { path });
  }

  /**
   * Add custom metric
   */
  addMetric(name, value, metadata = {}) {
    if (!this.currentSession) return;

    this.currentSession.metrics[name] = {
      value,
      ...metadata,
      timestamp: Date.now(),
    };

    if (this.isDevelopment) {
      console.log(`📊 Metric [${name}]:`, value, metadata);
    }
  }

  /**
   * Get device information
   */
  getDeviceInfo() {
    const ua = navigator.userAgent;
    return {
      isMobile: /Mobile|Android|iPhone/i.test(ua),
      isTablet: /Tablet|iPad/i.test(ua),
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
    };
  }

  /**
   * Get connection information
   */
  getConnectionInfo() {
    if (!navigator.connection) return null;

    return {
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt,
      saveData: navigator.connection.saveData,
    };
  }

  /**
   * Get element selector for tracking
   */
  getElementSelector(element) {
    if (!element) return null;

    // Use ID if available
    if (element.id) return `#${element.id}`;

    // Use class names
    if (element.className) {
      const classes = element.className.split(' ').filter(Boolean).slice(0, 2).join('.');
      return `${element.tagName.toLowerCase()}.${classes}`;
    }

    // Use tag name
    return element.tagName.toLowerCase();
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send session data to analytics
   */
  sendSessionData(session) {
    if (!this.isProduction) return;

    // Implement your analytics endpoint
    /*
    fetch('/api/analytics/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
      keepalive: true,
    }).catch(err => {
      console.error('Failed to send session data:', err);
    });
    */
  }

  /**
   * Send error data to analytics
   */
  sendErrorData(error) {
    if (!this.isProduction) return;

    // Implement your error tracking endpoint
    /*
    fetch('/api/analytics/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error),
      keepalive: true,
    }).catch(err => {
      console.error('Failed to send error data:', err);
    });
    */
  }

  /**
   * Get current session data
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return this.sessions;
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    if (!this.currentSession) return null;

    return {
      id: this.currentSession.id,
      duration: Date.now() - this.currentSession.startTime,
      pages: this.currentSession.pages.length,
      interactions: this.currentSession.interactions.length,
      errors: this.currentSession.errors.length,
      device: this.currentSession.device,
    };
  }
}

// Create singleton instance
const realUserMonitoring = new RealUserMonitoring();

export default realUserMonitoring;
