/**
 * @file functions/api/snapshots/delete.js
 * @description Delete a portfolio snapshot and its related holdings
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * DELETE handler - Delete a portfolio snapshot by date
 */
export async function onRequestDelete(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const url = new URL(request.url);
    const snapshotDate = url.searchParams.get('date');

    if (!snapshotDate) {
      return jsonResponse({
        ok: false,
        error: 'Missing required parameter: date',
      }, 400, env);
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
      return jsonResponse({
        ok: false,
        error: 'Invalid date format. Expected YYYY-MM-DD',
      }, 400, env);
    }

    const supabase = createSupabaseAdmin(env);

    console.log(`🗑️ Deleting snapshot for ${snapshotDate}...`);

    // Check if snapshot exists
    const { data: existingSnapshot, error: checkError } = await supabase
      .from('portfolio_snapshots')
      .select('id, snapshot_date')
      .eq('snapshot_date', snapshotDate)
      .single();

    if (checkError || !existingSnapshot) {
      return jsonResponse({
        ok: false,
        error: `No snapshot found for date: ${snapshotDate}`,
      }, 404, env);
    }

    // Delete holdings snapshots first (foreign key constraint)
    const { error: holdingsError, count: holdingsDeleted } = await supabase
      .from('holdings_snapshots')
      .delete({ count: 'exact' })
      .eq('snapshot_date', snapshotDate);

    if (holdingsError) {
      throw new Error(`Failed to delete holdings snapshots: ${holdingsError.message}`);
    }

    console.log(`✅ Deleted ${holdingsDeleted || 0} holdings snapshots`);

    // Delete fund snapshots
    const { error: fundError, count: fundsDeleted } = await supabase
      .from('fund_snapshots')
      .delete({ count: 'exact' })
      .eq('snapshot_date', snapshotDate);

    if (fundError) {
      // Log but don't fail - fund_snapshots might not have a record
      console.error('Warning: Error deleting fund snapshots:', fundError.message);
    } else {
      console.log(`✅ Deleted ${fundsDeleted || 0} fund snapshots`);
    }

    // Delete the portfolio snapshot
    const { error: snapshotError } = await supabase
      .from('portfolio_snapshots')
      .delete()
      .eq('snapshot_date', snapshotDate);

    if (snapshotError) {
      throw new Error(`Failed to delete portfolio snapshot: ${snapshotError.message}`);
    }

    console.log(`✅ Deleted portfolio snapshot for ${snapshotDate}`);

    return jsonResponse({
      ok: true,
      message: `Snapshot for ${snapshotDate} deleted successfully`,
      deleted: {
        portfolioSnapshots: 1,
        holdingsSnapshots: holdingsDeleted || 0,
        fundSnapshots: fundsDeleted || 0,
      },
    }, 200, env);

  } catch (error) {
    console.error('Error deleting snapshot:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to delete snapshot',
      details: error.message,
    }, 500, env);
  }
}
