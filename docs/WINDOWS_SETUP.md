# Running the backend on an always-on Windows laptop

This guide turns a Windows 10/11 laptop into a small home server that runs
**Postgres**, **Ollama** and the **DSA Tracker API**. The Expo app on your phone
then talks to the laptop over your Wi-Fi, or from anywhere through Tailscale.

```
 phone (Expo app) ──Wi-Fi / Tailscale──▶ laptop :3000  DSA Tracker API (pm2)
                                                 ├──▶ :5432  Postgres (Windows service)
                                                 └──▶ :11434 Ollama (qwen2.5:7b)
```

Run every command in **PowerShell**. Commands marked **(Admin)** need an
elevated window: right-click Start, then choose *Terminal (Admin)*.

---

## 1. Install the tools

Use `winget`, which ships with Windows 11 and current Windows 10:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Ollama.Ollama -e
winget install --id tailscale.tailscale -e     # optional, for access away from home
```

Then **close and reopen PowerShell** so the new commands are on your PATH, and
check them:

```powershell
git --version; node -v; npm -v; ollama --version
npm install -g pm2
```

Allow local scripts to run. This applies to your user only, and the repo's
scripts aren't downloaded files, so `RemoteSigned` is enough:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 2. Postgres

Use the **native installer**. It runs as a Windows service, so it starts at boot
before anyone logs in. Docker Desktop is the alternative, but it only starts
after you log in, which works against an unattended server.

### Option A: native Postgres (recommended)

```powershell
winget install --id PostgreSQL.PostgreSQL.16 -e --interactive
```

The installer asks for a password for the `postgres` superuser. Keep the default
port **5432**. You can skip Stack Builder at the end.

Next, create an app user and database. Pick your own password and use it in both
commands below:

```powershell
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
& $psql -U postgres -h localhost -c "CREATE USER dsa WITH PASSWORD 'choose-a-strong-password';"
& $psql -U postgres -h localhost -c "CREATE DATABASE dsatracker OWNER dsa;"
```

Each `psql` command asks for the `postgres` password from the installer. Postgres
only listens on localhost by default, which is what you want: only the API talks
to it.

The service is already set to start automatically. To check:

```powershell
Get-Service postgresql*
```

### Option B: Docker Desktop

```powershell
winget install --id Docker.DockerDesktop -e
# reboot, start Docker Desktop once, enable "Start Docker Desktop when you sign in"
cd $HOME\Dsa-Tracker        # after cloning (step 4)
docker compose up -d db
```

This uses `docker-compose.yml`: user `dsa`, password `dsa`, port 5432, and it
creates both `dsatracker` and `dsatracker_test`. Docker only starts after you
log in, so also turn on Windows auto-login, or log in once after every reboot.

## 3. Ollama and the model

```powershell
ollama pull qwen2.5:7b
ollama run qwen2.5:7b "Say hi in five words"
```

- `qwen2.5:7b` is about a 4.7 GB download and needs **about 16 GB RAM** to run comfortably.
- **8 GB RAM laptops:** use `ollama pull qwen2.5:3b` or `ollama pull llama3.2:3b`,
  and set `OLLAMA_MODEL` to match in `.env` (step 4).
- The Windows installer adds a tray app that starts Ollama when you **log in**.
  The startup task in step 8 starts `ollama serve` at **boot** instead, so you
  don't need to log in. If the tray app complains at login that port 11434 is in
  use, turn it off under Settings > Apps > Startup > Ollama. The boot task
  already runs the server.

If Ollama is down or slow, the API automatically answers with the built-in
"Smart rules" provider, so the app keeps working.

## 4. Get the code and configure it

```powershell
cd $HOME
git clone https://github.com/<you>/Dsa-Tracker.git
cd Dsa-Tracker
.\scripts\windows\setup.ps1 -DatabaseUrl "postgresql://dsa:choose-a-strong-password@localhost:5432/dsatracker?schema=public"
```

With Docker (option B), use
`-DatabaseUrl "postgresql://dsa:dsa@localhost:5432/dsatracker?schema=public"`.

`setup.ps1` does the following:

1. Creates `.env` from `.env.example` with a random `JWT_SECRET`, `NODE_ENV=production`
   and `AI_PROVIDER=ollama`.
2. Runs `npm ci`, `prisma generate`, `prisma migrate deploy` and
   `prisma db seed` (topics and patterns; safe to repeat).
3. Builds the app and pulls the Ollama model if it's missing.

It never overwrites an existing `.env`, so you can re-run it safely. Other
options: `-AiProvider rules|ollama|anthropic` and `-OllamaModel qwen2.5:3b`.
These only take effect when `.env` is first created; after that, edit `.env`
directly.

Settings in `.env` you might change (each one is explained in `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | `ollama` (from setup) | `rules`, `ollama` or `anthropic` |
| `OLLAMA_MODEL` | `qwen2.5:7b` | must match `ollama list` |
| `OLLAMA_TIMEOUT_MS` | `150000` | raise it on slow CPUs |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | `0.0.0.0` makes it reachable from the LAN |
| `ANTHROPIC_API_KEY` | empty | only for `AI_PROVIDER=anthropic` |

