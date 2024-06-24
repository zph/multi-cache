import { assertEquals, assertRejects } from "jsr:@std/assert";
import { S3Client, CreateBucketCommand, DeleteBucketCommand  } from "npm:@aws-sdk/client-s3";
import { caching, multiCaching } from "npm:cache-manager";
import { s3StoreWithEvents } from "../src/stores/s3.ts";
import { sleep } from "../src/util.ts";
import { fileStoreWithEvents } from "../src/stores/file.ts";

const verbose = Deno.env.has("VERBOSE")

const bucket = "cache-manager-test-bucket"
const s3CacheTTL = 5000

const client = new S3Client({
      credentials: {
         accessKeyId: 'S3RVER',
         secretAccessKey: 'S3RVER',
      },
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
   })

const [s3, s3Events] = await s3StoreWithEvents({
   bucket: bucket,
   prefix: 'cache',
   s3Client: client,
   ttl: s3CacheTTL,
   // TODO: implement background refresh, it may not currently be working
   refreshThreshold: s3CacheTTL / 2,
   onBackgroundRefreshError: (error) => console.log(`Background refresh error: `, error),
})

const createFileStore = async (directory: string, ttlMs: number) => {
  const [fstore, events] = await fileStoreWithEvents({
    directory,
    prefix: '',
    ttl: ttlMs,
  })
  const fileCache = await caching(fstore)
  if(verbose) {
    events.on('cache:op', (e) => console.log(JSON.stringify(e, null, 0)));
  }
  return fileCache
}

if(verbose) {
  s3Events.on('cache:op', (e) => console.log(JSON.stringify(e, null, 0)));
}


const s3Cache = await caching(s3)

const cache = multiCaching([s3Cache]);
cache.on('error', (e) => console.log(e))

const s3Client = client

// Function to create an S3 bucket
const createBucket = async (bucketName: string): Promise<void> => {
  const command = new CreateBucketCommand({
    Bucket: bucketName,
  });

  try {
    const _response = await s3Client.send(command);
  } catch (error) {
    console.error("Error creating bucket:", error);
  }
};

// Function to delete an S3 bucket
const deleteBucket = async (bucketName: string): Promise<void> => {
  const command = new DeleteBucketCommand({
    Bucket: bucketName,
  });

  try {
    await s3Client.send(command);
  } catch (error) {
    console.error(`Error deleting bucket ${bucketName}:`, error);
  }
};

Deno.test("s3Driver", async (t) => {
  // provide a step name and function
  //
  // Create the 'cache-manager-unit-test-bucket' bucket
  await t.step("create bucket", async () => {
    await createBucket(bucket)
  })

  await t.step("write to cache", async () => {
    const key = "users2";
    const value = { name: "Deno" };
    await cache.set(key, value, 10000);

    const users = await cache.get(key);
    assertEquals(users, value);
  });

  await t.step("write to cache and fetch expired value", async () => {
    const key = "users3";
    const value = { name: "Deno" };
    await cache.set(key, value, 1000);
    await sleep(1100);

    const users = await cache.get(key);
    assertEquals(users, undefined);
  });
  await t.step("cache.wrap always fetches a value", async () => {
    const key = "users4";
    const value = { name: "Deno" };
    await cache.wrap(key, async () => { await sleep(500); return value;}, 1000);
    const result = await cache.wrap(key, async () => { await sleep(500); return value;}, 1000);

    assertEquals(result, value);
  });

  // Cleanup
  await t.step("remove bucket", async () => {
    await cache.reset()
    await deleteBucket(bucket)
  })
})


Deno.test("fileStore", async (t) => {
  const directory = await Deno.makeTempDir({prefix: 'cache-manager-tests'})
  const cache = await createFileStore(directory, 500)

  await t.step("write to cache", async () => {
    const key = "users2";
    const value = { name: "Deno" };
    await cache.set(key, value, 10000);

    const users = await cache.get(key);
    assertEquals(users, value);
  });

  await t.step("write to cache with conflicting paths", async () => {
    const key = "users9";
    const value = { name: "Deno" };
    await cache.set(key, value, 10000);

    assertRejects(async () => {
      await cache.set(`${key}/file.json`, value, 10000);
    })
  });

  await t.step("write to cache and fetch expired value", async () => {
    const key = "users3";
    const value = { name: "Deno" };
    await cache.set(key, value, 1000);
    await sleep(1100);

    const users = await cache.get(key);
    assertEquals(users, undefined);
  });
  await t.step("cache.wrap always fetches a value", async () => {
    const key = "users4";
    const value = { name: "Deno" };
    await cache.wrap(key, async () => { await sleep(500); return value;}, 1000);
    const result = await cache.wrap(key, async () => { await sleep(500); return value;}, 1000);

    assertEquals(result, value);
  });

  // Cleanup
  await t.step("remove directory", async () => {
    await cache.reset()
    await Deno.remove(directory, {recursive: true})
  })
})


Deno.test("fileStore and s3Store multiCache", async (t) => {
  const directory = await Deno.makeTempDir({prefix: 'cache-manager-tests'})
  const fc = await createFileStore(directory, 500)
  const cache = multiCaching([fc, s3Cache]);

  await t.step("create bucket", async () => {
    await createBucket(bucket)
  })


  await t.step("write to cache", async () => {
    const key = "users2";
    const value = { name: "Deno" };
    await cache.set(key, value, 10000);

    const users = await cache.get(key);
    assertEquals(users, value);
  });

  await t.step("write to cache and fetch expired value", async () => {
    const key = "users3";
    const value = { name: "Deno" };
    await cache.set(key, value, 1000);
    await sleep(1100);

    const users = await cache.get(key);
    assertEquals(users, undefined);
  });
  await t.step("cache.wrap always fetches a value", async () => {
    const key = "users4";
    const value = { name: "Deno" };
    await cache.wrap(key, async () => { await sleep(500); return value;});
    const result = await cache.wrap(key, async () => { await sleep(500); return value;});

    assertEquals(result, value);
  });

  // Cleanup
  await t.step("remove bucket", async () => {
    console.log(await cache.reset())
    await deleteBucket(bucket)
      .catch((error) => console.error("Bucket deletion failed:", error));
  })
  // Cleanup
  await t.step("remove directory", async () => {
    await cache.reset()
    await Deno.remove(directory, {recursive: true})
  })
})
