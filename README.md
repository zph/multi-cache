# Cache Stores as Plugins for Cache-Manager in Deno

STATUS: prototype with basic tests

Implements the following stores:
1. file based (path as key) and supports prefixing
1. s3 store with support for prefixing
1. sqlite store (re-exporting @resolid/cache-manager-sqlite)


## TODO
- Add wrapper to inject extra behaviors before/after cache actions

# Operations

Local regression testing pointing to localstack for s3, plus AWS_* env vars as normal
```
AWS_ENDPOINT_URL=http://localhost:4566 KVCTL_DIRECTORY=./.test-caching KVCTL_S3_BUCKET=
"test-bucket" deno run -A ./bin/kvctl.ts get a_key "sleep 10 && echo 1" --ttl-minutes
1 --debug
```

Using S3: set keys via env var for aws auth
```
KVCTL_DIRECTORY=./.test-caching KVCTL_S3_BUCKET=
"test-bucket" deno run -A ./bin/kvctl.ts get a_key "sleep 10 && echo 1" --ttl-minutes
1 --debug --prefix cache-prefix
```
S3 will only be used if a bucket name is detected
