import { caching, multiCaching } from 'npm:cache-manager';
import { fileStoreWithEvents } from '../src/stores/file.ts';
import { s3Store } from "../src/stores/s3.ts";
import { S3Client } from "npm:@aws-sdk/client-s3";

const memoryCacheTTL = 1 * 1000 /*milliseconds*/;
const memoryCache = await caching('memory', {
  max: 100,
  ttl: 1 * 1000 /*milliseconds*/,
});

const fileCacheTTL = 10 * memoryCacheTTL;
const [fstore, events] = await fileStoreWithEvents({
  directory: './.cache',
  ttl: fileCacheTTL,
  prefix: '',
})
const fileCache = await caching(fstore)
events.on('cache:op', (event) => console.log(event))

const s3CacheTTL = 10 * fileCacheTTL
const s3 = await s3Store({
   bucket: 'test-bucket',
   prefix: 'cache',
   s3Client: new S3Client({
      credentials: {
         accessKeyId: 'S3RVER',
         secretAccessKey: 'S3RVER',
      },
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
   }),
   ttl: s3CacheTTL,
   // TODO: implement background refresh, it may not currently be working
   refreshThreshold: s3CacheTTL / 4,
   onBackgroundRefreshError: (error) => console.log(`Background refresh error: `, error),
})

const s3Cache = await caching(s3)

export const cache = multiCaching([memoryCache, fileCache, s3Cache]);
