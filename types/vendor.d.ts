declare module "gltf-validator" {
  export type ValidatorIssue = {
    code: string
    message: string
    severity: number // 0 error, 1 warning, 2 info, 3 hint
    pointer?: string
  }
  export type ValidatorReport = {
    issues: {
      numErrors: number
      numWarnings: number
      numInfos: number
      numHints: number
      messages: ValidatorIssue[]
    }
    info?: { totalTriangleCount?: number; extensionsUsed?: string[] }
  }
  export function validateBytes(
    data: Uint8Array,
    options?: { uri?: string; maxIssues?: number; ignoredIssues?: string[]; externalResourceFunction?: (uri: string) => Promise<Uint8Array> },
  ): Promise<ValidatorReport>
  export function version(): string
}
