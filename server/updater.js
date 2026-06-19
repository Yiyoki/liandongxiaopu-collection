import './loadEnv.js';
import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pm2Command = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';
const githubRepo = process.env.LDXP_GITHUB_REPO || 'Yiyoki/liandongxiaopu-collection';
const githubBranch = process.env.LDXP_GITHUB_BRANCH || 'main';

let updateInProgress = false;

export async function getVersionInfo({ checkRemote = false } = {}) {
  const info = {
    updateInProgress,
    mode: 'git',
    isGitRepo: false,
    isContainer: isContainerRuntime(),
    branch: null,
    remote: null,
    remoteBranch: null,
    localHash: null,
    localShortHash: null,
    remoteHash: null,
    remoteShortHash: null,
    image: process.env.LDXP_IMAGE || process.env.IMAGE_NAME || null,
    version: process.env.LDXP_VERSION || process.env.npm_package_version || null,
    ahead: 0,
    behind: 0,
    dirty: false,
    hasUpdate: false,
    checkedAt: new Date().toISOString(),
    remoteError: null
  };

  if (process.env.LDXP_DEPLOY_MODE === 'container') {
    return getContainerVersionInfo(info, { checkRemote });
  }

  try {
    const inside = await runGit(['rev-parse', '--is-inside-work-tree']);
    info.isGitRepo = inside.stdout.trim() === 'true';
  } catch {
    return getContainerVersionInfo(info, { checkRemote });
  }

  info.branch = (await runGit(['branch', '--show-current'])).stdout.trim() || 'main';
  info.remote = await optionalGit(['config', '--get', 'remote.origin.url']);
  info.remoteBranch = `origin/${info.branch}`;
  info.localHash = (await runGit(['rev-parse', 'HEAD'])).stdout.trim();
  info.localShortHash = (await runGit(['rev-parse', '--short', 'HEAD'])).stdout.trim();
  info.dirty = Boolean((await runGit(['status', '--porcelain', '--untracked-files=no'])).stdout.trim());

  if (checkRemote) {
    try {
      await runGit(['fetch', 'origin', info.branch]);
    } catch (error) {
      info.remoteError = commandErrorMessage(error);
      return info;
    }
  }

  try {
    info.remoteHash = (await runGit(['rev-parse', info.remoteBranch])).stdout.trim();
    info.remoteShortHash = (await runGit(['rev-parse', '--short', info.remoteBranch])).stdout.trim();
    const counts = (await runGit(['rev-list', '--left-right', '--count', `HEAD...${info.remoteBranch}`])).stdout.trim().split(/\s+/);
    info.ahead = Number(counts[0] || 0);
    info.behind = Number(counts[1] || 0);
    info.hasUpdate = info.behind > 0;
  } catch (error) {
    if (checkRemote) info.remoteError = commandErrorMessage(error);
  }

  return info;
}

export async function runSelfUpdate() {
  if (updateInProgress) {
    throw httpError(409, 'Update is already in progress');
  }

  updateInProgress = true;
  try {
    const before = await getVersionInfo({ checkRemote: true });
    if (before.mode === 'container') {
      return await runContainerUpdate(before);
    }
    if (!before.isGitRepo) {
      throw httpError(400, 'Current deployment is not a Git repository');
    }
    if (before.remoteError) {
      throw httpError(502, before.remoteError);
    }
    if (before.dirty) {
      throw httpError(409, 'Local tracked files have uncommitted changes. Please commit or revert them before updating.');
    }
    if (before.ahead > 0 && before.behind > 0) {
      throw httpError(409, 'Local branch and GitHub branch have diverged. Fast-forward update is not safe.');
    }
    if (!before.hasUpdate) {
      return {
        updated: false,
        message: 'Already up to date',
        version: before,
        restart: { scheduled: false, mode: 'none' }
      };
    }

    const logs = [];
    logs.push(await runAndSummarize('git', ['pull', '--ff-only', 'origin', before.branch]));
    logs.push(await runAndSummarize(npmCommand, await installArgs()));
    logs.push(await runAndSummarize(npmCommand, ['run', 'build']));

    const version = await getVersionInfo({ checkRemote: false });
    const restart = scheduleRestart();

    return {
      updated: true,
      message: 'Update installed. Restart scheduled.',
      version,
      restart,
      logs
    };
  } finally {
    updateInProgress = false;
  }
}

