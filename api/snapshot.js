import { Octokit } from '@octokit/rest';

const REQUIRED_ENV = ['GITHUB_PAT', 'GITHUB_USERNAME', 'GITHUB_REPO'];
const DEFAULT_BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH = process.env.GITHUB_DATA_PATH || 'data/401k-data.json';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    send(res, 405, { ok: false, error: 'Use GET for this endpoint.' });
    return;
  }

  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length) {
    send(res, 500, {
      ok: false,
      error: `Missing required environment variables: ${missing.join(', ')}`,
      missing,
    });
    return;
  }

  const repoSetting = process.env.GITHUB_REPO;
  const username = process.env.GITHUB_USERNAME;
  const [owner, repo] = repoSetting.includes('/')
    ? repoSetting.split('/')
    : [username, repoSetting];

  const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: DATA_PATH,
      ref: DEFAULT_BRANCH,
    });

    if (!data || Array.isArray(data)) {
      throw new Error(`Path ${DATA_PATH} did not resolve to a file.`);
    }

    const decoded = Buffer.from(data.content, data.encoding || 'base64').toString('utf-8');
    let snapshot;
    try {
      snapshot = JSON.parse(decoded);
    } catch (error) {
      throw new Error(`Failed to parse JSON at ${DATA_PATH}: ${error.message}`);
    }

    send(res, 200, {
      ok: true,
      fetchedAt: new Date().toISOString(),
      snapshot,
    });
  } catch (error) {
    console.error('Failed to fetch snapshot', error);
    const status = error.status || 500;
    const rawMessage = error?.message || 'Unexpected GitHub error.';

    let friendly = rawMessage;
    if (/bad credentials/i.test(rawMessage)) {
      friendly = 'GitHub token invalid or missing.';
    } else if (/not found/i.test(rawMessage)) {
      friendly = `Could not find ${DATA_PATH} on ${DEFAULT_BRANCH}.`;
    }

    send(res, status, {
      ok: false,
      error: friendly,
      rawError: rawMessage,
    });
  }
}
