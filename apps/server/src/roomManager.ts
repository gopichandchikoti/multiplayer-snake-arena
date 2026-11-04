import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type ThemeId } from '@snake/shared';
import { GameRoom, type RoomDeps } from './room';

export function generateRoomCode(
  exists: (code: string) => boolean,
  random: (max: number) => number = randomInt,
): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET.charAt(random(ROOM_CODE_ALPHABET.length));
    if (!exists(code)) return code;
  }
  throw new Error('could not find a free room code');
}

/** Owns every room: creation with a cap, lookup by code, and quick-play matching. */
export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();

  constructor(
    private readonly deps: Omit<RoomDeps, 'onEmpty'>,
    private readonly maxRooms: number,
  ) {}

  count(): number {
    return this.rooms.size;
  }

  all(): IterableIterator<GameRoom> {
    return this.rooms.values();
  }

  find(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Null when the server is already holding as many rooms as it is configured to. */
  create(visibility: 'private' | 'public', theme: ThemeId): GameRoom | null {
    if (this.rooms.size >= this.maxRooms) return null;
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room = new GameRoom(code, visibility, theme, {
      ...this.deps,
      onEmpty: (finished) => {
        this.rooms.delete(finished.code);
        this.deps.log.info('room_closed', { room: finished.code });
      },
    });
    this.rooms.set(code, room);
    this.deps.log.info('room_created', { room: code, visibility });
    return room;
  }

  /** The fullest public lobby that still has a free seat, so games start sooner. */
  quickplayCandidate(): GameRoom | null {
    let best: GameRoom | null = null;
    for (const room of this.rooms.values()) {
      if (room.isOpenForQuickplay() && (!best || room.playerCount() > best.playerCount())) best = room;
    }
    return best;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.destroy();
    this.rooms.clear();
  }
}
