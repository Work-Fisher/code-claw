export {}

declare global {
  interface Window {
    clawDesktop?: {
      getBootstrap: () => Promise<{
        isDesktop: boolean
        upstreamApiKey: string
        encryptionAvailable: boolean
        appInfo?: {
          productName: string
          version: string
          description: string
          electronVersion: string
          nodeVersion: string
          chromeVersion: string
          platform: string
          launcherUrl: string
          userDataPath?: string
        } | null
      }>
      setSecret: (key: string, value: string) => Promise<{ ok: boolean }>
      pickDirectory: () => Promise<string | null>
      pickFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
      saveTextFile: (payload: {
        defaultPath?: string
        content: string
        filters?: Array<{ name: string; extensions: string[] }>
      }) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>
      restartLauncher: () => Promise<{ ok: boolean; url: string }>
      onCommand: (
        callback: (payload: { type: string; command?: string }) => void,
      ) => (() => void) | void
      onHostStatus: (
        callback: (payload: { type: string; message?: string }) => void,
      ) => (() => void) | void
    }
  }
}
