import { getSettings, refreshAllShops } from './shops.js';

const CHECK_INTERVAL_MS = 30 * 1000;
let timer = null;
let running = false;

export function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.();
}

export async function tick() {
  if (running) return;

  const settings = await getSettings();
  if (!settings.autoRefreshEnabled) return;

  const intervalMs = Math.max(1, settings.refreshIntervalMinutes) * 60 * 1000;
  const lastRefresh = settings.lastAutoRefreshAt
    ? new Date(settings.lastAutoRefreshAt).getTime()
    : 0;

  if (Date.now() - lastRefresh < intervalMs) return;

  running = true;
  try {
    await refreshAllShops();
  } catch (error) {
    console.error('Auto refresh failed:', error);
  } finally {
    running = false;
  }
}
