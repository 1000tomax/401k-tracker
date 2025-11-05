import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Test environment
    environment: 'jsdom',

    // Global test utilities
    globals: true,

    // Setup files
    setupFiles: ['./tests/setup.js'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.config.js',
        '**/*.config.ts',
        '**/mockData/**',
        'functions/mcp/**', // MCP server is integration-tested separately
        'scripts/**',
      ],
      // Coverage thresholds - enforce minimum coverage
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },

    // Include patterns
    include: [
      'tests/unit/**/*.{test,spec}.{js,jsx}',
      'tests/integration/**/*.{test,spec}.{js,jsx}',
      'src/**/*.{test,spec}.{js,jsx}',
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],

    // Test timeout
    testTimeout: 10000,

    // Mock configuration
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // Reporter
    reporters: ['verbose'],

    // Threads
    threads: true,

    // Isolate tests
    isolate: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
