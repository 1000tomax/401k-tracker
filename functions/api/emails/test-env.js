/**
 * Test endpoint to debug environment variables
 */
export async function onRequestGet(context) {
  const { env } = context;

  return new Response(JSON.stringify({
    ok: true,
    hasResendKey: !!env.RESEND_API_KEY,
    hasNotificationEmail: !!env.NOTIFICATION_EMAIL,
    hasAnthropicKey: !!env.ANTHROPIC_API_KEY,
    resendKeyPrefix: env.RESEND_API_KEY?.substring(0, 10) || 'missing',
    allEnvKeys: Object.keys(env).sort(),
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
