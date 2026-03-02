/**
 * Alert poller for פתח תקווה
 * Polls every 10 seconds, filters for the city, and distinguishes good (safe) vs bad (threat) messages.
 */

const TARGET_CITY = 'פתח תקווה';
const POLL_INTERVAL_MS = 10_000;

// Good messages = end of alert / safe to leave (checked first)
const GOOD_PHRASES = [
  'האירוע הסתיים',
  'ניתן לצאת מהמרחב המוגן',
  'ניתן לצאת מהמרחבים המוגנים',
];

// Bad messages = active threat (rockets, infiltration, etc.)
const BAD_INDICATORS = [
  'ירי רקטות',
  'חדירת מחבלים',
  'רעידת אדמה',
  'טילים',
  'התרעות פיקוד העורף',
];

function isRelevantForCity(data) {
  if (!data || typeof data !== 'string') return false;
  return data.includes(TARGET_CITY);
}

function classifyMessage(title = '', desc = '') {
  const text = `${title} ${desc}`;

  for (const phrase of GOOD_PHRASES) {
    if (text.includes(phrase)) return 'good';
  }

  for (const phrase of BAD_INDICATORS) {
    if (text.includes(phrase)) return 'bad';
  }

  // Pre-alerts, stay-near, etc. - treat as informational, not bad
  if (text.includes('בדקות הקרובות') || text.includes('שהייה בסמיכות') || text.includes('עדכון')) {
    return 'info';
  }

  return 'unknown';
}

function parseOrefAlerts(buf) {
  const bytes = new Uint8Array(buf);
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(bytes.slice(2));
  } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = new TextDecoder('utf-8').decode(bytes.slice(3));
  } else {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  text = text.replace(/\x00/g, '').replace(/\u0a7b/g, '').trim();
  if (!text) return { data: [] };
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : { data: [] };
  } catch (e) {
    throw new Error('תגובת שרת לא תקינה (JSON)');
  }
}

async function fetchAlerts() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const res = await fetch('/api/oref', {
      signal: c.signal,
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.oref.org.il/' },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return parseOrefAlerts(buf);
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

async function fetchAlertsHistory() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const res = await fetch('/api/oref-history', { signal: c.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

function alertsJsonToMessages(json) {
  if (!json || !json.data || !Array.isArray(json.data)) return [];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const cities = json.data.filter((c) => c && typeof c === 'string');
  const dataStr = cities.join(', ');
  if (!isRelevantForCity(dataStr)) return [];
  return [{
    type: classifyMessage(json.title, json.title),
    alertDate: now,
    title: json.title || '',
    desc: json.title || '',
    data: dataStr,
    category: json.cat,
  }];
}

function historyToMessages(history, windowMinutes = 60 * 24) {
  if (!Array.isArray(history)) return [];
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const mapped = history
    .filter((item) => item.alertDate && new Date(item.alertDate).getTime() >= cutoff && isRelevantForCity(item.data))
    .map((item) => ({
      type: classifyMessage(item.title, item.desc || item.title),
      alertDate: item.alertDate,
      title: item.title || '',
      desc: item.desc || '',
      data: item.data || '',
      category: item.category,
    }));
  return mapped.sort((a, b) => new Date(b.alertDate).getTime() - new Date(a.alertDate).getTime());
}

function now() {
  return new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const EMPTY_DEBOUNCE = 2;

export function poll(callback) {
  let intervalId;
  let consecutiveEmpty = 0;

  async function run() {
    const logs = [];
    const addLog = (msg) => logs.push(`[${now()}] ${msg}`);

    addLog('בודק התרעות...');
    try {
      const [alertsJson, history] = await Promise.all([fetchAlerts(), fetchAlertsHistory()]);
      let messages = alertsJsonToMessages(alertsJson);
      if (messages.length === 0) {
        messages = historyToMessages(history);
      }
      const histCount = history.filter((h) => isRelevantForCity(h.data)).length;
      addLog(`Alerts: ${alertsJson?.data?.length ?? 0}, History פתח תקווה: ${histCount}`);

      const latest = messages.length ? messages[0] : null;
      const hasBad = messages.some((m) => m.type === 'bad');
      const hasGood = messages.some((m) => m.type === 'good');

      if (messages.length === 0) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= EMPTY_DEBOUNCE) {
          addLog('אין התרעות רלוונטיות לפתח תקווה');
        } else {
          addLog('(תגובה ריקה – בודק שוב)');
        }
      } else {
        consecutiveEmpty = 0;
        if (latest?.type === 'bad') {
          addLog(`התרעה: ${latest.title}`);
        } else if (latest?.type === 'good') {
          addLog(`בטוח: ${latest.title}`);
        } else {
          addLog(`עדכון: ${latest?.title ?? ''}`);
        }
      }

      const shouldClear = messages.length === 0 && consecutiveEmpty >= EMPTY_DEBOUNCE;
      const latestToUse = shouldClear ? null : (latest ?? undefined);

      callback({
        status: 'ok',
        logLines: logs,
        messages,
        summary: {
          hasAlert: hasBad,
          isSafe: hasGood && !hasBad,
          latest: latest ? latest.type : (shouldClear ? null : undefined),
          latestMessage: latest ?? (shouldClear ? null : undefined),
        },
      });
    } catch (err) {
      addLog(`שגיאה: ${err.message}`);
      callback({
        status: 'error',
        error: err.message,
        logLines: logs,
        messages: [],
        summary: { hasAlert: false, isSafe: false, latest: null, latestMessage: undefined },
      });
    }
  }

  run(); // run immediately
  intervalId = setInterval(run, POLL_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

export { TARGET_CITY, POLL_INTERVAL_MS, classifyMessage, isRelevantForCity };
