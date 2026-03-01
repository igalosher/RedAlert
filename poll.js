#!/usr/bin/env node
/**
 * Standalone poller - run with: node poll.js
 * Polls Oref AlertsHistory every 10 seconds for פתח תקווה.
 * Good = safe to leave, Bad = active threat.
 */

const TARGET_CITY = 'פתח תקווה';
const POLL_INTERVAL_MS = 10_000;

const GOOD_PHRASES = ['ניתן לצאת מהמרחב המוגן', 'ניתן לצאת מהמרחבים המוגנים'];
const BAD_INDICATORS = ['ירי רקטות', 'חדירת מחבלים', 'רעידת אדמה', 'טילים', 'התרעות פיקוד העורף'];

function isRelevantForCity(data) {
  if (!data || typeof data !== 'string') return false;
  return data.includes(TARGET_CITY);
}

function classifyMessage(title = '', desc = '') {
  const text = `${title} ${desc}`;
  for (const phrase of GOOD_PHRASES) if (text.includes(phrase)) return 'good';
  for (const phrase of BAD_INDICATORS) if (text.includes(phrase)) return 'bad';
  if (text.includes('בדקות הקרובות') || text.includes('שהייה בסמיכות') || text.includes('עדכון')) return 'info';
  return 'unknown';
}

async function fetchAlertsHistory() {
  const url = 'https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json';
  const res = await fetch(url, {
    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.oref.org.il/' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function getRecentAlerts(history, windowSeconds = 120) {
  if (!Array.isArray(history)) return [];
  const cutoff = Date.now() - windowSeconds * 1000;
  return history.filter((item) => {
    const ts = item.alertDate ? new Date(item.alertDate).getTime() : 0;
    return ts >= cutoff;
  });
}

function run() {
  fetchAlertsHistory()
    .then((history) => {
      const recent = getRecentAlerts(history);
      const forCity = recent.filter((item) => isRelevantForCity(item.data));

      const messages = forCity.map((item) => ({
        type: classifyMessage(item.title, item.desc || item.title),
        alertDate: item.alertDate,
        title: item.title,
        data: item.data,
      }));

      const hasBad = messages.some((m) => m.type === 'bad');
      const hasGood = messages.some((m) => m.type === 'good');
      const latest = messages[messages.length - 1];

      const now = new Date().toLocaleTimeString('he-IL');
      if (messages.length === 0) {
        console.log(`[${now}] פתח תקווה: No recent alerts`);
        return;
      }

      let status = hasBad ? 'BAD ⛔' : hasGood ? 'GOOD ✅' : 'INFO ℹ️';
      console.log(`[${now}] פתח תקווה: ${status}`);
      messages.forEach((m) => {
        const icon = m.type === 'bad' ? '⛔' : m.type === 'good' ? '✅' : 'ℹ️';
        console.log(`  ${icon} ${m.alertDate} | ${m.title}`);
      });
    })
    .catch((err) => console.error(`[${new Date().toLocaleTimeString('he-IL')}] Error:`, err.message));
}

run();
setInterval(run, POLL_INTERVAL_MS);
