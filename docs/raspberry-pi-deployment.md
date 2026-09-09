# N26 Minecraft Banking System – Raspberry Pi Deployment

> **Aktuelle Produktionsarchitektur:** Das Frontend läuft auf **Netlify**, das
> Backend auf dem Raspberry Pi von David. Minecraft ist über **playit.gg**
> erreichbar, die Web-API über HTTPS (`api.<domain>`). Siehe
> **[`docs/deployment.md`](deployment.md)** für die vollständige
> Netlify + Pi-Anleitung. Diese Datei beschreibt die (weiterhin gültige)
> Docker-Compose-Variante auf dem Pi als Alternative/Referenz: `web` + `api`
> + PostgreSQL im selben Stack – sinnvoll zum lokalen Testen, während in
> Produktion das Frontend via Netlify ausgeliefert wird.

This guide deploys the whole stack on a Raspberry Pi using Docker Compose:
`web` (nginx serving the React SPA), `api` (Fastify backend) and `database`
(PostgreSQL). The Minecraft server itself runs separately (often on the same
Pi), reachable through a `playit.gg` tunnel.

> **Wichtiger Hinweis:** Dies ist ein **Fansystem** für den MinigamesV2-Server.
> Es handelt sich um **virtuelle Werte**. Es werden keine echten Zahlungen,
> Konten oder Bankgeschäfte abgewickelt. Keine echte Bank.

---

## 0. Voraussetzungen auf dem Raspberry Pi

- 64-bit Raspberry Pi OS (Bookworm empfohlen)
- Docker Engine + Docker Compose Plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  # Abmelden & neu anmelden, damit die Gruppe wirkt
  docker compose version
  ```
- Eine Domain bzw. playit.gg-Tunnel-Adresse für HTTPS (siehe Abschnitt 6).

---

## 1. Repository auf den Pi bringen

```bash
mkdir -p ~/apps/n26 && cd ~/apps/n26
# Projekt hierher kopieren (git clone / rsync / USB-Stick)
git clone <repo-url> .
```

Wichtig: Das `.env`-Verzeichnis darf **nie** eingecheckt werden (steht in
`.gitignore`). Auf dem Pi wird `.env` aus `.env.example` erstellt:

```bash
cp .env.example .env
nano .env
```

---

## 2. `.env` auf dem Pi füllen

Felder mit `?` in `docker-compose.yml` sind Pflicht. Mindestens setzen:

```dotenv
NODE_ENV=production

# PostgreSQL-Zugang (für Compose & API)
POSTGRES_USER=n26
POSTGRES_PASSWORD=ein-sehr-langes-zufaelliges-passwort
POSTGRES_DB=n26_bank

# Session & Cookies
# erzeugen mit: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SESSION_SECRET=ein-64-byte-hex-secret

# Öffentliche URL (deine Netlify-/HTTPS-Adresse, ohne trailing slash)
PUBLIC_URL=https://n26.minigamesv2.de

# CORS: exakt die Frontend-Origin erlauben (Netlify). KEIN "*".
WEB_ORIGIN=https://n26.minigamesv2.de
# (CORS_ORIGIN wird als Fallback weiter akzeptiert.)
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=

# RCON – der API-Container erreicht den Host, auf dem der MC-Server läuft
# (der Pi), über host.docker.internal.
RCON_HOST=host.docker.internal
RCON_PORT=25575
RCON_PASSWORD=dein-rcon-passwort

# Admin-Accounts: MC-Namen, deren verknüpfter Web-Account automatisch
# Admin wird (Konten sperren, Spieler kicken). Linking ist offen für alle.
ADMIN_MC_USERNAMES=Johnnyzockt09
```

Erzeuge das Session-Secret **eindeutig** und verwende **starke, getrennte**
Passwörter für PostgreSQL und RCON.

---

## 3. Datenbank-Migration

Beim ersten Start erstellt PostgreSQL automatisch die leere Datenbank. Die
Tabellen legt das API-Image beim Start an (es läuft `migrate` bzw. nutzt das
`initDatabase`). Falls die Migration manuell ausgeführt werden soll:

```bash
docker compose run --rm api npm run db:migrate -w @n26/api
```

---

## 4. Starten & verwalten

```bash
# Bauen und starten
docker compose up -d --build

# Logs ansehen
docker compose logs -f api
docker compose logs -f web

# Status
docker compose ps

