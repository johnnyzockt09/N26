import { Rcon } from 'rcon-client';

/**
 * N26 RCON Service.
 *
 * SECURITY MODEL:
 * - The web API must NEVER forward arbitrary player-supplied commands.
 * - The RconService exposes only a fixed set of controlled, internal actions
 *   which map to data-pack functions on the Minecraft server.
 * - Credentials come exclusively from environment variables.
 *
 * BRIDGE PATTERN (storage-only, no typed macro args):
 * 1. Backend writes the request (JSON) into the canonical slot
 *    `storage server:bank web.request` (any previous request/answer removed).
 * 2. Backend runs the internal data-pack function
 *    `/function n26:web/<action> with storage server:bank web.request`
 *    The `with storage` macro context means ALL function arguments come from
 *    the backend-serialized JSON payload – never from player-typed input.
 * 3. The data pack reads `web.request`, performs the action, writes the
 *    answer into the canonical slot `web.answer` and removes `web.request`.
 * 4. Backend reads `web.answer` and deletes it.
 *
 * Note: exactly ONE request/answer is in flight at a time. Transfers that
 * require web verification are sequential by nature; the backend never sends
 * a second request before consuming the first answer.
 */
export type RconStatus = 'ONLINE' | 'OFFLINE' | 'CONNECTING';

export interface RconServiceOptions {
  host: string;
  port: number;
  password: string;
  connectTimeoutMs?: number;
}

interface RconResponse {
  ok: boolean;
  output: string;
}

const STORAGE = 'server:bank';

export class RconService {
  private client: Rcon | null = null;
  private connecting = false;
  private connectedAt: number | null = null;

  constructor(private readonly options: RconServiceOptions) {}

  getStatus(): { status: RconStatus; connectedSince?: number } {
    if (this.client && this.connectedAt) return { status: 'ONLINE', connectedSince: this.connectedAt };
    if (this.connecting) return { status: 'CONNECTING' };
    return { status: 'OFFLINE' };
  }

  isConnected(): boolean {
    return this.client !== null && this.connectedAt !== null;
  }

  getEndpoint(): string {
    return `${this.options.host}:${this.options.port}`;
  }