## 5. Start it

```powershell
.\scripts\windows\start.ps1
```

This builds the app, starts it under pm2 as `dsa-tracker-api`, runs `pm2 save`
and checks `/health`. The startup log lists the addresses your phone can use:

```powershell
pm2 logs dsa-tracker-api --lines 20 --nostream
#  Network: http://192.168.1.50:3000  (Wi-Fi)
#  Network: http://100.101.102.103:3000  (Tailscale)
```

Useful pm2 commands: `pm2 status`, `pm2 logs dsa-tracker-api`,
`pm2 restart dsa-tracker-api`, `pm2 stop dsa-tracker-api`. Logs are written to
`.\logs\`.

## 6. Give the laptop a fixed LAN IP

Your phone needs an address that doesn't change.

**Best option: a DHCP reservation on your router.** Look up the laptop's MAC
address, then reserve an IP for it in the router's admin page (often
http://192.168.1.1, under "DHCP reservation", "Address reservation" or
"Static lease"):

```powershell
Get-NetAdapter | Where-Object Status -eq Up | Select-Object Name, MacAddress
```

**Alternative: set a static IP on the laptop (Admin).** Read your current
values first, then pick a free address outside the router's DHCP range:

```powershell
Get-NetIPConfiguration | Where-Object IPv4DefaultGateway
# Example values: interface "Wi-Fi", IP 192.168.1.50/24, gateway 192.168.1.1
New-NetIPAddress -InterfaceAlias "Wi-Fi" -IPAddress 192.168.1.50 -PrefixLength 24 -DefaultGateway 192.168.1.1
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses 192.168.1.1, 1.1.1.1
```

To undo it:
`Set-NetIPInterface -InterfaceAlias "Wi-Fi" -Dhcp Enabled; Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ResetServerAddresses`.

## 7. Open the firewall for the API (Admin)

Mark your home network as **Private**, then allow port 3000 on private networks
and from Tailscale only:

```powershell
Get-NetConnectionProfile
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private

New-NetFirewallRule -DisplayName "DSA Tracker API (LAN)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "DSA Tracker API (Tailscale)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -RemoteAddress 100.64.0.0/10
```

Don't open ports 5432 (Postgres) or 11434 (Ollama). Only the API needs to be
reachable.

To check from the phone, open `http://<laptop-ip>:3000/health` in its browser.

## 8. Start everything at boot (Admin)

This uses **Task Scheduler** rather than `pm2-windows-startup` or
`pm2-installer`, which have been unreliable on recent Windows and Node
versions. A startup task runs before anyone logs in, survives Node upgrades and
is easy to inspect.

```powershell
cd $HOME\Dsa-Tracker
.\scripts\windows\install-startup-task.ps1
```

This registers a task called **"DSA Tracker"**. It runs at startup, as your user,
without storing your password. The task runs `scripts\windows\boot.ps1`, which:

1. Starts `ollama serve` if `AI_PROVIDER=ollama` and Ollama isn't already running.
2. Waits for Postgres.
3. Runs `pm2 resurrect`, which brings back the process list saved by
   `start.ps1` / `update.ps1`.

