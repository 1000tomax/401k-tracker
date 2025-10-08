/**
 * @file functions/api/emails/send-transaction-summary.js
 * @description Cloudflare Worker function to generate and send a transaction summary email.
 * This is typically triggered after the daily transaction sync to notify the user of new activity.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';
import { generateTransactionEmail } from '../../../src/utils/emailTemplates.js';

/**
 * Sends an email using the Resend API.
 * @param {object} env - The Cloudflare Worker environment object.
 * @param {object} emailData - The email data, including subject, html, and text content.
 * @returns {Promise<object>} The response from the Resend API.
 * @throws {Error} If the Resend API returns an error.
 */
async function sendEmail(env, emailData) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `401k Tracker <notifications@401k.mreedon.com>`,
      to: env.NOTIFICATION_EMAIL,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      tags: [
        { name: 'type', value: 'transaction' },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Resend API error: ${JSON.stringify(error)}`);
  }

  return await response.json();
}

/**
 * Logs the result of an email notification attempt to the database.
 * @param {object} supabase - The Supabase client instance.
 * @param {string} emailType - The type of email being sent (e.g., 'transaction').
 * @param {string} recipient - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 * @param {boolean} success - Whether the email was sent successfully.
 * @param {string|null} [errorMessage=null] - The error message, if any.
 * @param {object} [metadata={}] - Additional metadata to store with the log entry.
 */
async function logNotification(supabase, emailType, recipient, subject, success, errorMessage = null, metadata = {}) {
  const { error } = await supabase
    .from('email_notifications')
    .insert({
      email_type: emailType,
      sent_at: new Date().toISOString(),
      recipient,
      subject,
      success,
      error_message: errorMessage,
      metadata,
    });

  if (error) {
    console.error('Failed to log email notification:', error);
  }
}

/**
 * Checks if a successful email of a specific type has already been sent today.
 * This prevents sending duplicate notifications.
 * @param {object} supabase - The Supabase client instance.
 * @param {string} emailType - The type of email to check for.
 * @returns {Promise<boolean>} `true` if an email was already sent today, `false` otherwise.
 */
async function wasEmailSentToday(supabase, emailType) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('email_notifications')
    .select('id')
    .eq('email_type', emailType)
    .gte('sent_at', `${today}T00:00:00Z`)
    .eq('success', true)
    .limit(1);

  if (error) {
    console.error('Error checking previous emails:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Handles POST requests to trigger the sending of a transaction summary email.
 * It checks for recent transactions, generates the email content, and sends it,
 * while ensuring that duplicate emails are not sent on the same day.
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response summarizing the outcome of the email sending process.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    console.log('📧 Transaction email: Starting...');

    // Check required env vars
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }
    if (!env.NOTIFICATION_EMAIL) {
      throw new Error('NOTIFICATION_EMAIL not configured');
    }

    const supabase = createSupabaseAdmin(env);

    // Check if we already sent a transaction email today
    const alreadySent = await wasEmailSentToday(supabase, 'transaction');
    if (alreadySent) {
      console.log('📧 Transaction email already sent today, skipping');
      return jsonResponse({
        ok: true,
        message: 'Transaction email already sent today',
        skipped: true,
      }, 200, env);
    }

    // Fetch portfolio analytics (last 1 day of transactions)
    const analyticsUrl = new URL(request.url);
    analyticsUrl.pathname = '/api/emails/analytics/portfolio-summary';
    analyticsUrl.searchParams.set('days', '1');

    const analyticsResponse = await fetch(analyticsUrl.toString(), {
      headers: {
        'X-401K-Token': env.API_SHARED_TOKEN,
      },
    });

    if (!analyticsResponse.ok) {
      throw new Error('Failed to fetch portfolio analytics');
    }

    const analyticsData = await analyticsResponse.json();

    if (!analyticsData.ok) {
      throw new Error(analyticsData.error || 'Analytics returned error');
    }

    // Generate email content
    const emailContent = generateTransactionEmail(analyticsData);

    // If no new transactions, skip sending email
    if (!emailContent) {
      console.log('📧 No new transactions, skipping email');
      return jsonResponse({
        ok: true,
        message: 'No new transactions detected',
        skipped: true,
      }, 200, env);
    }

    console.log(`📧 Sending transaction email: ${emailContent.subject}`);

    // Send email
    const emailResult = await sendEmail(env, emailContent);

    // Log success
    await logNotification(
      supabase,
      'transaction',
      env.NOTIFICATION_EMAIL,
      emailContent.subject,
      true,
      null,
      {
        transaction_count: analyticsData.recentActivity.transactionCount,
        total_amount: analyticsData.recentActivity.totalAmount,
        resend_id: emailResult.id,
      }
    );

    console.log('✅ Transaction email sent successfully');

    return jsonResponse({
      ok: true,
      message: 'Transaction email sent successfully',
      email_id: emailResult.id,
      transaction_count: analyticsData.recentActivity.transactionCount,
    }, 200, env);

  } catch (error) {
    console.error('❌ Error sending transaction email:', error);

    // Try to log failure to database
    try {
      const supabase = createSupabaseAdmin(env);
      await logNotification(
        supabase,
        'transaction',
        env.NOTIFICATION_EMAIL || 'unknown',
        'Transaction Summary (Failed)',
        false,
        error.message
      );
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return jsonResponse({
      ok: false,
      error: 'Failed to send transaction email',
      details: error.message,
    }, 500, env);
  }
}
