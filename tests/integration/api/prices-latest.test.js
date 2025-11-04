import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies before importing the handler
vi.mock('../../../src/lib/supabaseAdmin.js', () => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock('../../../src/utils/cors-workers.js', () => ({
  handleCors: vi.fn(),
  requireSharedToken: vi.fn(),
  jsonResponse: vi.fn((data, status) => new Response(JSON.stringify(data), { status })),
}));

import { onRequestGet } from '../../../functions/api/prices/latest.js';
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken } from '../../../src/utils/cors-workers.js';

describe('GET /api/prices/latest', () => {
  let mockEnv;
  let mockRequest;
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_KEY: 'test-key',
      API_SHARED_TOKEN: 'test-token',
      CORS_ORIGIN: '*',
    };

    mockRequest = new Request('https://test.com/api/prices/latest', {
      method: 'GET',
      headers: {
        'X-401K-Token': 'test-token',
      },
    });

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };

    // Default mocks
    handleCors.mockReturnValue(null);
    requireSharedToken.mockReturnValue({ ok: true });
    createSupabaseAdmin.mockReturnValue(mockSupabase);
  });

  it('should return latest prices successfully', async () => {
    const mockPrices = [
      {
        ticker: 'VTI',
        price: '250.50',
        change_percent: '1.25',
        updated_at: '2025-01-15T12:00:00Z',
      },
      {
        ticker: 'QQQM',
        price: '180.75',
        change_percent: '-0.50',
        updated_at: '2025-01-15T12:00:00Z',
      },
    ];

    mockSupabase.order.mockResolvedValue({
      data: mockPrices,
      error: null,
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.prices).toEqual({
      VTI: {
        price: 250.50,
        changePercent: 1.25,
        updatedAt: '2025-01-15T12:00:00Z',
      },
      QQQM: {
        price: 180.75,
        changePercent: -0.50,
        updatedAt: '2025-01-15T12:00:00Z',
      },
    });
    expect(data.count).toBe(2);
  });

  it('should handle CORS preflight request', async () => {
    const corsResponse = new Response(null, { status: 204 });
    handleCors.mockReturnValue(corsResponse);

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });

    expect(response).toBe(corsResponse);
    expect(response.status).toBe(204);
  });

  it('should require authentication token', async () => {
    requireSharedToken.mockReturnValue({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(data.error).toBe('Unauthorized');
    expect(response.status).toBe(401);
  });

  it('should handle database errors', async () => {
    mockSupabase.order.mockResolvedValue({
      data: null,
      error: { message: 'Database connection failed' },
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(data.error).toBe('Failed to fetch prices');
    expect(response.status).toBe(500);
  });

  it('should handle empty price list', async () => {
    mockSupabase.order.mockResolvedValue({
      data: [],
      error: null,
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.prices).toEqual({});
    expect(data.count).toBe(0);
  });

  it('should handle null price list', async () => {
    mockSupabase.order.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.prices).toEqual({});
    expect(data.count).toBe(0);
  });

  it('should parse price strings to floats', async () => {
    const mockPrices = [
      {
        ticker: 'VTI',
        price: '250.5012345',
        change_percent: '1.2534',
        updated_at: '2025-01-15T12:00:00Z',
      },
    ];

    mockSupabase.order.mockResolvedValue({
      data: mockPrices,
      error: null,
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    expect(data.prices.VTI.price).toBe(250.5012345);
    expect(data.prices.VTI.changePercent).toBe(1.2534);
  });

  it('should handle missing change_percent', async () => {
    const mockPrices = [
      {
        ticker: 'VTI',
        price: '250.50',
        change_percent: null,
        updated_at: '2025-01-15T12:00:00Z',
      },
    ];

    mockSupabase.order.mockResolvedValue({
      data: mockPrices,
      error: null,
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    expect(data.prices.VTI.changePercent).toBe(0);
  });

  it('should call Supabase with correct query', async () => {
    mockSupabase.order.mockResolvedValue({
      data: [],
      error: null,
    });

    await onRequestGet({ request: mockRequest, env: mockEnv });

    expect(mockSupabase.from).toHaveBeenCalledWith('current_etf_prices');
    expect(mockSupabase.select).toHaveBeenCalledWith('ticker, price, change_percent, updated_at');
    expect(mockSupabase.order).toHaveBeenCalledWith('ticker', { ascending: true });
  });

  it('should sort prices by ticker', async () => {
    const mockPrices = [
      { ticker: 'QQQM', price: '180.75', change_percent: '0', updated_at: '2025-01-15T12:00:00Z' },
      { ticker: 'VTI', price: '250.50', change_percent: '0', updated_at: '2025-01-15T12:00:00Z' },
    ];

    mockSupabase.order.mockResolvedValue({
      data: mockPrices,
      error: null,
    });

    const response = await onRequestGet({ request: mockRequest, env: mockEnv });
    const data = await response.json();

    // The API returns a map, so order doesn't matter in the response
    // But we verify that the order query was called
    expect(mockSupabase.order).toHaveBeenCalledWith('ticker', { ascending: true });
    expect(data.prices).toHaveProperty('VTI');
    expect(data.prices).toHaveProperty('QQQM');
  });
});
