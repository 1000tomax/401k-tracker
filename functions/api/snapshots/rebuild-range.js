/**
 * @file functions/api/snapshots/rebuild-range.js
 * @description Rebuilds portfolio snapshots for a date range by replaying the snapshot save logic
 *              with forced regeneration. Useful when historical transactions are imported late.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';
import { createSnapshot } from './save.js';

function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function generateDateRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);

  while (cursor <= end) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const body = await request.json();
    const startDate = body.startDate;
    const endDate = body.endDate || startDate;
    const snapshotSource = body.source || 'manual-rebuild';
    const force = body.force !== false; // default to true

    if (!startDate || !isValidDate(startDate)) {
      return jsonResponse({ ok: false, error: 'Invalid or missing startDate (expected YYYY-MM-DD)' }, 400, env);
    }
    if (!endDate || !isValidDate(endDate)) {
      return jsonResponse({ ok: false, error: 'Invalid or missing endDate (expected YYYY-MM-DD)' }, 400, env);
    }

    const normalizedStart = startDate <= endDate ? startDate : endDate;
    const normalizedEnd = endDate >= startDate ? endDate : startDate;
    const dates = generateDateRange(normalizedStart, normalizedEnd);

    console.log(`🔁 Rebuilding snapshots from ${normalizedStart} to ${normalizedEnd} (${dates.length} days)`);

    const supabase = createSupabaseAdmin(env);
    const results = [];
    const failures = [];

    for (const date of dates) {
      try {
        const snapshot = await createSnapshot(env, {
          supabase,
          snapshotDate: date,
          snapshotSource,
          force,
        });
        results.push({ date, snapshot });
      } catch (error) {
        console.error(`❌ Failed to rebuild snapshot for ${date}:`, error);
        failures.push({ date, error: error.message });
      }
    }

    const processed = dates.length;
    const rebuilt = results.length;
    const failed = failures.length;
    const statusCode = rebuilt === 0 ? 500 : 200;

    return jsonResponse({
      ok: failed === 0,
      processed,
      rebuilt,
      failed,
      snapshots: results,
      failures,
    }, statusCode, env);

  } catch (error) {
    console.error('Error rebuilding snapshots:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to rebuild snapshots',
      details: error.message,
    }, 500, env);
  }
}
