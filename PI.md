# RedAlert on Pi Zero

## Restart web service every 12 hours

On the Pi, run:

```bash
sudo systemctl edit redalert-web.service
```

In the editor, add:

```ini
[Service]
RuntimeMaxSec=43200
```

Save and exit (Ctrl+O, Enter, Ctrl+X). Then:

```bash
sudo systemctl daemon-reload
```

The `redalert-web` service will restart every 12 hours (43200 seconds).