# Stoppen
docker compose down
```

Der öffentliche Einstiegspunkt ist der `web`-Container auf Port `80`. nginx
proxied `/api/*` an den `api`-Container (Port 3000, nur intern). PostgreSQL
und die API sind **nicht** nach außen exponiert.

---

## 5. RCON-Anbindung absichern

- RCON läuft auf einem **anderen Port** als der Minecraft-Server (`25575` ≠
  `25565`).
- Der `api`-Container erreicht den Host über `RCON_HOST=host.docker.internal`
  (in `docker-compose.yml` ist `extra_hosts` bereits gesetzt).
- **Niemals** den RCON-Port öffentlich öffnen. Der `api`-Container hat noch
  `127.0.0.1:3000:3000` für Debugging auf dem Pi gebunden – dieser Port ist
  nur auf dem Host selbst erreichbar, nicht außerhalb.

Firewall auf dem Pi (nur notwendige Ports):

```bash
# UFW aktivieren
sudo ufw default deny incoming
sudo ufw allow 22/tcp          # SSH
sudo ufw allow 80/tcp          # nginx (web)
sudo ufw allow 443/tcp         # bei selbstsigniertem HTTPS-Terminator
# NICHT 25575 (RCON) oder 3000 öffnen
sudo ufw enable
```

---

## 6. playit.gg & HTTPS

playit.gg macht den Minecraft-Server ohne Port-Forwarding öffentlich erreichbar.

1. [playit.gg](https://playit.gg) installieren & auf dem Pi starten (Agent):
   ```bash
   curl -SsL https://playit.gg/install | sh
   ```
2. Im playit-Dashboard einen **Tunnel** für den Minecraft-Port anlegen (z. B.
   `25565`), die öffentliche Adresse sieht z. B. so aus:
   `minigamesv2.playit.gg:12345`. Spieler verbinden sich damit.
3. Zusätzlich die **Web-App** erreichbar machen:
   - playit.gg kann eine HTTP-Tunnel-Adresse geben, die auf Port `80` des Pis
     zeigt, z. B. `https://dein-tunnel.playit.gg`.
   - Alternative: öffentliche Domain + Cloudflare / Reverse-Proxy für HTTPS.

Setze diese Adressen in `.env`:
- `PUBLIC_URL` = öffentliche Netlify-/Frontend-Adresse
- `WEB_ORIGIN` = exakt der Netlify-Origin (für CORS, niemals `*`)
- `COOKIE_DOMAIN` = leer lassen (nur nötig bei Subdomain-Sharing)

### HTTPS

- Empfohlen: playit.gg-Webtunnel oder Cloudflare (terminieren HTTPS automatisch).
- Bei eigener Domain: Let’s Encrypt per `certbot` oder einem Reverse-Proxy
  (z. B. Caddy) vor nginx:
  ```dotenv
  # Caddy beantwortet HTTPS und reicht an http://localhost:80 weiter
  ```

---

## 7. Autostart beim Boot (systemd)

Damit der Stack beim Reboot des Pis automatisch startet:

```bash
sudo tee /etc/systemd/system/n26.service > /dev/null <<'EOF'
[Unit]
Description=N26 Minecraft Banking Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/pi/apps/n26
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
User=pi
Group=docker

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now n26.service
```

---

## 8. Aktualisieren

```bash
cd ~/apps/n26
git pull
docker compose up -d --build
```

---

## 9. Checkliste vor dem Live-Gang

- [ ] Linking ist offen für alle Spieler; `ADMIN_MC_USERNAMES=Johnnyzockt09`
      vergeben (nach Link wird der Web-Account automatisch Admin).
- [ ] Data-Pack `n26` ist im Ordner `datapacks/` des MC-Servers installiert
      und wird per `reload` (bzw. Neustart) geladen (siehe `datapack/README.md`).
- [ ] `.env` enthält starke, getrennte Passwörter (DB, RCON, Session-Secret).
- [ ] RCON-Port ist nicht öffentlich erreichbar.
- [ ] HTTPS funktioniert; `PUBLIC_URL`/`COOKIE_DOMAIN` zeigen auf die
      HTTPS-Adresse.
- [ ] End-to-End verifiziert: Webseite → API → RCON → Data-Pack.

---

## 10. Fehlerbehebung

| Problem | Mögliche Ursache / Lösung |
| --- | --- |
| API startet nicht | `SESSION_SECRET`/`POSTGRES_PASSWORD` fehlt (Compose erzwingt `?`). |
| Keine Verbindung zu Minecraft | `RCON_HOST` falsch; RCON-Port != MC-Port; RCON nur auf `127.0.0.1` gebunden (dann `RCON_HOST=host.docker.internal` ggf. nicht weiterleitbar). |
| Web sagt „Offline“ | Status prüft beide: API-RCON-Verbindung + Data-Pack-Heartbeat. Siehe Backend-Logs. |
| `/function n26:link` wird nicht akzeptiert | Link-Code falsch/abgelaufen oder bereits verknüpft – neuen Code auf der Webseite erstellen. Linking ist offen (keine Allowlist). |
