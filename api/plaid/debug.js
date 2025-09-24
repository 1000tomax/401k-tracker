/**
 * Debug Plaid configuration in production
 */

export default async function handler(req, res) {
  try {
    console.log('🔍 Debug - Environment variables check:', {
      hasClientId: !!process.env.PLAID_CLIENT_ID,
      hasSecret: !!process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV,
      clientIdLength: process.env.PLAID_CLIENT_ID?.length || 0,
      secretLength: process.env.PLAID_SECRET?.length || 0,
      nodeEnv: process.env.NODE_ENV
    });

    // Try to import plaid
    let plaidImportOk = false;
    try {
      const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
      plaidImportOk = true;
      console.log('✅ Plaid package imported successfully');
    } catch (importError) {
      console.error('❌ Failed to import plaid package:', importError.message);
    }

    const debugInfo = {
      environment_variables: {
        hasClientId: !!process.env.PLAID_CLIENT_ID,
        hasSecret: !!process.env.PLAID_SECRET,
        env: process.env.PLAID_ENV,
        clientIdLength: process.env.PLAID_CLIENT_ID?.length || 0,
        secretLength: process.env.PLAID_SECRET?.length || 0
      },
      plaid_package: {
        import_successful: plaidImportOk
      },
      runtime: {
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      }
    };

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(debugInfo, null, 2));

  } catch (error) {
    console.error('❌ Debug endpoint error:', error);

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Debug failed',
      message: error.message,
      stack: error.stack
    }));
  }
}