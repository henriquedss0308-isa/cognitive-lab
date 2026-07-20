import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AppSettings, SessionRecord } from '../types'
import { recomputeStoredBaselinePhases } from '../statistics/baseline'

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
const DB_VERSION = 3

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

        // v3: corrige result.baselinePhase gravado com off-by-one
        // (rótulo derivável — migração idempotente e re-executável).
        if (oldVersion >= 1 && oldVersion < 3) {
          const store = transaction.objectStore('sessions')
          const all = (await store.getAll()) as SessionRecord[]
          const phases = recomputeStoredBaselinePhases(all)
          let cursor = await store.openCursor()
          while (cursor) {
            const val = cursor.value as SessionRecord
            const correct = phases.get(val.sessionId)
            if (val.result && correct && val.result.baselinePhase !== correct) {
              val.result = { ...val.result, baselinePhase: correct }
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