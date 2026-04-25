import Dexie from 'dexie'

class IjinOutboxDB extends Dexie {
  constructor() {
    super('ebeddien_ijin_outbox')
    this.version(1).stores({
      outbox: '++id, &clientId, snapKey, status, createdAt, entity',
      ijinSnapshots: 'snapKey, updatedAt'
    })
  }
}

export const ijinOutboxDb = new IjinOutboxDB()
