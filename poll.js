#!/usr/bin/env node
/**
 * Standalone poller - run with: node poll.js
 * Polls Oref AlertsHistory every 10 seconds for פתח תקווה.
 * Good = safe to leave, Bad = active threat.
 */

import http from 'node:http';
import { URL } from 'node:url';

const TARGET_CITY = 'פתח תקווה';
const POLL_INTERVAL_MS = 10_000;

const GOOD_PHRASES = ['ניתן לצאת מהמרחב המוגן', 'ניתן לצאת מהמרחבים המוגנים'];
const BAD_INDICATORS = ['ירי רקטות', 'חדירת מחבלים', 'רעידת אדמה', 'טילים', 'התרעות פיקוד העורף'];

const IFTTT_WEBHOOKS = {
  red: 'https://maker.ifttt.com/trigger/Red_Alert/with/key/TNzyJuJGFlmk9mt6IH_4G',
  yellow: 'https://maker.ifttt.com/trigger/Yellow_Alert/with/key/TNzyJuJGFlmk9mt6IH_4G',
  green: 'https://maker.ifttt.com/trigger/Green_Alert/with/key/TNzyJuJGFlmk9mt6IH_4G',
};

let lastWebhookKind = null;

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

  // The Oref endpoint sometimes returns truncated JSON arrays.
  // Parse defensively, similar to the Vite dev server plugin.
  const text = await res.text();
  if (!text?.trim()) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    const trimmed = text.trim();
    const last = trimmed.lastIndexOf(']');
    if (last > 100) {
      try {
        const parsed = JSON.parse(trimmed.slice(0, last + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // fall through to error below
      }
    }
    throw new Error('Unexpected end of JSON input from Oref history');
  }
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

        // When there are no messages recently, treat as "green" state
        const kind = 'green';
        if (lastWebhookKind !== kind) {
          lastWebhookKind = kind;
          triggerIFTTT(kind, now);
        }
        return;
      }

      let status = hasBad ? 'BAD ⛔' : hasGood ? 'GOOD ✅' : 'INFO ℹ️';
      console.log(`[${now}] פתח תקווה: ${status}`);
      messages.forEach((m) => {
        const icon = m.type === 'bad' ? '⛔' : m.type === 'good' ? '✅' : 'ℹ️';
        console.log(`  ${icon} ${m.alertDate} | ${m.title}`);
      });

      // Decide which webhook to fire based on latest message type
      let kind = null;
      if (latest?.type === 'bad') {
        kind = 'red';
      } else if (latest?.type === 'info') {
        kind = 'yellow';
      } else if (latest?.type === 'good') {
        kind = 'green';
      }

      if (kind && lastWebhookKind !== kind) {
        lastWebhookKind = kind;
        triggerIFTTT(kind, now);
      }
    })
    .catch((err) => console.error(`[${new Date().toLocaleTimeString('he-IL')}] Error:`, err.message));
}

async function triggerIFTTT(kind, nowLabel = new Date().toLocaleTimeString('he-IL')) {
  const url = IFTTT_WEBHOOKS[kind];
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      console.error(`[${nowLabel}] IFTTT webhook failed (${kind}): HTTP ${res.status}`);
    } else {
      console.log(`[${nowLabel}] IFTTT webhook sent: ${kind}`);
    }
  } catch (err) {
    console.error(`[${nowLabel}] Error sending IFTTT webhook ${kind}:`, err.message);
  }
}

const CONTROL_PORT = process.env.RED_ALERT_CONTROL_PORT || 4000;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/ifttt') {
      const kind = url.searchParams.get('kind');
      if (!['red', 'yellow', 'green'].includes(kind)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid kind' }));
        return;
      }
      await triggerIFTTT(kind);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, kind }));
      return;
    }

    res.statusCode = 404;
    res.end('Not found');
  } catch (err) {
    res.statusCode = 500;
    res.end('Internal error');
  }
});

server.listen(CONTROL_PORT, () => {
  console.log(`Control server listening on http://localhost:${CONTROL_PORT}`);
});

run();
setInterval(run, POLL_INTERVAL_MS);
