# N26 Minecraft Banking – Deployment (Netlify + Raspberry Pi)

> **Wichtiger Hinweis:** Dies ist ein **Fansystem** für den MinigamesV2-Server.
> Es handelt sich um **virtuelle Werte**. Es werden keine echten Zahlungen,
> Konten oder Bankgeschäfte abgewickelt. Keine echte Bank. N26 ist eine
> eingetragene Marke; dieses Projekt steht in keiner Verbindung zu N26.

## Zielarchitektur

```
                        INTERNET
                           |
           +---------------+----------------+
           |                                |
           v                                v
      NETLIFY (Frontend)              PLAYIT.GG (Minecraft)
      React/Vite SPA                        |
           |                                v
           |                          Raspberry Pi
           |                          +-----------+-----------+
           |                          |                       |
           |          +---------------+-----------------------+-------+
           |          |  nginx/Caddy Reverse Proxy (HTTPS)           |
           |          |  http://127.0.0.1:3000  ->  https://api.<d>  |
           |          +----------------------------------------------+
           |                          |                       |
           |                          v                       v
           +---------- HTTPS -------> API (Fastify)      Minecraft Server
                                      |        |              |
                                      |        +-----> RCON   |
                                      v                        v
                                PostgreSQL           N26 Data-Pack
                                      ^               (storage server:bank)
                                      +----  Quelle der Wahrheit  ----+
```

- **Netlify** hostet ausschließlich das Frontend (`apps/web/dist`).
- **Raspberry Pi (David)** hostet das Backend (API, PostgreSQL, RCON,
  Minecraft, Data-Pack).
- **Netlify → API** läuft über HTTPS. Das Frontend spricht `VITE_API_URL`.
- **RCON läuft nur serverseitig** auf dem Pi – nie im Browser, nie im
  Frontend, nie in `VITE_*`.
- Es gibt **keine frei ausführbare RCON-/Command-API**. Das Backend führt nur
  feste, interne RCON-Aktionen aus (Linking, Lock, Transaktionen, Status).

---

## Variante C – EINE URL, KEINE externen Dienste (empfohlen, wenn der Server dir gehört)

Backend **und** Webseite laufen beide auf demselben Server (dem Pi, auf dem
Minecraft/das Data-Pack läuft). Das Backend liefert die gebaute Webseite
selbst aus (`apps/web/dist`), nutzt **SQLite** statt einer externen
Datenbank und verbindet sich **lokal per RCON**. Kein Netlify, kein Neon,
keine CORS-/Cookie-Probleme – eine einzige Adresse.

```
Browser -> http://<pi-ip>:3000   (oder per playit/HTTPS)
              |  Backend (Fastify) liefert die Webseite + API
              |   + SQLite (./data/n26.db)
              +> RCON 127.0.0.1:43323 -> Minecraft/Data-Pack
```

### Einrichtung auf dem Pi

```bash
cd ~/apps/n26
cp .env.example .env      # oder .env aus diesem Abschnitt übernehmen
npm run build             # shared + api + web (dist wird vom Backend ausgeliefert)
npm start                 # bzw. npm run start -w @n26/api
```

### Ohne Docker (systemd – für CasaOS/Debian-Server)

Ein Befehl – lädt, installiert, baut, erzeugt `.env` und richtet einen
dauerhaft aktiven Dienst ein (`n26-api`, startet mit dem Server):

```bash
git clone <repo-url> n26 && cd n26 && bash scripts/deploy-server.sh
```

Geschieht im Skript:
- `npm ci` && `npm run build`
- `.env` mit zufälligem `SESSION_SECRET` (existiert eine, wird sie **nicht**
  überschrieben)
- systemd-Unit `/etc/systemd/system/n26-api.service` (`Restart=always`,
  `WantedBy=multi-user.target`)

Erster Start: `.env` einmal anpassen (`nano .env` → `RCON_PASSWORD`).

```bash
# Verwaltung
sudo systemctl status n26-api
sudo systemctl restart n26-api
sudo journalctl -u n26-api -f      # Logs

# Update
git pull && bash scripts/deploy-server.sh
```

Programme laufen in dem Verzeichnis, in dem `npm run build` lief; die
SQLite-Datenbank liegt in `./data/n26.db`. Kein Docker, kein Container
erforderlich.

`.env` (Ausschnitt):

