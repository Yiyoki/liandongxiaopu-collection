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

let updateInProgress = false;

export async function getVersionInfo({ checkRemote = false } = {}) {
  const info = {
    updateInProgress,
    isGitRepo: false,
    branch: null,
    remote: null,
    remoteBranch: null,
    localHash: null,
    localShortHash: null,
    remoteHash: null,
    remoteShortHash: null,
    ahead: 0,
    behind: 0,
    dirty: false,
    hasUpdate: false,
    checkedAt: new Date().toISOString(),
    remoteError: null
  };

  try {
    const inside = await runGit(['rev-parse', '--is-inside-work-tree']);
    info.isGitRepo = inside.stdout.trim() === 'true';
  } catch {
    return info;
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
