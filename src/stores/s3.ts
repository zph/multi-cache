import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsCommand } from 'npm:@aws-sdk/client-s3';
import type { Cache, Store, Config } from 'npm:cache-manager';
import { jsonSerializer } from '../serializer.ts'
const { serialize, deserialize } = jsonSerializer;
import { CacheEvent, EventEmitter, buildOpFn } from "../events.ts";
import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts";
import { NoCacheableError } from "../util.ts";

// Standardized naming
// TTL should always be the +ms and TS should always
// be the timestamp in future

export type S3Cache = Cache<S3Store>;

export interface S3Store extends Store {
  name: 's3';
  isCacheable: (value: unknown) => boolean;
  get bucket(): string;
  get prefix(): string;
  fullKey(key: string): string;
}

function builder(
  bucket: string,
  prefix: string,
  s3Client: S3Client,
  options?: Config,
) {
  const isCacheable =
    options?.isCacheable || ((value) => value !== undefined && value !== null);

  const eventEmitter = new EventEmitter();
  const op = buildOpFn(eventEmitter, 's3');
  return [
    {
    async get<T>(key: string): Promise<T | undefined> {
      key = this.fullKey(key);
      const id = ulid();
      try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const { Body } = await s3Client.send(command);
        if(!Body) {
          return undefined
        }
        const val = await Body.transformToString()
        const [value, ttlTs] = deserialize(val);
        const now = Date.now();
        const expired = now >= ttlTs;
        const ttl = ttlTs - now;
        op(CacheEvent.GET, { id, key, value, ttl, ttlTs, expired });
        op(CacheEvent.HIT, { id, key, expired });
        if(expired) {
          return undefined
        }

        return value as T;
      } catch (error) {
        op(CacheEvent.MISS, { id, key, error: error.name });
        if (error.name === 'NoSuchKey') return undefined;
        throw error;
      }
    },
    async mget<T>(...keys: string[]) {
      return await Promise.all(keys.map(key => this.get<T>(key)));
    },
    async set(key, value, ttl?) {
      key = this.fullKey(key);
      ttl = ttl || options?.ttl
      if(ttl === undefined) {
        ttl = 0
      }
      if (!isCacheable(value))
        throw new NoCacheableError(`"${value}" is not a cacheable value`);
      const now = Date.now();
      const ttlTs = now + ttl;
      const v = [value, ttlTs]
      const serializedValue = serialize(v);
      // TODO: account for prefix
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: serializedValue,
      });
      await s3Client.send(command);
      op(CacheEvent.SET, { id: ulid(), key, value, ttl, ttlTs, ts: now });
    },
    async mset(args: SetOptions[], ttl: number) {
      await Promise.all(args.map(([key, value]) => this.set(key, value, ttl)));
    },
    async del(key) {
      key = this.fullKey(key);
      const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
      await s3Client.send(command);
      op(CacheEvent.DELETE, { id: ulid(), key });
    },

    async reset() {
      const listCommand = new ListObjectsCommand({ Bucket: bucket });
      const { Contents } = await s3Client.send(listCommand);
      if (!Contents) return undefined;
      await Promise.all(Contents.map(({ Key }) => Key && this.del(Key)))
    },

    async ttl(key: string): Promise<number | undefined> {
      key = this.fullKey(key);
      try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const { Body } = await s3Client.send(command);
        if(!Body) {
          return undefined
        }
        const val = await Body.transformToString();
        const [_value, ttlTs] = deserialize(val);
        const now = Date.now();
        const ttl = ttlTs - now;
        op(CacheEvent.TTL, { id: ulid(), key, ttl, ttlTs });
        return ttl;
      } catch (error) {
        op(CacheEvent.TTL, { id: ulid(), key, error: error.name });
        if (error.name === 'NoSuchKey') return undefined;
        throw error;
      }
    },
    keys: async (pattern = "") => {
      const listCommand = new ListObjectsCommand({ Bucket: bucket, Prefix: [prefix, pattern].join('/') });
      const { Contents } = await s3Client.send(listCommand);
      if (!Contents) return [];
      return Contents.map(({ Key }) => Key);
    },
    isCacheable,
    name: 's3',
    get bucket() {
      return bucket;
    },
    get prefix() {
      return prefix;
    },
    fullKey(key: string) {
      if(prefix === '') return key
      if(key.startsWith(prefix)) return key
      return [prefix, key].join('/');
    }
  },
  eventEmitter,
] as [S3Store, EventEmitter];
}

type SetOptions = [
  string,
  unknown,
]

export function s3StoreWithEvents(options?: Config & { bucket: string, prefix: string, s3Client: S3Client }) {
  const bucket = options?.bucket || 'my-s3-bucket';
  const prefix = options?.prefix || 'cache';
  const s3Client = options?.s3Client || new S3Client({ region: 'us-east-1' });

  return builder(bucket, prefix, s3Client, options);
}

export function s3Store(options?: Config & { bucket: string, prefix: string, s3Client: S3Client }) {
  const [store, _] = s3StoreWithEvents(options);
  return store
}