  async connect(): Promise<boolean> {
    if (this.isConnected()) return true;
    if (this.connecting) return false;
    this.connecting = true;
    try {
      const client = new Rcon({
        host: this.options.host,
        port: this.options.port,
        password: this.options.password,
        timeout: this.options.connectTimeoutMs ?? 5000,
      });
      await client.connect();
      this.client = client;
      this.connectedAt = Date.now();
      return true;
    } catch {
      this.client = null;
      this.connectedAt = null;
      return false;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
      } catch {
        // ignore
      }
      this.client = null;
      this.connectedAt = null;
    }
  }

  /**
   * Internal low-level command execution. MUST only be called from
   * hardcoded allowlisted call sites inside this service.
   */
  private async execute(command: string, timeoutMs = 8000): Promise<RconResponse> {
    const connected = await this.connect();
    if (!connected || !this.client) {
      return { ok: false, output: 'RCON_UNAVAILABLE' };
    }
    try {
      const response = await Promise.race<Promise<string>>([
        this.client.send(command),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('RCON_TIMEOUT')), timeoutMs)
        ),
      ]);
      if (!response) return { ok: false, output: 'EMPTY_RESPONSE' };
      return { ok: true, output: response };
    } catch (err) {
      return { ok: false, output: `RCON_ERROR: ${(err as Error).message}` };
    }
  }

  /**
   * Write a JSON request into the data pack's canonical request slot.
   * Values are JSON-serialized, so UUIDs/amounts/descriptions are safe by
   * construction. Any prior request/answer is cleared to keep the slot clean.
   */
  private async writeRequest(id: string, payload: Record<string, unknown>): Promise<boolean> {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    await this.execute(`/data remove storage ${STORAGE} web.request`);
    await this.execute(`/data remove storage ${STORAGE} web.answer`);
    const json = JSON.stringify({ ...payload, rid: safeId }).replace(/'/g, "\\'");
    const res = await this.execute(`/data modify storage ${STORAGE} web.request set value ${json}`);
    return res.ok;
  }

  /**
   * Read and remove the data pack's JSON answer from the canonical slot.
   */
  private async readAnswer<T>(): Promise<T | null> {
    const res = await this.execute(`/data get storage ${STORAGE} web.answer`);
    if (!res.ok || !res.output) return null;
    const parsed = this.parseNbtJson(res.output);
    await this.execute(`/data remove storage ${STORAGE} web.answer`);
    return parsed as T;
  }

  private parseNbtJson(output: string): unknown {
    // Output is like: "server:bank web.answer has the following entry: {...}"
    const idx = output.indexOf('{');
    if (idx < 0) return null;
    const parser = new SnbtParser(output.slice(idx));
    return parser.parse();
  }

  private safeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /**
   * Forward a controlled internal function call with a request payload
   * written to storage first. Returns the parsed answer.
   */
  async callDataPack<T>(action: string, payload: Record<string, unknown>, requestId?: string): Promise<T | null> {
    const id = this.safeId(requestId ?? `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const written = await this.writeRequest(id, payload);
    if (!written) return null;
    const fn = action.replace(/[^a-z0-9_:\/]/gi, '');
    const res = await this.execute(`/function ${fn} with storage ${STORAGE} web.request`);
    if (!res.ok) return null;
    return this.readAnswer<T>();
  }

  /**
   * Datapack heartbeat: returns system status from the data pack.
   */
  async pingDataPack(): Promise<boolean> {
    const answer = await this.callDataPack<{ ok?: number }>('n26:web/status', { action: 'status' });
    return answer !== null && Boolean(answer.ok);
  }

  /**
   * Fetch an account's balance in cents (real value = Money - Key).
   * The data pack computes the real value; Key/Hash never leave it.
   */
  async getBalance(uuid: string): Promise<{ balanceCents: number; accountOk: boolean; status: string; registered: boolean }> {
    const answer = await this.callDataPack<{
      balance?: number;
      account_ok?: number;
      registered?: number;
      status?: string;
    }>('n26:web/get_balance', { action: 'get_balance', uuid });
    if (!answer) return { balanceCents: 0, accountOk: false, status: 'NO_RESPONSE', registered: false };
    return {
      balanceCents: answer.balance ?? 0,
      accountOk: Boolean(answer.account_ok),
      status: answer.status ?? 'UNKNOWN',
      registered: Boolean(answer.registered),
    };
  }

  /**
   * Verify an account's integrity via the data pack hash check.
   */
  async verifyAccount(uuid: string): Promise<{ valid: boolean; status: string }> {
    const answer = await this.callDataPack<{ valid?: number; status?: string }>('n26:web/verify_account', { action: 'verify_account', uuid });
    return { valid: Boolean(answer?.valid), status: answer?.status ?? 'NO_RESPONSE' };
  }

  /**
   * Request a transfer through the data pack. The data pack executes it
   * atomically with an idempotency guard.
   */
  async requestTransfer(input: {
    id: string;
    fromUuid: string;
    toUuid: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<{ status: string; answer?: Record<string, unknown> }> {
    const answer = await this.callDataPack<{ status?: string }>(
      'n26:web/transfer',
      {
        action: 'transfer',
        id: input.id,
        from: input.fromUuid,
        to: input.toUuid,
        amount: input.amountCents,
        idem: input.idempotencyKey,
        desc: input.description,
      },
      input.id
    );
    if (!answer) return { status: 'NO_RESPONSE' };
    return { status: answer.status ?? 'UNKNOWN', answer };
  }

  /**
   * Read pending link entries written by the data pack after /function n26:link.
   * The data pack stores the player UUID as an SNBT int array `[I; a,b,c,d]` and
   * readLinkEntry converts it to the canonical 8-4-4-4-12 UUID string.
   */
  async readLinkEntry(code: string): Promise<{ player_uuid?: string; player_name?: string; ts?: number } | null> {
    const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, '');
    const res = await this.execute(`/data get storage ${STORAGE} web.links.${safeCode}`);
    if (!res.ok || !res.output) return null;
    const parsed = this.parseNbtJson(res.output) as {
      player_uuid?: number[] | string;
      player_name?: string;
      ts?: number;
    } | null;
    if (!parsed) return null;
    const uuid = Array.isArray(parsed.player_uuid)
      ? this.uuidFromInts(parsed.player_uuid)
      : parsed.player_uuid;
    return { player_uuid: uuid, player_name: parsed.player_name, ts: parsed.ts };
  }

  private uuidFromInts(ints: number[]): string {
    if (ints.length !== 4) return '';
    const hex = (n: number) => (n < 0 ? n + 4294967296 : n).toString(16).padStart(8, '0');
    const [a, b, c, d] = ints.map(hex);
    return `${a}-${b.slice(0, 4)}-${b.slice(4)}-${c.slice(0, 4)}-${c.slice(4)}${d}`.toLowerCase();
  }

  async clearLinkEntry(code: string): Promise<void> {
    const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, '');
    await this.execute(`/data remove storage ${STORAGE} web.links.${safeCode}`);
  }

  async toggleAccountLock(uuid: string, lock: boolean): Promise<{ status: string }> {
    const answer = await this.callDataPack<{ status?: string }>(
      lock ? 'n26:web/lock_account' : 'n26:web/unlock_account',
      { action: lock ? 'lock' : 'unlock', uuid }
    );
    return { status: answer?.status ?? 'NO_RESPONSE' };
  }

  /**
   * Kick a player from the server. FIXED action: the player name is
   * validated to /^[A-Za-z0-9_]{1,16}$/ and the reason is sanitized, so no
   * arbitrary command text can reach the RCON console.
   */
  async kickPlayer(username: string, reason?: string): Promise<{ status: string }> {
    const safeUser = username.trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(safeUser)) {
      return { status: 'INVALID_PLAYER' };
    }
    const reasonClean = (reason ?? 'Du wurdest von einem Administrator entfernt.')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    const command = reasonClean ? `/kick ${safeUser} ${reasonClean}` : `/kick ${safeUser}`;
    const res = await this.execute(command);
    return { status: res.ok ? 'KICKED' : 'NO_RESPONSE' };
  }

  async getServerStatus(): Promise<{ online: boolean; players?: number }> {
    const connected = await this.connect();
    if (!connected) return { online: false };
    try {
      await this.client?.send('/list');
      return { online: true };
    } catch {
      return { online: false };
    }
  }
}

/**
 * Minimal SNBT -> JSON parser for the controlled subset the N26 data pack
 * produces via `/data get storage`:
 *  - compounds `{key: value, ...}` with unquoted keys
 *  - lists `[a, b]`, int arrays `[I; a, b]`, byte arrays `[B; a, b]`
 *  - double-quoted strings, signed integers, floats, numeric suffixes
 *    (`1b`, `1s`, `3.5f`, ...) which are stripped to plain JSON numbers
 *  - boolean literals `true`/`false`
 */
class SnbtParser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): unknown {
    const value = this.parseValue();
    return value;
  }

  private peek(): string {
    return this.src[this.pos] ?? '';
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.peek() !== ch) throw new Error(`SnbtParser: expected '${ch}' at ${this.pos}, got '${this.peek()}'`);
    this.pos++;
  }

  private parseValue(): unknown {
    this.skipWs();
    const ch = this.peek();
    if (ch === '{') return this.parseCompound();
    if (ch === '[') return this.parseList();
    if (ch === '"' || ch === "'") return this.parseString();
    const lit = this.parseLiteral();
    if (lit !== undefined) return lit;
    return this.parseNumber();
  }

  private parseLiteral(): boolean | undefined {
    const rest = this.src.slice(this.pos);
    if (rest.startsWith('true')) {
      this.pos += 4;
      return true;
    }
    if (rest.startsWith('false')) {
      this.pos += 5;
      return false;
    }
    return undefined;
  }

  private parseCompound(): Record<string, unknown> {
    this.expect('{');
    const out: Record<string, unknown> = {};
    this.skipWs();
    if (this.peek() === '}') {
      this.pos++;
      return out;
    }
    for (;;) {
      this.skipWs();
      const key = this.readKey();
      this.skipWs();
      this.expect(':');
      out[key] = this.parseValue();
      this.skipWs();
      const next = this.peek();
      if (next === ',') {
        this.pos++;
        continue;
      }
      if (next === '}') {
        this.pos++;
        return out;
      }
      throw new Error(`SnbtParser: expected ',' or '}' at ${this.pos}`);
    }
  }

  private parseList(): unknown[] {
    this.skipWs();
    if (this.peek() !== '[') throw new Error('SnbtParser: expected list');
    // typed arrays: [I; a, b, c] or [B; ...]
    const m = /^\[([IBL]);/.exec(this.src.slice(this.pos));
    if (m) this.pos += m[0].length;
    else this.pos++;
    const out: unknown[] = [];
    this.skipWs();
    if (this.peek() === ']') {
      this.pos++;
      return out;
    }
    for (;;) {
      out.push(this.parseValue());
      this.skipWs();
      const next = this.peek();
      if (next === ',') {
        this.pos++;
        continue;
      }
      if (next === ']') {
        this.pos++;
        return out;
      }
      throw new Error(`SnbtParser: expected ',' or ']' at ${this.pos}`);
    }
  }

  private parseString(): string {
    const quote = this.peek();
    this.pos++;
    let out = '';
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos++];
      if (ch === '\\' && this.pos < this.src.length) {
        out += this.src[this.pos++];
        continue;
      }
      if (ch === quote) return out;
      out += ch;
    }
    throw new Error('SnbtParser: unterminated string');
  }

  private readKey(): string {
    this.skipWs();
    let out = '';
    while (this.pos < this.src.length && /[A-Za-z0-9_\-]/.test(this.src[this.pos])) {
      out += this.src[this.pos++];
    }
    if (out.length === 0) throw new Error(`SnbtParser: empty key at ${this.pos}`);
    return out;
  }

  private parseNumber(): unknown {
    this.skipWs();
    const m = /^-?\d+(?:\.\d+)?[bBsSlLfFdDiI]?/.exec(this.src.slice(this.pos));
    if (!m || m[0].length === 0) {
      throw new Error(`SnbtParser: unexpected token '${this.src.slice(this.pos, this.pos + 20)}'`);
    }
    this.pos += m[0].length;
    const text = m[0].replace(/[bBsSlLfFdDiI]$/, '');
    return text.includes('.') ? Number.parseFloat(text) : Number.parseInt(text, 10);
  }
}

export function createRconService(opts: RconServiceOptions): RconService {
  return new RconService(opts);
}