import { promises as fs } from 'fs'
import path from 'path'

export function createSessionStore(workspaceDir) {
  const sessionId = new Date().toISOString().replace(/[:.]/g, '-')
  const rootDir = path.join(workspaceDir, '.compatible-shell', 'sessions')
  const sessionPath = path.join(rootDir, `${sessionId}.json`)

  return {
    sessionId,
    sessionPath,
    async save(snapshot) {
      await fs.mkdir(rootDir, { recursive: true })
      await fs.writeFile(sessionPath, JSON.stringify(snapshot, null, 2), 'utf8')
      return sessionPath
    },
  }
}
