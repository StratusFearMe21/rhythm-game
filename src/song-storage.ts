import { S3Client } from "bun";
import { buildSongCatalog, type SongDirContents } from "./song-catalog";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

type StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  publicEndpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export class SongStorage {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;

  constructor(config: StorageConfig) {
    const sharedOptions = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucket: config.bucket,
      region: config.region,
    };

    this.client = new S3Client({
      ...sharedOptions,
      endpoint: config.endpoint,
      virtualHostedStyle: config.endpoint === undefined,
    });
    this.publicClient = new S3Client({
      ...sharedOptions,
      endpoint: config.publicEndpoint ?? config.endpoint,
      virtualHostedStyle:
        config.publicEndpoint === undefined && config.endpoint === undefined,
    });
  }

  static fromEnvironment(): SongStorage {
    const bucket = Bun.env["S3_BUCKET"] ?? Bun.env["AWS_BUCKET"];
    if (!bucket) throw new Error("S3_BUCKET is required");

    return new SongStorage({
      bucket,
      region:
        Bun.env["S3_REGION"] ?? Bun.env["AWS_REGION"] ?? "us-east-1",
      endpoint: Bun.env["S3_ENDPOINT"] ?? Bun.env["AWS_ENDPOINT"],
      publicEndpoint: Bun.env["S3_PUBLIC_ENDPOINT"],
      accessKeyId:
        Bun.env["S3_ACCESS_KEY_ID"] ?? Bun.env["AWS_ACCESS_KEY_ID"],
      secretAccessKey:
        Bun.env["S3_SECRET_ACCESS_KEY"] ??
        Bun.env["AWS_SECRET_ACCESS_KEY"],
    });
  }

  async getCatalog(): Promise<SongDirContents> {
    return buildSongCatalog(await listAllObjectKeys(this.client));
  }

  getSignedSongUrl(key: string): string {
    if (!isSongObjectKey(key)) throw new Error("Invalid song object key");
    return this.publicClient.presign(key, {
      expiresIn: SIGNED_URL_LIFETIME_SECONDS,
      method: "GET",
    });
  }
}

type ObjectListingPage = {
  contents?: { key?: string }[];
  isTruncated?: boolean;
  nextContinuationToken?: string;
};

type ObjectLister = {
  list(options: {
    continuationToken?: string;
  }): Promise<ObjectListingPage>;
};

export async function listAllObjectKeys(client: ObjectLister): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.list(
      continuationToken === undefined ? {} : { continuationToken },
    );
    for (const object of page.contents ?? []) {
      if (object.key) keys.push(object.key);
    }

    if (page.isTruncated && !page.nextContinuationToken) {
      throw new Error(
        "S3 returned a truncated listing without a continuation token",
      );
    }
    continuationToken = page.isTruncated
      ? page.nextContinuationToken
      : undefined;
  } while (continuationToken !== undefined);

  return keys;
}

function isSongObjectKey(key: string): boolean {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([^/]+)\.(wav|rhythm)$/.exec(
    key,
  );
  return match !== null && match[1] === match[2];
}