Test it without rebooting, then reboot and test again:

```powershell
pm2 kill
Start-ScheduledTask -TaskName "DSA Tracker"
Start-Sleep 20; pm2 status; Get-Content .\logs\boot.log -Tail 20
```

To remove it: `Unregister-ScheduledTask -TaskName "DSA Tracker" -Confirm:$false`.

## 9. Keep the laptop awake when plugged in (Admin)

```powershell
powercfg /change standby-timeout-ac 0         # never sleep on AC power
powercfg /change hibernate-timeout-ac 0       # never hibernate on AC power
powercfg /change monitor-timeout-ac 5         # screen can still turn off
# Closing the lid on AC power does nothing (0 = do nothing):
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
```

Also worth doing:

- Settings > Windows Update > Advanced options > **Active hours**: set them so
  update restarts happen when you're not studying. The boot task brings
  everything back after a restart.
- Settings > Network & internet > Wi-Fi > *your network* > Properties: keep it
  set to **Private**.
- In Device Manager, on the Wi-Fi adapter's Power Management tab, untick
  "Allow the computer to turn off this device to save power".

## 10. Tailscale (reach it away from home)

1. Install Tailscale on the laptop (step 1) and sign in: `tailscale up`, or use
   the tray icon. Tailscale runs as a Windows service, so it works at boot.
2. Install Tailscale on your phone and sign in with the same account.
3. Find the laptop's Tailscale IP:

   ```powershell
   tailscale ip -4      # e.g. 100.101.102.103
   ```

   MagicDNS also gives it a name, such as `http://my-laptop:3000`. The firewall
   rule from step 7 already allows the 100.64.0.0/10 range.

## 11. Point the phone app at the laptop

On the machine where you run Expo (for example your Mac), edit `mobile/.env`:

```bash
# At home only:
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
# Or from anywhere, with Tailscale on the phone:
# EXPO_PUBLIC_API_URL=http://100.101.102.103:3000
```

Then restart Expo with a clear cache so the new value is picked up:

```bash
cd mobile && npx expo start -c
```

`EXPO_PUBLIC_*` values are compiled into the JavaScript bundle, so restart Expo
whenever you change them. The Tailscale address works both at home and away, so
it's the simplest single choice if you always keep Tailscale on.

The API uses plain HTTP. Expo Go allows that. For a standalone build later,
Android needs cleartext traffic allowed for this host, and iOS needs an App
Transport Security exception. Alternatively, put the API behind HTTPS with
`tailscale serve`.

---

## Updating after you push new code

```powershell
cd $HOME\Dsa-Tracker
.\scripts\windows\update.ps1
```

This runs `git pull --ff-only`, `npm ci`, `prisma generate`,
`prisma migrate deploy` and `prisma db seed`, then rebuilds and runs
`pm2 startOrReload`, `pm2 save` and a health check. It refuses to run if
tracked files have local edits. `.env` is untracked, so it's never touched.

## Troubleshooting

| Symptom | Check |
|---|---|
| Phone can't connect | `/health` from the phone's browser; `Get-NetConnectionProfile` (must be Private); firewall rule; same Wi-Fi; correct IP in `mobile/.env`; restart Expo with `-c` |
| `EADDRINUSE` in logs | Something else is on port 3000: `Get-NetTCPConnection -LocalPort 3000` |
| AI answers say "Smart rules" | Ollama is down or the model isn't pulled: `ollama list`, `curl.exe http://localhost:11434/api/tags`; the app's AI tab shows the provider status |
| AI is very slow | Use a 3B model, or raise `OLLAMA_TIMEOUT_MS`; the first request after boot loads the model (slow) |
| `P1001: Can't reach database` | `Get-Service postgresql*`; check DATABASE_URL in `.env` |
| `npm ci` fails with EPERM | The API is holding files open: `pm2 stop dsa-tracker-api`, then retry (update.ps1 does this) |
| Nothing after reboot | `Get-Content .\logs\boot.log -Tail 50`; `Get-ScheduledTaskInfo -TaskName "DSA Tracker"` |
