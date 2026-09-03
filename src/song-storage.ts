import { buildSongCatalog, type SongDirContents } from "./song-catalog";
import { createObjectStore, type ObjectStore } from "./object-store";

export class SongStorage {
  private readonly publicBaseUrl: string;

  constructor(
    private readonly songs: ObjectStore,
    private readonly recordings: ObjectStore,
    publicBaseUrl: string,
  ) {
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
  }

  static fromEnvironment(): SongStorage {
    const songStore = Bun.env["SONG_STORE_NAME"] ?? Bun.env["S3_BUCKET"] ?? Bun.env["AWS_BUCKET"];
    if (!songStore) throw new Error("SONG_STORE_NAME is required");
    const recordingStore = Bun.env["RECORDING_STORE_NAME"] ?? songStore;
    const publicBaseUrl = Bun.env["SONG_PUBLIC_BASE_URL"] ??
      (Bun.env["S3_PUBLIC_ENDPOINT"]
        ? `${Bun.env["S3_PUBLIC_ENDPOINT"].replace(/\/$/, "")}/${songStore}`
        : undefined);
    if (!publicBaseUrl) throw new Error("SONG_PUBLIC_BASE_URL is required");
    return new SongStorage(
      createObjectStore(songStore),
      createObjectStore(recordingStore),
      publicBaseUrl.replace(/\/$/, ""),
    );
  }

  async getCatalog(): Promise<SongDirContents> {
    return buildSongCatalog(await this.songs.list());
  }

  getPublicSongUrl(key: string): string {
    if (!isSongObjectKey(key)) throw new Error("Invalid song object key");
    return `${this.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async saveRecording(body: string): Promise<string> {
    const key = `dev/take-${new Date().toISOString()}.rhythm`;
    await this.recordings.write(key, body, "text/plain; charset=utf-8");
    return key;
  }
}

function isSongObjectKey(key: string): boolean {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([^/]+)\.(wav|rhythm)$/.exec(key);
  return match !== null && match[1] === match[2];
}
