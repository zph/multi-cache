#!/usr/bin/env -S deno run -A --ext ts

import { parseArgs } from "jsr:@std/cli@0.224.6/parse-args"
import { fileStoreWithEvents } from "../src/stores/file.ts";
import { caching, multiCaching } from "npm:cache-manager@5.6.1";
import { s3Store } from "../src/stores/s3.ts";
import { S3Client } from "npm:@aws-sdk/client-s3@3.600.0";
import { $ } from "jsr:@david/dax@0.41.0"

enum Action {
  Get = "get",
  Reset = "reset",
  Delete = "delete",
  Set = "set",
  Ttl = "ttl",
}

const buildCache = async ({ directory, fileCacheTTL, s3CacheTTL, debug, bucket, prefix }: { directory: string, fileCacheTTL: number, s3CacheTTL: number, debug: boolean, bucket: string, prefix: string }) => {
  const [fstore, events] = await fileStoreWithEvents({
    directory: directory,
    ttl: fileCacheTTL,
    prefix: '',
  })
  const fileCache = await caching(fstore)
  if (debug) {
    events.on('cache:op', (event) => console.error(event))
  }

  let caches: any[] = [fileCache]
  if (bucket !== "") {
    const s3 = await s3Store({
      bucket: bucket,
      prefix: prefix,
      s3Client: new S3Client({
        region: 'us-east-1',
        forcePathStyle: true,
      }),
      ttl: s3CacheTTL,
      // TODO: implement background refresh, it may not currently be working
      refreshThreshold: s3CacheTTL / 4,
      onBackgroundRefreshError: (error) => console.log(`Background refresh error: `, error),
    })

    const s3Cache = await caching(s3)
    caches.push(s3Cache)
  }

  return multiCaching(caches);
}

export const kvctl = async ({ directory, action, key, commandFn, debug, bucket, prefix, ttlMin }: { directory: string, action: Action, key: string, commandFn: TCommandFn, debug: boolean, bucket: string, prefix: string, ttlMin: number }) => {
  const fileCacheTTL = ttlMin * 60 * 1000
  const cache = await buildCache({ directory, fileCacheTTL, s3CacheTTL: fileCacheTTL * 24, debug, bucket, prefix })
  switch (action) {
    case Action.Get:
      console.log(await cache.wrap(key, commandFn, fileCacheTTL, fileCacheTTL / 4))
      break;
    case Action.Delete:
      {
        const result = await cache.del(key)
        if(result !== undefined) {
          throw new Error(`Deletion returned unexpected value`, result)
        }
      }
      break;
    case Action.Reset:
      console.log(await cache.reset())
      break;
    default:
      break;
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["directory", "command", "action", "key", "ttl-minutes", "bucket", "prefix"],
    boolean: ["debug"],
    default: {
      directory: [Deno.env.get("HOME"), ".local/cache/multi-cache"].join('/'),
      command: undefined,
      action: "get",
      debug: false,
      key: undefined,
      bucket: "",
      prefix: "cache",
      "ttl-minutes": "60",
    }
  })

  if (args.bucket === "") {
    const s3Bucket = Deno.env.get("KVCTL_S3_BUCKET")
    if (s3Bucket !== undefined) {
      args.bucket = s3Bucket
    }
  }

  const dir = Deno.env.get("KVCTL_DIRECTORY")
  console.log({dir})
  if (dir !== undefined) {
    args.directory = dir
  }

  console.log({args})
  let { directory, action, command, key, debug, bucket, prefix } = args;
  const ttlMin = parseInt(args["ttl-minutes"])
  if (key === undefined && command === undefined && action === "get") {
    // Assume positional args
    let a = args._[0]
    if(a === "del") {
      a = "delete"
    }
    action = a as Action
    key = args._[1] as string | undefined
    command = args._[2] as string | undefined
  }
  const actionTyped = action as Action

  if (key === "" || key === undefined) {
    throw new Error(`Must supply a key`)
  }

  let commandFn: TCommandFn
  if (command?.startsWith("http")) {
    commandFn = () => $.request(command).text()
  } else if (command === undefined || command === "") {
    throw new Error(`No command supplied`)
  } else {
    commandFn = () => $.raw`${command}`.text()
  }


  await kvctl({ directory, action: actionTyped, key, commandFn, debug, bucket, prefix, ttlMin })
}

type TCommandFn = (() => Promise<string>)

