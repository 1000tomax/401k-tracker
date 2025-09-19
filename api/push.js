import { Octokit } from '@octokit/rest';
import { allowCorsAndAuth, requireSharedToken } from '../src/utils/cors.js';
import { SnapshotSchema } from '../src/utils/schemas.js';

const REQUIRED_ENV = ['GITHUB_PAT', 'GITHUB_USERNAME', 'GITHUB_REPO'];
const DEFAULT_BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH = process.env.GITHUB_DATA_PATH || 'data/401k-data.json';
const HISTORY_DIR = process.env.GITHUB_HISTORY_DIR || 'data/history';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function parseFlag(value, fallback) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) {
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { ok: false, error: 'Use POST for this endpoint.' });
    return;
  }

  const auth = requireSharedToken(req);
  if (!auth.ok) {
    send(res, auth.status, { ok: false, error: auth.message });
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

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    console.error('Invalid request body', { message: error.message });
    send(res, 400, { ok: false, error: 'Invalid JSON body.' });
    return;
  }

  const validation = SnapshotSchema.safeParse(payload);
  if (!validation.success) {
    console.warn('Snapshot payload validation failed', {
      issueCount: validation.error.issues.length,
    });
    send(res, 400, { ok: false, error: 'Invalid payload: schema validation failed.' });
    return;
  }

  const timestamp = new Date().toISOString();
  const snapshot = {
    ...validation.data,
    syncedAt: timestamp,
  };

  const includeHistory = parseFlag(process.env.GITHUB_HISTORY, true);
  const effectiveDate = (snapshot.lastUpdated || timestamp.slice(0, 10)).slice(0, 10);
  const historyPath = `${HISTORY_DIR}/${effectiveDate}.json`;

  const repoSetting = process.env.GITHUB_REPO;
  const username = process.env.GITHUB_USERNAME;
  const [owner, repo] = repoSetting.includes('/')
    ? repoSetting.split('/')
    : [username, repoSetting];

  const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

  let branchInfo;
  try {
    const { data } = await octokit.repos.getBranch({ owner, repo, branch: DEFAULT_BRANCH });
    branchInfo = data;
  } catch (error) {
    console.error('Unable to read branch', { message: error.message, status: error.status });
    send(res, error.status || 500, {
      ok: false,
      error: `Unable to read branch ${DEFAULT_BRANCH}: ${error.message}`,
      details: error.response?.data || null,
    });
    return;
  }

  const latestCommitSha = branchInfo.commit.sha;
  const baseTreeSha = branchInfo.commit.commit.tree.sha;

  const files = [
    {
      path: DATA_PATH,
      content: JSON.stringify(snapshot, null, 2),
    },
  ];

  if (includeHistory) {
    files.push({
      path: historyPath,
      content: JSON.stringify(snapshot, null, 2),
    });
  }

  try {
    const blobs = await Promise.all(
      files.map(file =>
        octokit.git
          .createBlob({
            owner,
            repo,
            content: file.content,
            encoding: 'utf-8',
          })
          .then(response => ({ path: file.path, sha: response.data.sha }))
      )
    );

    const tree = blobs.map(blob => ({
      path: blob.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    }));

    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree,
    });

    const committerName =
      process.env.GITHUB_COMMITTER_NAME || username || '401k Tracker Bot';
    const committerEmail =
      process.env.GITHUB_COMMITTER_EMAIL ||
      (username ? `${username}@users.noreply.github.com` : '401k-tracker@example.com');

    const commitMessage =
      process.env.GITHUB_COMMIT_MESSAGE || `Update 401k snapshot (${effectiveDate})`;

    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [latestCommitSha],
      author: {
        name: committerName,
        email: committerEmail,
        date: timestamp,
      },
      committer: {
        name: committerName,
        email: committerEmail,
        date: timestamp,
      },
    });

    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${DEFAULT_BRANCH}`,
      sha: newCommit.sha,
    });

    send(res, 200, {
      ok: true,
      branch: DEFAULT_BRANCH,
      commitSha: newCommit.sha,
      files: files.map(file => file.path),
    });
  } catch (error) {
    console.error('Failed to push snapshot', { message: error.message, status: error.status });
    const status = error.status || 500;
    const rawMessage = error?.message || 'Unexpected GitHub error.';
    let friendly = rawMessage;
    if (/bad credentials/i.test(rawMessage)) {
      friendly = 'GitHub token invalid or missing.';
    } else if (/not found/i.test(rawMessage)) {
      friendly = 'Repo or path not found. Check env variables.';
    } else if (/refname/i.test(rawMessage) || /reference/i.test(rawMessage)) {
      friendly = 'Git ref update failed. Verify branch name and permissions.';
    }

    send(res, status, {
      ok: false,
      error: friendly,
      rawError: rawMessage,
      details: error.response?.data || null,
    });
  }
}
