/*
 * @resolid/cache-manager-sqlite
 * const sqliteStoreCache = cacheManager.caching(sqliteStore({sqliteFile: join(process.cwd(), 'cache.sqlite3'), cacheTableName: 'caches'}))
 */
import { sqliteStore } from 'npm:@resolid/cache-manager-sqlite@5.1.5'
import * as path from "jsr:@std/path@1.0.0-rc.2";

const sqliteFile = path.join(Deno.cwd(), '/cache.sqlite3')
const cacheTableName = 'caches'
export const defaultSqliteStore = sqliteStore({sqliteFile, cacheTableName})

export { sqliteStore } from 'npm:@resolid/cache-manager-sqlite@5.1.5'
