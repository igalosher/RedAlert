export default function orefHistoryPlugin() {
  return {
    name: 'oref-history',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/oref-history') return next();
        try {
          const r = await fetch('https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json', {
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.oref.org.il/' },
          });
          const buf = Buffer.from(await r.arrayBuffer());
          let text = buf.toString('utf8');
          if (buf[0] === 0xff && buf[1] === 0xfe) {
            text = buf.slice(2).toString('utf16le');
          } else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
            text = buf.slice(3).toString('utf8');
          }
          text = text.replace(/\x00/g, '').replace(/\u0a7b/g, '');
          let data = [];
          try {
            data = JSON.parse(text);
          } catch (e) {
            const last = text.trim().lastIndexOf(']');
            if (last > 100) data = JSON.parse(text.slice(0, last + 1));
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(Array.isArray(data) ? data : []));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
