import { buildSongCatalog, type SongDirContents } from "./song-catalog";
import { createObjectStore, type ObjectStore } from "./object-store";

export class SongStorage {
  constructor(
    private readonly songs: ObjectStore,
    private readonly recordings: ObjectStore,
  ) {}

  static fromEnvironment(): SongStorage {
    const songStore = Bun.env["SONG_STORE_NAME"] ?? Bun.env["S3_BUCKET"] ?? Bun.env["AWS_BUCKET"];
    if (!songStore) throw new Error("SONG_STORE_NAME is required");
    const recordingStore = Bun.env["RECORDING_STORE_NAME"] ?? songStore;
    return new SongStorage(
      createObjectStore(songStore),
      createObjectStore(recordingStore),
    );
  }

  async getCatalog(): Promise<SongDirContents> {
    return buildSongCatalog(await this.songs.list());
  }

  getSignedSongUrl(key: string): Promise<string> {
    if (!isSongObjectKey(key)) throw new InvalidSongObjectKeyError();
    return this.songs.getSignedReadUrl(key);
  }

  async saveRecording(body: string): Promise<string> {
    const key = `dev/take-${new Date().toISOString()}.rhythm`;
    await this.recordings.write(key, body, "text/plain; charset=utf-8");
    return key;
  }
}

export class InvalidSongObjectKeyError extends Error {
  constructor() {
    super("Invalid song object key");
    this.name = "InvalidSongObjectKeyError";
  }
}

function isSongObjectKey(key: string): boolean {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([^/]+)\.(wav|rhythm)$/.exec(key);
  return match !== null && match[1] === match[2];
}