async function getContainerVersionInfo(info, { checkRemote }) {
  const localHash = process.env.LDXP_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.SOURCE_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    null;

  info.mode = 'container';
  info.branch = githubBranch;
  info.remote = `https://github.com/${githubRepo}.git`;
  info.remoteBranch = `origin/${githubBranch}`;
  info.localHash = localHash;
  info.localShortHash = shortHash(localHash) || info.version || info.image || 'container';

  if (checkRemote) {
    try {
      const latest = await fetchGithubLatestCommit();
      info.remoteHash = latest.sha;
      info.remoteShortHash = shortHash(latest.sha);
      info.hasUpdate = Boolean(localHash && latest.sha && !latest.sha.startsWith(localHash) && !localHash.startsWith(latest.sha));
      if (!localHash) {
        info.remoteError = 'Container version env is not set. Set LDXP_COMMIT_SHA at image build time to compare updates.';
      }
    } catch (error) {
      info.remoteError = error.message;
    }
  }

  return info;
}

async function runContainerUpdate(before) {
  const command = process.env.LDXP_CONTAINER_UPDATE_COMMAND || process.env.LDXP_UPDATE_COMMAND;
  if (!command) {
    throw httpError(
      400,
      'Container self update requires LDXP_CONTAINER_UPDATE_COMMAND. Use it to trigger your compose/pull/recreate workflow from the host or orchestrator.'
    );
  }

  const started = spawn(command, {
    cwd: rootDir,
    env: process.env,
    shell: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  started.unref();

  return {
    updated: true,
    message: 'Container update command started.',
    version: before,
    restart: { scheduled: true, mode: 'container-command', command }
  };
}

async function fetchGithubLatestCommit() {
  const url = `https://api.github.com/repos/${githubRepo}/commits/${githubBranch}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'ldxp-price-board'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`GitHub version check failed: ${response.status}`);
  }
  return response.json();
}

function isContainerRuntime() {
  return Boolean(
    process.env.LDXP_DEPLOY_MODE === 'container' ||
    process.env.KUBERNETES_SERVICE_HOST ||
    process.env.DOCKER_CONTAINER ||
    process.env.HOSTNAME
  );
}

function shortHash(value) {
  return value ? String(value).slice(0, 7) : null;
}

async function optionalGit(args) {
  try {
    return (await runGit(args)).stdout.trim();
  } catch {
    return null;
  }
}

async function installArgs() {
  try {
    await access(path.join(rootDir, 'package-lock.json'));
    return ['ci'];
  } catch {
    return ['install'];
  }
}

function runGit(args) {
  return runCommand('git', args);
}

async function runAndSummarize(command, args) {
  const result = await runCommand(command, args);
  return {
    command: [command, ...args].join(' '),
    output: compactOutput(`${result.stdout}\n${result.stderr}`)
  };
}

async function runCommand(command, args) {
  try {
    return await execFileAsync(command, args, {
      cwd: rootDir,
      env: { ...process.env, CI: process.env.CI || 'true' },
      maxBuffer: 1024 * 1024 * 20,
      windowsHide: true
    });
  } catch (error) {
    error.message = commandErrorMessage(error);
    throw error;
  }
}

function scheduleRestart() {
  const customCommand = process.env.LDXP_RESTART_COMMAND;
  if (customCommand) {
    setTimeout(() => {
      spawn(customCommand, {
        cwd: rootDir,
        env: process.env,
        shell: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
    }, 800);
    return { scheduled: true, mode: 'custom-command', command: customCommand };
  }

  if (process.env.pm_id !== undefined) {
    const processId = process.env.pm_id;
    setTimeout(() => {
      spawn(pm2Command, ['restart', processId], {
        cwd: rootDir,
        env: process.env,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
    }, 800);
    return { scheduled: true, mode: 'pm2', target: processId };
  }

  setTimeout(() => {
    process.exit(0);
  }, 1200);
  return { scheduled: true, mode: 'process-exit' };
}

function compactOutput(output) {
  const clean = output.replace(/\r/g, '').trim();
  if (clean.length <= 2000) return clean;
  return `${clean.slice(0, 1000)}\n...\n${clean.slice(-1000)}`;
}

function commandErrorMessage(error) {
  const output = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
  return output || error.message || 'Command failed';
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
