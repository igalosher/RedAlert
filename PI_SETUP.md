# RedAlert Pi – full setup (recreate from scratch)

Use this to set up or recreate the Raspberry Pi that runs the RedAlert app and IFTTT webhooks.

---

## 1. Prerequisites on the Pi

- **OS:** Raspberry Pi OS (or any Linux with Node.js 18+).
- **Node.js:** Install Node.js 18 or newer (required for `fetch` in `poll.js` and Vite).
  ```bash
  # Example: install via NodeSource (adjust for your OS)
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node -v   # should show v18+ or v20+
  ```
- **Git:** `sudo apt-get install -y git` if not present.

---

## 2. Clone the repo and install dependencies

```bash
cd ~
git clone https://github.com/igalosher/RedAlert.git red-alert
cd red-alert
npm install
```

If the Pi already has an old clone and you want to match GitHub (discard local changes):

```bash
cd ~/red-alert
git fetch origin
git reset --hard origin/main
npm install
```

---

## 3. Important configuration (already in the repo)

These are **in code**; no extra Pi-only config files needed.

- **Vite dev server** (`vite.config.js`):
  - `server.host: '0.0.0.0'` – listen on all interfaces so you can open the page from other devices.
  - `server.allowedHosts: ['redalert']` – allow access when opening `http://redalert:5173/`.
  - Proxy `/api/oref` → Oref API, `/api/ifttt` → `http://localhost:4000`.

- **Poller + control server** (`poll.js`):
  - Listens on **port 4000** for `POST /api/ifttt?kind=red|yellow|green` (test buttons).
  - Port can be overridden with `RED_ALERT_CONTROL_PORT` (e.g. `RED_ALERT_CONTROL_PORT=4000 node poll.js`).
  - Polls Oref alerts and fires IFTTT webhooks (red / yellow / green) when alert state changes.

- **IFTTT webhook URLs** are in `poll.js` (red, yellow, green). Edit there if you change IFTTT applets or keys.

---

## 4. Ports

| Port  | Service              | Purpose                                      |
|-------|----------------------|----------------------------------------------|
| 5173  | Vite dev server      | Web UI at `http://redalert:5173/` (or Pi IP)  |
| 4000  | `node poll.js`       | Control API for test buttons → IFTTT         |

Ensure nothing else uses 4000 or 5173 on the Pi.

---

## 5. Systemd services (auto-start on boot)

Create both services so they start on every reboot. Replace `igal` and `/home/igal/red-alert` with your Pi username and repo path if different.

### 5.1 Poller + IFTTT control server (required for webhooks and test buttons)

```bash
sudo nano /etc/systemd/system/redalert-poll.service
```

Paste:

```ini
[Unit]
Description=RedAlert poller and IFTTT control server
After=network.target

[Service]
WorkingDirectory=/home/igal/red-alert
ExecStart=/usr/bin/node poll.js
Restart=always
RestartSec=5
User=igal
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Save and exit. Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable redalert-poll.service
sudo systemctl start redalert-poll.service
sudo systemctl status redalert-poll.service
```

You should see “Control server listening on http://localhost:4000” in the logs (`journalctl -u redalert-poll.service -f`).

### 5.2 Web UI (Vite dev server)

```bash
sudo nano /etc/systemd/system/redalert-web.service
```

Paste:

```ini
[Unit]
Description=RedAlert Vite dev server
After=network.target

[Service]
WorkingDirectory=/home/igal/red-alert
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port 5173
Restart=always
RestartSec=5
User=igal
Environment=NODE_ENV=development
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Save and exit. Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable redalert-web.service
sudo systemctl start redalert-web.service
sudo systemctl status redalert-web.service
```

### 5.3 Boot-time update (pull latest code and restart app on every reboot)

After each reboot, the Pi can automatically pull the latest code from GitHub and restart the two app services so you always run the newest version (e.g. 1.07, 1.08).

**One-time setup on the Pi:**

```bash
cd ~/red-alert
chmod +x scripts/pi-boot-update.sh
```

Edit the service file so the path matches your repo. If your repo is at `/home/igal/red-alert`, the path in the file is already correct. Otherwise run:

```bash
sed -i "s|/home/igal/red-alert|$HOME/red-alert|g" scripts/redalert-boot-update.service
```

Then install and enable the boot-update service:

```bash
sudo cp scripts/redalert-boot-update.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable redalert-boot-update.service
```

**Order at boot:** `redalert-boot-update` runs after network is up. It runs `git fetch` + `git reset --hard origin/main`, `npm install`, then restarts `redalert-poll` and `redalert-web`. The app services start first (from step 5.1 and 5.2); this oneshot runs once and updates + restarts them so they pick up the latest code.

**To test without rebooting:**

```bash
sudo /home/igal/red-alert/scripts/pi-boot-update.sh
```

(Use your actual repo path if different.)

---

## 6. Optional: restart web service every 12 hours

See [PI.md](./PI.md). In short:

```bash
sudo systemctl edit redalert-web.service
```

Add under `[Service]`:

```ini
RuntimeMaxSec=43200
```

Then `sudo systemctl daemon-reload`. The web service will restart every 12 hours.

---

## 7. Hostname / DNS

To open the app as `http://redalert:5173/` from your PC, either:

- Set the Pi hostname to `redalert` (e.g. Raspberry Pi OS: **Preferences → Raspberry Pi Configuration → System → Hostname**), and ensure your router or `/etc/hosts` resolves `redalert` to the Pi’s IP, or  
- Use the Pi’s IP instead: `http://<pi-ip>:5173/`.

---

## 8. After code updates (git pull)

**If you enabled boot-time update (5.3):** A reboot is enough — the Pi will pull and restart automatically. To update without rebooting, run once:

```bash
sudo ~/red-alert/scripts/pi-boot-update.sh
```

**If you did not set up boot update,** run manually:

```bash
cd ~/red-alert
git fetch origin
git reset --hard origin/main   # or: git pull --rebase origin main
npm install
sudo systemctl restart redalert-poll.service
sudo systemctl restart redalert-web.service
```

---

## 9. Quick reference – manual run (no systemd)

For testing without systemd:

```bash
# Terminal 1 – web UI
cd ~/red-alert && npm run dev

# Terminal 2 – poller + IFTTT control (must run for test buttons to work)
cd ~/red-alert && node poll.js
```

---

## 10. Checklist (recreate Pi)

- [ ] Pi has Node.js 18+ and git.
- [ ] Repo cloned to `~/red-alert`, `npm install` run.
- [ ] `redalert-poll.service` installed, enabled, started (port 4000).
- [ ] `redalert-web.service` installed, enabled, started (port 5173).
- [ ] Hostname or DNS so you can open `http://redalert:5173/` (or Pi IP).
- [ ] (Optional) Boot update: `scripts/pi-boot-update.sh` executable, `redalert-boot-update.service` installed and enabled.
- [ ] Test: open UI → click “Test Red/Yellow/Green IFTTT” → IFTTT fires and `journalctl -u redalert-poll.service` shows “IFTTT webhook sent”.
