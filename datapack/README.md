# N26 Minecraft Banking – Data Pack

Fan-/Spielsystem für MinigamesV2. Kein offizielles Produkt.

## Installation

1. Copy `n26/` (the folder containing `pack.mcmeta`) into the world's
   `datapacks/` folder (PocketMine / vanilla: `world/datapacks/`).
2. `reload` in-game (or restart). The `#minecraft:load` tag initializes
   the scoreboard objective and config.
3. Verify the bridge: the web admin/status page must show
   *N26 Data-Pack: Online*.

Requires **Minecraft 1.20.2+** (macros + storage `with` context).

## Configuration (REQUIRED before use)

### 1. Linking

`/function n26:link` ist **offen für alle Spieler** – es gibt keine UUID-
Allowlist mehr. Die Identität wird dadurch bewiesen, dass der Code im Spiel
ausgeführt wird (der Link-Code stammt aus der Web-Session des Spielers).

Die **Admin-Rolle** wird automatisch beim Verknüpfen vergeben: Wer mit einem
Minecraft-Account aus `ADMIN_MC_USERNAMES` (Backend-Env, Standard:
`Johnnyzockt09`) linkt, wird Web-Admin und kann im Admin-Panel Konten sperren
und Spieler kicken (`/api/admin/kick`, feste Aktion – keine Command-API).

### 2. Storage namespace
The data pack owns `storage server:bank`. Never modify these entries by hand
except for legitimate administration/audit:

| Path | Purpose |
|---|---|
| `server:bank accounts.<uuid>.money` | padded stored money (int) |
| `server:bank accounts.<uuid>.key` | subtractor (int), real balance = money - key |
| `server:bank accounts.<uuid>.hash` | integrity hash = money·31 + key·17 + 7919 |
| `server:bank accounts.<uuid>.locked` | `1b` blocks transfers |
| `server:bank tokens.<id>` | permanent idempotency ledger for transfers |
| `server:bank web.request` / `web.answer` | one in-flight bridge request/answer |
| `server:bank web.links.<code>` | completed linking entries |

## Bridge contract (backend ↔ data pack)

The backend (apps/api) never sends player content as command arguments:

1. Backend writes the JSON payload (including the request id) into
   `server:bank web.request`.
2. Backend calls `/function n26:web/<action> with storage server:bank web.request`
   → the data pack receives the payload as macro variables (`$(id)`, `$(uuid)`,
   `$(from)`, `$(to)`, `$(amount)`, `$(idem)`, …) from our own serialized
   storage — player-typed values never reach command arguments.
3. The data pack runs the action and writes the answer into
   `server:bank web.answer`, then removes `web.request`.
4. Backend reads `web.answer` and removes it.

Exactly one request/answer is in flight; the backend sequences everything.

## Actions

| Function | Purpose |
|---|---|
| `n26:link` (player macro `{code}`) | Completes a web challenge (offen für alle Spieler; Admin-Promotion über `ADMIN_MC_USERNAMES`) |
| `n26:web/status` | Heartbeat for the web status page |
| `n26:web/get_balance` | Real balance + integrity + existence |
| `n26:web/verify_account` | Tamper check (recompute hash) |
| `n26:web/transfer` | Atomic money move with idempotency ledger |
| `n26:web/reconcile` | Reports whether a tx already executed |
| `n26:web/lock_account` / `unlock_account` | Admin locks |

## Notes

- All money is integer **cents**. No floats anywhere.
- A web-verified transfer > 100 EUR only executes after the web
  confirmation; the data pack itself has no amount limit (the web layer
  enforces `TRANSFER_LIMIT_CENTS`).
- `hash` is a simple checksum (not cryptographic) so a tamper attempt is
  detected by `verify_account`; it is intentionally not a real password hash.