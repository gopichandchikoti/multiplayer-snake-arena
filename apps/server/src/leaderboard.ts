import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Clock } from './clock';
import type { Logger } from './logger';

export interface Participant {
  guestId: string;
  nick: string;
  score: number;
  won: boolean;
}

interface Entry {
  guestId: string;
  nick: string;
  wins: number;
  matches: number;
  bestScore: number;
  totalScore: number;
  updatedAt: number;
}

/** What the API shows. The guest ID is an identifier, so it is not part of it. */
export interface PublicEntry {
  rank: number;
  nick: string;
  wins: number;
  matches: number;
  bestScore: number;
  totalScore: number;
}

export interface LeaderboardInfo {
  persistence: 'memory' | 'file';
  scope: 'this-server';
  since: string;
  entries: PublicEntry[];
}

const MAX_ENTRIES = 5000;

const fileSchema = z.object({
  since: z.string(),
  entries: z.array(
    z.object({
      guestId: z.string(),
      nick: z.string(),
      wins: z.number(),
      matches: z.number(),
      bestScore: z.number(),
      totalScore: z.number(),
      updatedAt: z.number(),
    }),
  ),
});

/**
 * Per-server standings. It lives in memory and, if a file path is configured, is written there after
 * each round so it survives a restart. It never claims to be a global board.
 */
export class Leaderboard {
  private entries = new Map<string, Entry>();
  private since: string;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private readonly clock: Clock,
    private readonly file: string | null,
    private readonly log: Logger,
  ) {
    this.since = new Date(clock.now()).toISOString();
  }

  /** Loads saved standings. A missing file is normal; a corrupt one is set aside, never overwritten blindly. */
  async load(): Promise<void> {
    if (!this.file) return;
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    const parsed = fileSchema.safeParse(safeJson(text));
    if (!parsed.success) {
      await rename(this.file, `${this.file}.corrupt-${this.clock.now()}`);
      this.log.warn('leaderboard_file_corrupt', { file: this.file });
      return;
    }
    this.since = parsed.data.since;
    this.entries = new Map(parsed.data.entries.map((e) => [e.guestId, e]));
  }

  record(participants: readonly Participant[]): void {
    const now = this.clock.now();
    for (const p of participants) {
      const entry = this.entries.get(p.guestId) ?? {
        guestId: p.guestId,
        nick: p.nick,
        wins: 0,
        matches: 0,
        bestScore: 0,
        totalScore: 0,
        updatedAt: now,
      };
      entry.nick = p.nick;
      entry.matches += 1;
      entry.wins += p.won ? 1 : 0;
      entry.bestScore = Math.max(entry.bestScore, p.score);
      entry.totalScore += p.score;
      entry.updatedAt = now;
      this.entries.set(p.guestId, entry);
    }
    this.trim();
    this.scheduleSave();
  }

  top(limit: number): LeaderboardInfo {
    const ranked = [...this.entries.values()]
      .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore || a.guestId.localeCompare(b.guestId))
      .slice(0, limit)
      .map((e, i) => ({
        rank: i + 1,
        nick: e.nick,
        wins: e.wins,
        matches: e.matches,
        bestScore: e.bestScore,
        totalScore: e.totalScore,
      }));
    return { persistence: this.file ? 'file' : 'memory', scope: 'this-server', since: this.since, entries: ranked };
  }

  /** Waits for any pending write; used on shutdown. */
  async flush(): Promise<void> {
    await this.saving;
  }

  private trim(): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const oldest = [...this.entries.values()].sort((a, b) => a.updatedAt - b.updatedAt);
    for (const entry of oldest.slice(0, this.entries.size - MAX_ENTRIES)) this.entries.delete(entry.guestId);
  }

  private scheduleSave(): void {
    const file = this.file;
    if (!file) return;
    const payload = JSON.stringify({ since: this.since, entries: [...this.entries.values()] });
    this.saving = this.saving.then(async () => {
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, payload, 'utf8');
        await rename(`${file}.tmp`, file);
      } catch (error) {
        this.log.error('leaderboard_save_failed', { message: error instanceof Error ? error.message : String(error) });
      }
    });
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
