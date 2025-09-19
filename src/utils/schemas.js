import { z } from 'zod';

export const TransactionSchema = z
  .object({
    date: z.string().min(1),
    activity: z.string().min(1),
    fund: z.string().min(1),
    moneySource: z.string().optional(),
    source: z.string().optional(),
    units: z.number(),
    unitPrice: z.number(),
    amount: z.number(),
    shares: z.number().optional(),
    id: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const SnapshotSchema = z
  .object({
    transactions: z.array(TransactionSchema),
    portfolio: z.any().optional(),
    totals: z.any().optional(),
    fundTotals: z.any().optional(),
    sourceTotals: z.any().optional(),
    timeline: z.any().optional(),
    lastUpdated: z.string().optional(),
    generatedAt: z.string().optional(),
    syncedAt: z.string().optional(),
  })
  .passthrough();
