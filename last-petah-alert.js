const TARGET = 'פתח תקווה';
async function run() {
  try {
    const res = await fetch('http://localhost:5173/api/oref-history');
    if (!res.ok) throw new Error('Server not running? Try: npm run dev');
    const history = await res.json();
    const matches = (history || []).filter((i) => i.data && i.data.includes(TARGET));
    if (matches.length === 0) {
      console.log('No alerts for פתח תקווה found.');
      return;
    }
    const last = matches[matches.length - 1];
    const d = new Date(last.alertDate);
    const ilTime = d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'medium' });
    console.log('Last פתח תקווה alert (Israel time):');
    console.log('  ', ilTime);
    console.log('  Title:', last.title);
    console.log('  Data:', last.data);
  } catch (e) {
    console.error(e.message);
  }
}
run();
