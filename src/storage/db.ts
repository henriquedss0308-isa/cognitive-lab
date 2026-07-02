import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AppSettings, SessionRecord } from '../types'

interface CognitiveLabDB extends DBSchema {
  sessions: {
    key: string
    value: SessionRecord
    indexes: {
      'by-test': string
      'by-date': string
      'by-mode': string
      'by-status': string
    }
  }
  settings: {
    key: string
    value: AppSettings & { key: string }
  }
}

const DB_NAME = 'cognitive-lab'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<CognitiveLabDB>> | null = null

export function getDB(): Promise<IDBPDatabase<CognitiveLabDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CognitiveLabDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' })
          sessionStore.createIndex('by-test', 'testId')
          sessionStore.createIndex('by-date', 'startedAt')
          sessionStore.createIndex('by-mode', 'mode')
          sessionStore.createIndex('by-status', 'status')
          db.createObjectStore('settings', { keyPath: 'key' as never })
        } else if (oldVersion < 2) {
          const store = transaction.objectStore('sessions')
          if (!store.indexNames.contains('by-status')) {
            store.createIndex('by-status', 'status')
          }
          let cursor = await store.openCursor()
          while (cursor) {
            const val = cursor.value as SessionRecord
            if (!val.status) {
              val.status = 'completed'
              await cursor.update(val)
            }
            cursor = await cursor.continue()
          }
        }
      },
    })
  }
  return dbPromise
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontScale: 1,
  developerMode: false,
  hasSeenIntro: false,
  demoDataActive: false,
}