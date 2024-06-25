import * as path from "jsr:@std/path@1.0.0-rc.2";
import type { Cache, Store, Config } from 'npm:cache-manager@5.6.1';
import { jsonSerializer } from '../serializer.ts'
const { serialize, deserialize } = jsonSerializer;
import { ulid } from "jsr:@std/ulid@1.0.0-rc.2";
import { CacheEvent, EventEmitter, buildOpFn } from "../events.ts";
import { NoCacheableError } from "../util.ts";

// Standardized naming
// TTL should always be the +ms and TS should always
// be the timestamp in future

export type FileCache = Cache<FileStore>;

export interface FileStore extends Store {
  name: 'file';
  isCacheable: (value: unknown) => boolean;
  get directory(): string;
  fullKey(key: string): string;
}

function builder(
  directory: string,
  prefix: string,
  options?: Config,
) {
  const isCacheable =
    options?.isCacheable || ((value) => value !== undefined && value !== null);

  const eventEmitter = new EventEmitter();
  const op = buildOpFn(eventEmitter, 'file');
  return [
    {
      async get<T>(key: string): Promise<T | undefined> {
        key = this.fullKey(key);
        const id = ulid();
        try {
          const filePath = path.join(directory, key);
          try {
            const stat = await Deno.stat(filePath);
            if (stat.isFile) {
              op(CacheEvent.HIT, { id, key, extra: "file exists" });
            } else {
              op(CacheEvent.MISS, { id, key, extra: "file doesn't exist" });
            }
          } catch (e) {
            op(CacheEvent.MISS, { id, key, error: e.name });
          }

          const val = await Deno.readTextFile(filePath);
          const ttlFile = await Deno.readTextFile(filePath + '.ttl');
          const value = deserialize(val) as T;
          const ttlTs = deserialize(ttlFile) as number;
          const now = Date.now();
          const expired = Date.now() > ttlTs;
          const ttl = ttlTs - now;
          op(CacheEvent.GET, { id, key, value, ttl, ttlTs, now, expired });
          if (expired) {
            return undefined;
          }
          return value;
        } catch (error) {
          op(CacheEvent.MISS, { id, key, error: error.name });
          if (['ENOENT', 'ENOTDIR'].includes(error.code)) return undefined;
          throw error;
        }
      },
      async mget<T>(...keys: string[]) {
        return await Promise.all(keys.map(key => this.get<T>(key)));
      },
      async set(key, value, ttl) {
        key = this.fullKey(key);
        ttl = ttl || options?.ttl
        if (!isCacheable(value))
          throw new NoCacheableError(`"${value}" is not a cacheable value`);
        const filePath = path.join(directory, key);
        const dirname = path.dirname(filePath);
        try {
          const f = await Deno.lstat(dirname)
          if (f.isFile) {
            throw new Error(`"${dirname}" is a file, not a directory.
          This tends to happen when using an unqualified filename and reusing it also as a recursive
          directory path.

          Please use an extension on the filename or choose a non-conflicting path.

          Example:
            const cache = new Cache('./cache')
            cache.set('foo', 'bar')
            cache.set('foo/bar', 'baz')

          Will cause foo to be created as a file, but then attempt to be used as a directory.
          `)
          }
        } catch (err) {
          if (!(err instanceof Deno.errors.NotFound)) {
            throw err;
          }
        }
        if (!ttl) ttl = 0
        const now = Date.now();
        const ttlTs = now + ttl;
        await Deno.mkdir(dirname, { recursive: true })
        await Promise.all([
          Deno.writeTextFile(filePath, serialize(value)),
          Deno.writeTextFile(filePath + '.ttl', serialize(ttlTs)),
        ])
        op(CacheEvent.SET, { id: ulid(), key, value, ttl, ttlTs, ts: now });
      },
      async mset(args: SetOptions[], ttl: number) {
        await Promise.all(args.map(([key, value]) => this.set(key, value, ttl)));
      },
      async del(key) {
        key = this.fullKey(key)
        const filePath = path.join(directory, key);
        op(CacheEvent.DELETE, { id: ulid(), key });
        try {
          await Deno.remove(filePath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      },
      async reset() {
        const files = Deno.readDir(directory);
        const promises = []
        for await (const f of files) {
          promises.push(Deno.remove(path.join(directory, f.name), { recursive: true }))
        }
        await Promise.all(promises)
      },
      async ttl(key) {
        key = this.fullKey(key)
        const filePath = path.join(directory, key + '.ttl');
        try {
          const ttlContent = await Deno.readTextFile(filePath);
          const ttlTs = deserialize(ttlContent) as number;
          const now = Date.now();
          const ttl = ttlTs - now
          op(CacheEvent.TTL, { id: ulid(), key, ttl, ttlTs });
          return ttl;
        } catch (error) {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        }
      },
      async keys(pattern = '*') {
        const files = Deno.readDir(directory);
        const keys = [];
        let matchingFn
        if (pattern === '*') {
          matchingFn = () => true
        } else {
          matchingFn = (key: string) => {
            key = this.fullKey(key)
            return key.startsWith(pattern)
          }
        }

        for await (const f of files) {
          // TODO: is this complete path or only the basename?
          if (f.isFile && matchingFn(f.name)) {
            keys.push(f.name);
          }
        }
        return keys;
      },
      isCacheable,
      name: 'file',
      get directory() {
        return directory;
      },
      fullKey(key: string) {
        if(prefix === '') return key
        if(key.startsWith(prefix)) return key
        return [prefix, key].join('/');
      }
    },
    eventEmitter,
  ] as [FileStore, EventEmitter];
}

type SetOptions = [
  string,
  unknown,
]

export function fileStoreWithEvents(options?: Config & { directory: string, prefix: string }): [FileStore, EventEmitter<string | symbol, any>] {
  const directory = options?.directory || Deno.cwd();
  const prefix = options?.prefix || 'cache';
  Deno.mkdirSync(directory, { recursive: true });

  return builder(directory, prefix, options);
}

export function fileStore(options?: Config & { directory: string, prefix: string }): FileStore {
  const [fileStore, _] = fileStoreWithEvents(options);
  return fileStore
}
