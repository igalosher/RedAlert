import { useEffect, useState, useRef } from 'react';
import { poll } from './alertPoller';
import packageJson from '../package.json';

function formatIsraelTime(alertDate) {
  if (!alertDate) return '';
  const d = new Date(alertDate.replace(' ', 'T'));
  if (isNaN(d.getTime())) return alertDate;
  return d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'medium' });
}

function formatCities(data) {
  if (!data) return '';
  const cities = data.split(',').map((c) => c.trim()).filter(Boolean);
  if (cities.length <= 1) return data;
  return `פתח תקווה + ${cities.length - 1} ערים נוספות`;
}

function App() {
  const [state, setState] = useState({
    status: 'loading',
    summary: { latest: null, latestMessage: null },
    logLines: [],
  });
  const logEndRef = useRef(null);

  useEffect(() => {
    const stop = poll((result) => {
      setState((prev) => {
        const next = { ...prev };
        if (result.logLines?.length) {
          next.logLines = [...prev.logLines, ...result.logLines].slice(-50);
        }
        if (result.status !== undefined) next.status = result.status;
        if (result.summary) {
          next.summary = {
            ...prev.summary,
            ...result.summary,
            latestMessage: result.summary.latestMessage !== undefined
              ? result.summary.latestMessage
              : prev.summary.latestMessage,
          };
        }
        return next;
      });
    });
    return stop;
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logLines]);

  const { summary, logLines } = state;
  const latest = summary.latestMessage;
  const circleState = latest?.type === 'bad' ? 'bad' : latest?.type === 'info' ? 'info' : 'good';
  const version = packageJson.version;

  return (
    <div className="app">
      <div className="version-badge">v{version}</div>
      <div className="center">
        <div className={`circle ${circleState}`} />
      </div>
      <section className="last-message">
        <h3>הודעה רלוונטית אחרונה לפתח תקווה</h3>
        <table className="message-table">
          <tbody>
            {latest ? (
              <>
                <tr><th>תאריך</th><td>{formatIsraelTime(latest.alertDate)}</td></tr>
                <tr><th>כותרת</th><td>{latest.title}</td></tr>
                <tr><th>יישובים</th><td>{formatCities(latest.data)}</td></tr>
                <tr><th>סוג</th><td>{latest.type === 'bad' ? 'התרעה' : latest.type === 'good' ? 'בטוח' : latest.type === 'info' ? 'התרעה מקדימה' : latest.type}</td></tr>
                {latest.desc && <tr><th>הוראות</th><td>{latest.desc}</td></tr>}
              </>
            ) : (
              <tr><td colSpan={2}>אין הודעה רלוונטית</td></tr>
            )}
          </tbody>
        </table>
      </section>
      <div className="log">
        {logLines.map((line, i) => (
          <div key={i} className="log-line">
            {line}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

export default App;
