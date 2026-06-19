import './loadEnv.js';

const DEFAULT_ADMIN_PASSWORD = 'admin123';
import { readStore } from './storage.js';

export async function requireAdmin(req, res, next) {
  const expected = await getAdminPassword();
  const received = req.headers['x-admin-password'];

  if (received !== expected) {
    res.status(401).json({ message: '管理密码不正确' });
    return;
  }

  next();
}

export async function verifyAdminPassword(password) {
  const expected = await getAdminPassword();
  return password === expected;
}

export function setRuntimeAdminPassword(password) {
  process.env.ADMIN_PASSWORD = password;
}

async function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const store = await readStore();
  return store.settings?.adminPassword || DEFAULT_ADMIN_PASSWORD;
}