```dotenv
DATABASE_URL=sqlite:./data/n26.db
NODE_ENV=production
PORT=3000
SESSION_SECRET=<64-byte-hex>
# RCON überall dorthin setzen, wo es erreichbar ist – bei euch: die Server-IP
RCON_HOST=209.25.141.16
RCON_PORT=43323
RCON_PASSWORD=<SECRET>
WEB_ORIGIN=http://<pi-ip>:3000
ADMIN_MC_USERNAMES=Johnnyzockt09
```

Danach im Browser: `http://<pi-ip>:3000` → Login → Dashboard kontrolliert
`/api/status` (online/offline), Kontostand kommt live aus dem Data-Pack.
Produktion mit HTTPS: Caddy/nginx-Reverse-Proxy vor Port 3000.

### Grenzen
- Ein Serverprozess – per `systemd` beim Boot starten.
- SQLite reicht für ein Fan-/Spielsystem mit wenigen Accounts; bei vielen
  parallelen Schreibzugriffen PostgreSQL (Variante A) nutzen.
- Der Pi liefert die Webseite nur im LAN bzw. öffentlich über Reverse-Proxy
  (playit-Webtunnel oder Domain).
- Die Einrichtungs-Schritte 1–19 unten bleiben für die Minecraft-/Data-Pack-
  Seite relevant (RCON lokal, Ports, playit, Allowlist entfällt).

---

## Zwei Varianten

- **Variante A (unten, Schritte 1–19):** Backend auf Davids Raspberry Pi,
  Frontend auf Netlify → RCON bleibt lokal/geheim (empfohlen).
- **Variante B (neuer):** **ALLES AUF NETLIFY** – Frontend und API laufen als
  Netlify-Site, die API als eine Serverless-Function
  (`netlify/functions/api.mjs`, Code in `apps/api`, via `fastify.inject()`).
  Kein Backend-Prozess auf dem Pi nötig. Dafür muss RCON von außen erreichbar
  sein und eine externe PostgreSQL-DB (z. B. Neon/Supabase) existieren.
  Details siehe Abschnitt „Variante B" nach Schritt 19.

---

## Variante B – ALLES AUF NETLIFY (Netlify Functions)

Netlify hostet Frontend **und** API. Der komplette Fastify-Code inklusive
aller Sicherheits-Layer (Auth, Session-Cookies, CSRF, Rate-Limit, CORS,
Helmet, Level-Seeding) bleibt unverändert und läuft über einen
`fastify.inject()`-Adapter in einer Funktion.

```
Browser -> https://<site>.netlify.app
            |  Frontend (apps/web/dist)
            +> /api/*  (Rewrite aus apps/web/public/_redirects)
                 -> netlify/functions/api.mjs (Fastify in Lambda)
                      -> RCON (Server-IP aus Netlify-Env) -> Minecraft/Data-Pack
                      -> PostgreSQL (extern, z. B. Neon/Supabase)
```

### Voraussetzungen

1. **RCON muss von außen erreichbar sein.** Die Funktion läuft in der Cloud
   und erreicht den Server nur über `RCON_HOST` (öffentliche IP) + Port. Am
   Server: `rcon.bind` aufs lokale Interface NICHT mehr auf `127.0.0.1`
   beschränken, `rcon.port` (z. B. 25575) in Firewall/Router freigeben.
   **Sicherheitsentscheidung:** RCON ist dann öffentlich; die Absicherung
   übernimmt nur das Backend (keine Command-API, feste Aktionen,
   Rate-Limit). Möglichst zusätzlich eine IP-Allowlist am Server.
