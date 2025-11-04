import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HoldingsService } from '@/services/HoldingsService';

describe('HoldingsService', () => {
  let service;
  const mockApiUrl = 'https://test-api.com';
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new HoldingsService(mockApiUrl, mockToken);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with apiUrl and token', () => {
      expect(service.apiUrl).toBe(mockApiUrl);
      expect(service.token).toBe(mockToken);
    });
  });

  describe('getSnapshots', () => {
    it('should fetch snapshots successfully', async () => {
      const mockData = {
        snapshots: [
          { date: '2025-01-15', value: 100000 },
          { date: '2025-01-14', value: 99500 },
        ],
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await service.getSnapshots(90);

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/holdings/snapshots?days=90`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-401K-Token': mockToken,
          },
        }
      );
      expect(result).toEqual(mockData);
    });

    it('should use default daysBack of 90', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshots: [] }),
      });

      await service.getSnapshots();

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/holdings/snapshots?days=90`,
        expect.any(Object)
      );
    });

    it('should allow custom daysBack parameter', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshots: [] }),
      });

      await service.getSnapshots(30);

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/holdings/snapshots?days=30`,
        expect.any(Object)
      );
    });

    it('should throw error on failed response', async () => {
      const mockError = { error: 'Not found' };

      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => mockError,
      });

      await expect(service.getSnapshots()).rejects.toThrow('Not found');
    });

    it('should throw generic error when no error message provided', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(service.getSnapshots()).rejects.toThrow('Failed to fetch holdings');
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getSnapshots()).rejects.toThrow('Network error');
    });
  });

  describe('syncNow', () => {
    it('should sync transactions successfully', async () => {
      const mockData = {
        success: true,
        transactionsSynced: 15,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await service.syncNow();

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/sync/transactions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-401K-Token': mockToken,
          },
        }
      );
      expect(result).toEqual(mockData);
    });

    it('should throw error on failed sync', async () => {
      const mockError = { error: 'Sync failed', details: 'Connection timeout' };

      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => mockError,
      });

      await expect(service.syncNow()).rejects.toThrow('Connection timeout');
    });

    it('should use error message when details not provided', async () => {
      const mockError = { error: 'Sync failed' };

      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => mockError,
      });

      await expect(service.syncNow()).rejects.toThrow('Sync failed');
    });

    it('should use generic error message when response has no error info', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      await expect(service.syncNow()).rejects.toThrow('Sync failed');
    });

    it('should handle network errors during sync', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.syncNow()).rejects.toThrow('Network error');
    });
  });

  describe('getLatestPrices', () => {
    it('should fetch latest prices successfully', async () => {
      const mockData = {
        ok: true,
        prices: {
          VTI: { price: 250.50, updatedAt: '2025-01-15T12:00:00Z' },
          QQQM: { price: 180.25, updatedAt: '2025-01-15T12:00:00Z' },
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await service.getLatestPrices();

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockApiUrl}/api/prices/latest`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-401K-Token': mockToken,
          },
        }
      );
      expect(result).toEqual(mockData.prices);
    });

    it('should return null when response is not ok', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Service unavailable' }),
      });

      const result = await service.getLatestPrices();

      expect(result).toBeNull();
    });

    it('should return null when ok flag is false in response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      });

      const result = await service.getLatestPrices();

      expect(result).toBeNull();
    });

    it('should return null on network error (graceful degradation)', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getLatestPrices();

      expect(result).toBeNull();
    });

    it('should handle JSON parse error gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const result = await service.getLatestPrices();

      expect(result).toBeNull();
    });
  });
});
