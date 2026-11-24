import { validateBytes, type ValidatorIssue } from "gltf-validator"

export type ValidationResult = {
  ok: boolean
  errors: ValidatorIssue[]
  warnings: ValidatorIssue[]
}

/** Run the Khronos glTF validator on GLB bytes. `ok` = zero errors. */
export async function validateGlb(bytes: Uint8Array): Promise<ValidationResult> {
  const report = await validateBytes(bytes, { maxIssues: 200 })
  const messages = report.issues.messages
  return {
    ok: report.issues.numErrors === 0,
    errors: messages.filter((m) => m.severity === 0),
    warnings: messages.filter((m) => m.severity === 1),
  }
}
