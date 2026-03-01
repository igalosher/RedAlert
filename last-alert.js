const TARGET = 'פתח תקווה';
const BASE = process.env.VITE_DEV ? 'http://localhost:5173' : '';
async function run() {
  try {
    const url = BASE ? `${BASE}/api/tzevaadom` : 'https://api.tzevaadom.co.il/notifications';
    const res = await fetch(url);
    const text = await res.text();
    if (!text?.trim()) throw new Error('Empty response');
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json : (json.value || []);
    const forCity = list.filter((n) =>
      (n.cities || []).some((c) => c && c.includes('פתח') && c.includes('תקווה'))
    );
    if (forCity.length) {
      const last = forCity[forCity.length - 1];
      console.log('Last relevant message for פתח תקווה:');
      console.log('  Time:', new Date(last.time * 1000).toISOString());
      console.log('  Cities:', last.cities?.join(', '));
      console.log('  Threat:', last.threat, last.isDrill ? '(drill)' : '');
    } else {
      console.log('No recent alerts for פתח תקווה (from tzevaadom).');
      console.log('Tzevaadom has', list.length, 'current notification(s).');
      if (list.length) {
        const latest = list[list.length - 1];
        console.log('Latest notification (any city):');
        console.log('  Time:', new Date(latest.time * 1000).toISOString());
        console.log('  Cities:', latest.cities?.join(', '));
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
