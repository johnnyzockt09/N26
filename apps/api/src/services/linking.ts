import { config } from '../config/index.js';
import { Database } from '../db/database.js';
import { generateChallengeCode, generateRequestId, hashToken } from '../lib/security.js';
import { RconService } from './rcon.js';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const CHALLENGE_TTL = 10 * 60 * 1000; // 10 minutes

export interface LinkChallengeOutcome {
  status: 'PENDING' | 'COMPLETED' | 'DENIED' | 'EXPIRED' | 'CANCELLED' | 'ERROR';
  minecraftUsername?: string;
  minecraftUuid?: string;
}

export class LinkingService {
  constructor(
    private readonly db: Database,
    private readonly rcon: RconService,
  ) {}

  /**
   * Start a linking challenge for the current web user.
   * Returns the challenge code to be passed to /function n26:link {code:"..."}.
   */
  async startChallenge(userId: string): Promise<{ code: string; expiresInSeconds: number }> {
    // Cancel any prior pending challenges for this user
    await this.db.linkChallenges.markCancelledForUser(userId);

    // Only allow linking if the user isn't already linked
    const existing = await this.db.links.findByUserId(userId);
    if (existing) {
      return { code: 'ALREADY_LINKED', expiresInSeconds: 0 };
    }

    const code = generateChallengeCode();
    const pin = this.generatePin();
    const pinHash = await this.hashPin(pin);
    await this.db.linkChallenges.create({
      userId,
      challengeCode: code,
      pinHash,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL),
    });
    await this.db.auditLogs.create({ event: 'ACCOUNT_LINK', actorUserId: userId, details: { phase: 'challenge_started' } });
    return { code, expiresInSeconds: CHALLENGE_TTL / 1000 };
  }

  private generatePin(): string {
    // 6-digit PIN, only revealed to the web user.
    const value = randomInt(0, 1_000_000);
    return String(value).padStart(6, '0');
  }

  private async hashPin(pin: string): Promise<string> {
    return createHash('sha256').update(`${pin}:${config.sessionSecret}`).digest('hex');
  }

  private async verifyPin(pin: string, pinHash: string): Promise<boolean> {
    const hash = createHash('sha256').update(`${pin}:${config.sessionSecret}`).digest();
    const target = Buffer.from(pinHash, 'hex');
    if (hash.length !== target.length) return false;
    return timingSafeEqual(hash, target);
  }

  /**
   * Poll for a completed link. Called repeatedly by the web client while
   * they wait for the in-game command to be executed.
   */
  async checkChallenge(userId: string, code: string): Promise<LinkChallengeOutcome> {
    const challenge = await this.db.linkChallenges.findPendingByCode(code);
    if (!challenge || challenge.userId !== userId) {
      return { status: 'EXPIRED' };
    }

    // Read the entry the data pack wrote after /function n26:link
    const entry = await this.rcon.readLinkEntry(code);
    if (!entry || !entry.player_uuid) {
      return { status: 'PENDING' };
    }
    this.rcon.clearLinkEntry(code);

    await this.db.linkChallenges.markConsumed(challenge.id);
    const link = await this.db.links.upsert({
      userId,
      minecraftUuid: entry.player_uuid,
      minecraftUsername: entry.player_name ?? 'Unknown',
    });

    // Admin auto-promotion: whoever links with an admin Minecraft account
    // (e.g. Johnnyzockt09) becomes a web admin -> can kick + lock accounts.
    const username = link.minecraftUsername.toLowerCase();
    if ((config.adminMcUsernames ?? []).some((n) => n.toLowerCase() === username)) {
      const user = await this.db.users.findById(userId);
      if (user && user.role !== 'admin') {
        await this.db.users.updateRole(userId, 'admin');
        await this.db.auditLogs.create({
          event: 'ROLE_PROMOTED',
          actorUserId: userId,
          actorUuid: entry.player_uuid,
          details: { reason: 'admin_minecraft_account', role: 'admin', username: entry.player_name },
        });
      }
    }

    await this.db.auditLogs.create({
      event: 'ACCOUNT_LINK',
      actorUserId: userId,
      actorUuid: entry.player_uuid,
      details: { phase: 'completed', uuid: entry.player_uuid, username: entry.player_name },
    });
    return {
      status: 'COMPLETED',
      minecraftUuid: link.minecraftUuid,
      minecraftUsername: link.minecraftUsername,
    };
  }

  /**
   * Trigger the backend-side command on behalf of the data-pack bridge:
   * the backend writes the request for n26:web/link which asks the data pack
   * to record the linking entry for a player that already ran n26:link.
   */
  async prepareServerCommand(): Promise<string> {
    return generateRequestId();
  }

  sessionTokenForVerification(): string {
    return hashToken(generateRequestId());
  }
}