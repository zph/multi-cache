# Cache Stores as Plugins for Cache-Manager in Deno

STATUS: prototype with basic tests

Implements the following stores:
1. file based (path as key) and supports prefixing
1. s3 store with support for prefixing
1. sqlite store (re-exporting @resolid/cache-manager-sqlite)


## TODO
- Add wrapper to inject extra behaviors before/after cache actions
