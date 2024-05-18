/*
 * @resolid/cache-manager-sqlite
 * const sqliteStoreCache = cacheManager.caching(sqliteStore({sqliteFile: join(process.cwd(), 'cache.sqlite3'), cacheTableName: 'caches'}))
 */
import { sqliteStore } from 'npm:@resolid/cache-manager-sqlite'
import * as path from "jsr:@std/path";

const sqliteFile = path.join(Deno.cwd(), '/cache.sqlite3')
const cacheTableName = 'caches'
export const defaultSqliteStore = sqliteStore({sqliteFile, cacheTableName})

export { sqliteStore } from 'npm:@resolid/cache-manager-sqlite'