2. **Externe PostgreSQL-DB** (Netlify hat keinen permanenten Speicher), frei
   z. B. bei [Neon](https://neon.tech) oder [Supabase](https://supabase.com).
   Nur `DATABASE_URL` setzen – Tabellen/Seeds erzeugt die API beim Start.

### Netlify-Umgebungsvariablen (ohne `VITE_`-Präfix!)

```
DATABASE_URL=postgresql://...?sslmode=require
SESSION_SECRET=<64-byte-hex>
NODE_ENV=production
RCON_HOST=<öffentliche IP des Servers>
RCON_PORT=25575
RCON_PASSWORD=<SECRET>
WEB_ORIGIN=https://<site>.netlify.app
COOKIE_SAMESITE=lax
ADMIN_MC_USERNAMES=Johnnyzockt09
MINECRAFT_SERVER_ADDRESS=<mein-server.playit.gg>
MINECRAFT_SERVER_PORT=25565
PLAYIT_PUBLIC_ADDRESS=<mein-server.playit.gg>
```

`VITE_API_URL` bleibt **leer/nicht gesetzt** → das Frontend ruft `/api/*`
same-origin auf und die Rewrite-Rule leitet zur Funktion.

### Routing & Build

- `apps/web/public/_redirects` (Reihenfolge zählt):
  ```
  /api/*  /.netlify/functions/api  200
  /*      /index.html              200
  ```
- `netlify.toml`: `[functions] directory = "netlify/functions"`,
  `node_bundler = "esbuild"` und `external_node_modules` für die nativen
  Pakete (`better-sqlite3`, `argon2`) sowie die Workspace-Pakete
  (`@n26/api`, `@n26/shared`). Kein `node_format` setzen.
- Build: `npm run build -w @n26/shared && npm run build -w @n26/api && npm run build -w @n26/web`.
- `better-sqlite3` wird in Produktion nicht geladen (Postgres); `argon2`
  nutzt Prebuilds für linux-x64.

### Grenzen (ehrlich)

- RCON-öffentlich = schwächere Sicherheit als Variante A. Für ein privates
  Fan-/Spielsystem okay, nicht für sensible Systeme.
- Cold Starts: erste Anfrage nach Inaktivität baut App + DB-Pool auf (2–5 s).
- Rate-Limit-Zähler gelten je warme Instanz, nicht global.
- Alle Seeds/Einstellungen sind wie in Variante A, nur die Env-Quelle ändert
  sich (Netlify statt Pi-`.env`).

---

## Ports (Serverkonfiguration beachten!)

| Dienst         | Port  | Beschreibung                                                        |
| -------------- | ----- | ------------------------------------------------------------------- |
| Minecraft      | 25565 | Öffentlich über **playit.gg** (Tunnel, kein Port-Forwarding)        |
| RCON           | 25575 | **Nicht öffentlich**. Nur lokal auf dem Pi (`127.0.0.1`)            |
| Web/API        | 3000  | Nur intern; öffentlich nur via HTTPS-Reverse-Proxy (`api.<domain>`) |

Minecraft und RCON **niemals auf denselben Port** betreiben. Die tatsächlichen
Ports aus `server.properties` (`query.port`, `rcon.port`) und `rcon.password`
übernehmen.

---

## 1. Raspberry Pi vorbereiten

```bash
sudo apt update && sudo apt upgrade -y
# 64-bit Bookworm empfohlen
sudo raspi-config   # SSH, Hostname, Locale aktivieren
sudo apt install -y git curl htop
# IPv4 hat Vorrang (Netlify/CDN-Aufrufe):
sudo sh -c 'echo "precedence ::ffff:0:0/96 100" >> /etc/gai.conf'
```

## 2. Minecraft installieren (z. B. Paper)

```bash
mkdir -p ~/minecraft && cd ~/minecraft
curl -o paper.jar https://api.papermc.io/v2/projects/paper/versions/<VERSION>/builds/<BUILD>/downloads/paper-<VERSION>-<BUILD>.jar
# Startskript (mit -nogui und ausreichend RAM)
java -Xmx2G -Xms1G -jar paper.jar nogui
# Derivaten nach "Eula akzeptieren": eula.txt -> eula=true
```

`server.properties` – mindestens:

```properties
server-port=25565
enable-rcon=true
rcon.port=25575
rcon.password=DEIN_LANGES_RCON_PASSWORT
rcon.bind=127.0.0.1
online-mode=true
```

## 3. Data-Pack installieren

```bash
cd ~/minecraft/world/datapacks   # oder worlds/<welt>/datapacks
cp -r <repo>/datapack/n26 .
```

- Im Spiel: `/reload` (Serverkonsole).
- Linking ist offen für alle Spieler (keine Allowlist). Die Admin-Rolle
  vergeben: `ADMIN_MC_USERNAMES=Johnnyzockt09` (siehe Env). Nach dem
  Verknüpfen eines Admin-MC-Namens wird der Web-Account automatisch Admin
  (Admin-Panel: Konten sperren, Spieler kicken).
- Einzige manuell nutzbare Funktion ist `/function n26:link`.

## 4. RCON aktivieren

- `enable-rcon=true`, `rcon.port=25575`, `rcon.password=<SECRET>` (siehe
  oben). `rcon.bind=127.0.0.1` stellt sicher, dass RCON nicht im Netz
  lauscht.
- Test: `nc -z 127.0.0.1 25575`.
- **RCON nie über playit.gg oder die Firewall exponieren.**

## 5. Backend installieren

```bash
mkdir -p ~/apps/n26 && cd ~/apps/n26
git clone <repo-url> .
cd /opt/n26   # oder direkt im Home-Verzeichnis
npm ci
npm run build
```

Alternativ mit Docker Compose: siehe `docker-compose.yml` und
`docs/raspberry-pi-deployment.md`. Der Compose-Ansatz bindet die API nur auf
`127.0.0.1:3000`.

## 6. PostgreSQL konfigurieren

```bash
sudo apt install -y postgresql
sudo -u postgres createuser --pwprompt n26
sudo -u postgres createdb -O n26 n26_bank
```

## 7. Environment Variables setzen

`.env` im Backend-Ordner (nie einchecken, siehe `.gitignore`):

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://n26:<pw>@127.0.0.1:5432/n26_bank
SESSION_SECRET=<64-byte-hex>
WEB_ORIGIN=https://n26.minigamesv2.de
COOKIE_SAMESITE=lax
PUBLIC_URL=https://n26.minigamesv2.de

RCON_HOST=127.0.0.1
RCON_PORT=25575
RCON_PASSWORD=<SECRET>

MINECRAFT_SERVER_ADDRESS=mein-server.playit.gg
MINECRAFT_SERVER_PORT=25565
PLAYIT_PUBLIC_ADDRESS=mein-server.playit.gg

ALLOWED_LINK_UUIDS ist entfallen – Linking ist für alle Spieler offen.
Anstatt der UUID-Allowlist gibt es `ADMIN_MC_USERNAMES=Johnnyzockt09`
(Minecraft-Namen, deren verknüpfter Web-Account automatisch Admin wird;
Admin kann im Admin-Panel Konten sperren und Spieler kicken).
```

`WEB_ORIGIN` ist die **exakte** Netlify-/Frontend-Origin. Es gilt:

- **Niemals `*`.**
- Nur die Domains, die die API aufrufen dürfen (Komma-getrennt möglich).
- Backend-Secrets (`DATABASE_URL`, `SESSION_SECRET`, `RCON_*`, `POSTGRES_*`)
  existieren **nur hier** – niemals im Netlify-Frontend.

`COOKIE_SAMESITE`:

- Frontend `n26.minigamesv2.de` + API `api.n26.minigamesv2.de` (gleiches
  Site-Suffix) → **`lax`** (empfohlen).
- Cross-Site (z. B. `x.netlify.app` ⇔ `y.playit.gg`) → **`none`** (nur mit
  HTTPS, Production aktiviert `Secure` automatisch).

## 8. Backend starten

```bash
npm run start -w @n26/api        # oder pm2/systemd siehe
systemctl enable --now n26-api   # Beispieldatei unten
```

Migration/Seeding läuft beim Start automatisch (`initDatabase`),
Level-Seeds via `seedIfEmpty`.

## 9. Reverse Proxy konfigurieren (HTTPS)

Caddy ist am einfachsten und erzeugt Let’s-Encrypt-Zertifikate automatisch:

```caddy
api.n26.minigamesv2.de {
    reverse_proxy 127.0.0.1:3000
    header X-Forwarded-For {remote_host}
}
```

> **Achtung:** Der Proxy setzt `X-Forwarded-*`-Header. Fastify ist in diesem
> Projekt **ohne** `trustProxy` konfiguriert – Host-/Protokoll-Spoofing über
> diese Header ist damit nicht ausnutzbar. Halte `trustProxy` deaktiviert.

## 10. HTTPS aktivieren

- Caddy tut dies automatisch (Let’s Encrypt).
- Oder nginx + `certbot --nginx`.
- DNS muss vorher auf den Pi zeigen (siehe Schritt 17).

## 11. playit.gg konfigurieren

1. playit.gg installieren: `curl -SsL https://playit.gg/install | sh`
2. Im Dashboard einen **TCP-Tunnel für Port 25565** (Minecraft) anlegen.
3. Zuordnung matcht den öffentlichen Hostnamen (z. B. `minigamesv2.playit.gg`)
   auf den lokalen `25565`.
4. **RCON (25575) niemals** als Tunnel anlegen. `Minecraft` und `RCON` bleiben
   getrennt (andere Ports, nur MC wird public).

## 12. Netlify Projekt erstellen

- [app.netlify.com](https://app.netlify.com) → „New site from Git“.

## 13. GitHub Repository verbinden

- Repo auswählen (Private Repo ok).
- Build-Einstellungen werden aus `netlify.toml` im Repo-Root übernommen.

## 14. Build Command setzen

`netlify.toml` setzt:

```toml
command = "npm run build -w @n26/shared && npm run build -w @n26/web"
publish = "apps/web/dist"
```

Nur `shared` + `web` bauen – die API (argon2, RCON) wird auf Netlify **nicht**
gebaut und nicht deployed.

## 15. Publish Directory setzen

`apps/web/dist` (aus `netlify.toml`). Das Verzeichnis enthält zusätzlich
`_redirects` für das SPA-Routing (`/* /index.html 200`).

## 16. VITE_API_URL setzen

In der Netlify-UI: Site settings → Environment variables:

```
VITE_API_URL = https://api.n26.minigamesv2.de
```

Diese URL ist **öffentlich** und darf im Frontend-Bundle stehen – sie enthält
keine Secrets. Der Standard in `netlify.toml` deckt schon einen sinnvollen
Default ab; die UI-Variable hat Vorrang.

> Vite ersetzt `import.meta.env.VITE_API_URL` beim Build zur Build-Zeit. Nach
> einer Änderung ist ein neuer Deploy nötig.

## 17. Custom Domain konfigurieren

DNS (beim Domain-Provider):

| Name                  | Typ  | Wert                                                        |
| --------------------- | ---- | ----------------------------------------------------------- |
| `n26.minigamesv2.de`  | CNAME | `n26-minigamesv2.netlify.app`                             |
| `api.n26.minigamesv2.de` | A  | Öffentliche IP des Raspberry Pi (bei IPv6 zusätzlich `AAAA`) |

oder für den Pi stattdessen auch ein CNAME auf den playit/HTTPS-Endpunkt,
je nach Setup.

- Netlify: Site settings → Domain management → „Add custom domain“
  (`n26.minigamesv2.de`) und HTTPS erzwingen.
- API-Domain: Reverse-Proxy (Caddy/nginx) auf dem Pi terminiert HTTPS für
  `api.n26.minigamesv2.de`. Port 443 am Router auf den Pi weiterleiten.

Frontend-Domain und API-Domain sind damit **Same-Site** (`minigamesv2.de`) →
Cookies mit `SameSite=Lax` funktionieren mit `credentials: 'include'`.

## 18. CORS konfigurieren

Backend-Seite (`.env` auf dem Pi):

```dotenv
WEB_ORIGIN=https://n26.minigamesv2.de
```

Erlaubte Origins sind nur die konfigurierten – die API antwortet nie mit
`Access-Control-Allow-Origin: *`. Bei Änderungen der Frontend-Domain muss
`WEB_ORIGIN` angepasst werden.

## 19. Testen

```bash
npm run build
npm run test
```

Manueller End-to-End-Test:

- [ ] Netlify-Deploy baut (`shared` + `web`) und publiziert `apps/web/dist`
- [ ] `https://n26.minigamesv2.de` und `/dashboard`, `/account`,
      `/transactions`, `/invoices`, `/settings`, `/levels` laden direkt
      (kein 404)
- [ ] Login / Logout, Session-Cookie (HttpOnly, Secure, SameSite korrekt)
- [ ] Minecraft-Linking (offen für alle Spieler; Admin-Promotion für Johnnyzockt09)
- [ ] Admin-Aktionen im Panel: Konto sperren/entsperren, Spieler kicken
- [ ] RCON-/Data-Pack-Verbindung (Server-Status-Dashboard zeigt echte Werte)
- [ ] Kontostand, Transaktion, Rechnung
- [ ] >100 € → `PENDING_VERIFICATION` → Einmal-Token → Bestätigung →
      RCON → Data-Pack
- [ ] Minecraft offline → Status „Offline“, Transaktion nicht als Erfolg
      markiert (bei Unsicherheit `PENDING_RECONCILIATION`)
- [ ] Replay-Schutz (verbrauchtes Verification-Token), Rate Limit, CORS
      (fremde Origin wird abgelehnt), CSRF, XSS
- [ ] Kein RCON-Port öffentlich erreichbar (`nmap` von außen)

---

## Sicherheits-Grundsätze (verbindlich)

- **RCON ausschließlich Backend/Pi.** Kein `POST /api/rcon`, keine
  willkürlichen Minecraft-Kommandos über die Webseite.
- Kein `storage server:bank`-Zugriff aus dem Frontend; nur kontrollierte
  API-Antworten. Interne Werte (`Key`, `Hash`, `Hash_Value`) werden nie
  ausgeliefert.
- `Access-Control-Allow-Origin: *` ist verboten.
- Backend-Secrets gehören nie ins Frontend, nicht in `VITE_*`, nicht in
  Cookies, nicht in localStorage.
- Kulisse: virtuelles Spielgeld, kein echtes Banking.