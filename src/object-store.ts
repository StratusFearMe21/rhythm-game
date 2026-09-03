import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Storage } from "@google-cloud/storage";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

export interface ObjectStore {
  exists(key: string): Promise<boolean>;
  read(key: string): Promise<Uint8Array>;
  write(key: string, value: Uint8Array | string, contentType: string): Promise<void>;
  writeIfAbsent(key: string, value: Uint8Array | string, contentType: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  getSignedReadUrl(key: string): Promise<string>;
}

export function createObjectStore(name: string): ObjectStore {
  const provider = (Bun.env["CLOUD_PROVIDER"] ?? "aws").toLowerCase();
  if (!name) throw new Error("PORTAL_STORE_NAME is required");
  if (provider === "aws") return new AwsObjectStore(name);
  if (provider === "gcp") return new GcpObjectStore(name);
  throw new Error(`Unsupported CLOUD_PROVIDER: ${provider}`);
}

class AwsObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(private readonly bucket: string) {
    const region = Bun.env["AWS_REGION"] ?? Bun.env["S3_REGION"] ?? "us-west-2";
    const endpoint = Bun.env["S3_ENDPOINT"];
    const publicEndpoint = Bun.env["S3_PUBLIC_ENDPOINT"];
    const credentials =
      Bun.env["S3_ACCESS_KEY_ID"] && Bun.env["S3_SECRET_ACCESS_KEY"]
        ? {
            accessKeyId: Bun.env["S3_ACCESS_KEY_ID"],
            secretAccessKey: Bun.env["S3_SECRET_ACCESS_KEY"],
          }
        : undefined;

    this.client = new S3Client({
      region,
      followRegionRedirects: true,
      endpoint,
      forcePathStyle: endpoint !== undefined,
      credentials,
    });
    this.signingClient = publicEndpoint
      ? new S3Client({
          region,
          followRegionRedirects: true,
          endpoint: publicEndpoint,
          forcePathStyle: publicEndpoint !== undefined,
          credentials,
        })
      : this.client;
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (statusCode(error) === 404 || errorName(error) === "NotFound") return false;
      throw error;
    }
  }

  async read(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`Object has no body: ${key}`);
    return result.Body.transformToByteArray();
  }

  async write(key: string, value: Uint8Array | string, contentType: string) {
    await this.put(key, value, contentType);
  }

  async writeIfAbsent(key: string, value: Uint8Array | string, contentType: string) {
    try {
      await this.put(key, value, contentType, "*");
      return true;
    } catch (error) {
      if (statusCode(error) === 409 || statusCode(error) === 412) return false;
      throw error;
    }
  }

  private async put(key: string, value: Uint8Array | string, contentType: string, ifNoneMatch?: string) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: value,
      ContentType: contentType,
      IfNoneMatch: ifNoneMatch,
    }));
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async list(prefix = "") {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }));
      keys.push(...(page.Contents ?? []).flatMap((item) => (item.Key ? [item.Key] : [])));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  getSignedReadUrl(key: string) {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  }
}

class GcpObjectStore implements ObjectStore {
  private readonly bucket;

  constructor(name: string) {
    this.bucket = new Storage().bucket(name);
  }

  async exists(key: string) { return (await this.bucket.file(key).exists())[0]; }
  async read(key: string) { return new Uint8Array((await this.bucket.file(key).download())[0]); }
  async write(key: string, value: Uint8Array | string, contentType: string) {
    await this.bucket.file(key).save(value, { contentType });
  }
  async writeIfAbsent(key: string, value: Uint8Array | string, contentType: string) {
    try {
      await this.bucket.file(key).save(value, { contentType, preconditionOpts: { ifGenerationMatch: 0 } });
      return true;
    } catch (error) {
      if (statusCode(error) === 409 || statusCode(error) === 412) return false;
      throw error;
    }
  }
  async delete(key: string) { await this.bucket.file(key).delete({ ignoreNotFound: true }); }
  async list(prefix = "") {
    return (await this.bucket.getFiles({ prefix, autoPaginate: true }))[0].map((file) => file.name);
  }
  async getSignedReadUrl(key: string) {
    return (await this.bucket.file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    }))[0];
  }
}

function statusCode(error: unknown): number | undefined {
  return error && typeof error === "object"
    ? (error as { statusCode?: number; code?: number; $metadata?: { httpStatusCode?: number } }).statusCode ??
        (error as { code?: number }).code ??
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
}

function errorName(error: unknown): string | undefined {
  return error && typeof error === "object" ? (error as { name?: string }).name : undefined;
}
