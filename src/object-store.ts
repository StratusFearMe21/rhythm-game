import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";

export interface ObjectStore {
  exists(key: string): Promise<boolean>;
  read(key: string): Promise<Uint8Array>;
  write(key: string, value: Uint8Array | string, contentType: string): Promise<void>;
  writeIfAbsent(key: string, value: Uint8Array | string, contentType: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export function createObjectStore(): ObjectStore {
  const provider = (Bun.env["CLOUD_PROVIDER"] ?? "aws").toLowerCase();
  const name = Bun.env["PORTAL_STORE_NAME"] ?? Bun.env["S3_BUCKET"];
  if (!name) throw new Error("PORTAL_STORE_NAME is required");
  if (provider === "aws") return new AwsObjectStore(name);
  if (provider === "gcp") return new GcpObjectStore(name);
  throw new Error(`Unsupported CLOUD_PROVIDER: ${provider}`);
}

class AwsObjectStore implements ObjectStore {
  private readonly client: S3Client;

  constructor(private readonly bucket: string) {
    this.client = new S3Client({
      region: Bun.env["AWS_REGION"] ?? Bun.env["S3_REGION"] ?? "us-west-2",
      followRegionRedirects: true,
      endpoint: Bun.env["S3_ENDPOINT"],
      forcePathStyle: Bun.env["S3_ENDPOINT"] !== undefined,
      credentials:
        Bun.env["S3_ACCESS_KEY_ID"] && Bun.env["S3_SECRET_ACCESS_KEY"]
          ? {
              accessKeyId: Bun.env["S3_ACCESS_KEY_ID"],
              secretAccessKey: Bun.env["S3_SECRET_ACCESS_KEY"],
            }
          : undefined,
    });
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

