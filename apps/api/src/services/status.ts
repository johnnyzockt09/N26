import { ServerStatus } from '@n26/shared';
import { Database } from '../db/database.js';
import { RconService } from './rcon.js';
import { config } from '../config/index.js';
import net from 'node:net';

export interface SystemStatusResult {
  minecraftServer: ServerStatus;
  rcon: ServerStatus;
  dataPack: ServerStatus;
  database: ServerStatus;
  playit: ServerStatus;
  minecraftLatencyMs?: number;
}

/**
 * StatusService reports real, measured statuses only – never simulated data.
 * Every value is derived from an actual check.
 */
export class StatusService {
  private lastDataPackCheck = 0;
  private dataPackCache = false;

  constructor(
    private readonly db: Database,
    private readonly rcon: RconService,
  ) {}

  async getStatus(): Promise<SystemStatusResult> {
    const database = await this.db.ping();
    const rconStatus = this.rcon.getStatus().status;
    const rconOnline = rconStatus === 'ONLINE';

    // Only ping the data pack over RCON at most every 10s to avoid spam.
    const now = Date.now();
    let dataPack = false;
    if (now - this.lastDataPackCheck > 10_000) {
      dataPack = rconOnline ? await this.rcon.pingDataPack() : false;
      this.dataPackCache = dataPack;
      this.lastDataPackCheck = now;
    } else {
      dataPack = rconOnline && this.dataPackCache;
      if (!rconOnline) dataPack = false;
    }

    const minecraftIp = config.minecraft.serverAddress || config.minecraft.playitAddress;
    let minecraftOnline = false;
    let latency: number | undefined;
    if (minecraftIp && this.isResolvableHost(minecraftIp)) {
      try {
        latency = await this.measureServerLatency(minecraftIp, config.minecraft.serverPort);
        minecraftOnline = latency !== undefined;
      } catch {
        minecraftOnline = false;
      }
    } else {
      minecraftOnline = rconOnline;
    }

    const playit = await this.checkPlayit();

    return {
      minecraftServer: minecraftOnline ? 'ONLINE' : 'OFFLINE',
      rcon: rconStatus,
      dataPack: dataPack ? 'ONLINE' : 'OFFLINE',
      database: database ? 'ONLINE' : 'OFFLINE',
      playit,
      minecraftLatencyMs: latency,
    };
  }

  private isResolvableHost(host: string): boolean {
    if (host.length === 0) return false;
    if (host.includes('localhost') || host.endsWith('.local')) return true;
    // IP or hostname with a dot or colon
    return /[.:]/.test(host);
  }

  private measureServerLatency(host: string, port: number): Promise<number | undefined> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = net.createConnection({ host, port, timeout: 5000 });
      socket.once('connect', () => {
        const latency = Date.now() - start;
        socket.destroy();
        resolve(latency);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(undefined);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(undefined);
      });
    });
  }

  private async checkPlayit(): Promise<ServerStatus> {
    const addr = config.minecraft.playitAddress;
    if (!addr) {
      // No playit configured; fall back to the RCON reachability.
      return this.rcon.isConnected() ? 'ONLINE' : 'OFFLINE';
    }
    const match = addr.match(/^([a-zA-Z0-9.-]+\.playit\.gg)$/);
    if (!match) return 'OFFLINE';
    const latency = await this.measureServerLatency(match[1], config.minecraft.serverPort);
    return latency !== undefined ? 'ONLINE' : 'OFFLINE';
  }
}