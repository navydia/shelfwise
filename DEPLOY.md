# Deploying Shelfwise

Shelfwise runs as one small Node process on your server. Tailscale gives it a private HTTPS address your phone can reach from anywhere.

## 1. Install

Needs **Node 22 (LTS)**. Newer versions (such as 26) may fail at `npm ci`, because the database library (`better-sqlite3`) has no ready-made build for them and falls back to compiling from source, which needs Python and C++ build tools. On Windows, install Node 22 from nodejs.org/en/download. On Windows PowerShell, use `npm.cmd` if `npm` is blocked by the script policy.

```sh
git clone <your repo> shelfwise && cd shelfwise   # or copy the folder over
npm ci
```

## 2. Run it

```sh
SHELFWISE_DATA=/var/lib/shelfwise PORT=3000 npm start
```

- Your database and photos live in `SHELFWISE_DATA` (`shelfwise.db`, `photos/`, `tessdata/`).
- The server listens on `127.0.0.1` only. Nothing outside the machine can reach it directly.

To keep it running, use a systemd unit (`/etc/systemd/system/shelfwise.service`):

```ini
[Unit]
Description=Shelfwise
After=network.target

[Service]
WorkingDirectory=/path/to/shelfwise
Environment=SHELFWISE_DATA=/var/lib/shelfwise
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure
User=shelfwise

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl enable --now shelfwise`.

## 3. Give it an HTTPS address with Tailscale

The phone camera only works over HTTPS. In the Tailscale admin console, make sure MagicDNS and HTTPS Certificates are enabled, then on the server:

```sh
tailscale serve --bg 3000
tailscale serve status   # shows your https://<machine>.<tailnet>.ts.net address
```

Tailscale needs to be switched on on your phone whenever you use the app, including in the store. If it is off, Shelfwise shows the last list and prices it saved, with an "Offline" bar, but changes won't save.

## 4. Put it on your iPhone

Open the `https://….ts.net` address in Safari, tap Share, then **Add to Home Screen**. Open it once while online so it can save your data for offline use.

## 5. Check receipt reading (do this once)

Receipt reading uses tesseract.js on the server. The first receipt makes the server download English language data (about 10 MB) into `SHELFWISE_DATA/tessdata`, so the server needs internet access that one time.

This was not testable where the app was built. Upload one real receipt and look at the lines it finds. If the app says receipt reading isn't working, the reason is in the server log (`journalctl -u shelfwise`), most often that the language data could not be downloaded. If lines are missing or garbled, try a flatter, better-lit photo. Reading quality is the most likely thing to need tuning.

## 6. Backups

```sh
./scripts/backup.sh /path/to/backups
```

It saves a dated archive of the database and photos and is safe to run while the server is up. Nightly, via `crontab -e`:

```
15 3 * * * cd /path/to/shelfwise && SHELFWISE_DATA=/var/lib/shelfwise ./scripts/backup.sh /path/to/backups
```

To restore, stop the server first, remove the database's log files, then unpack the archive into the data folder. Leftover `-wal`/`-shm` files can silently replay newer changes over the restored copy, so don't skip the `rm`:

```sh
sudo systemctl stop shelfwise
rm -f /var/lib/shelfwise/shelfwise.db-wal /var/lib/shelfwise/shelfwise.db-shm
tar -xzf shelfwise-YYYY-MM-DD.tar.gz -C /var/lib/shelfwise
sudo systemctl start shelfwise
```
