import "server-only"
import { serverEnv } from "@/lib/env"
import { localDriver } from "./local"
import { r2Driver } from "./r2"
import type { StorageDriver } from "./types"

export type { PresignedUpload, StorageDriver } from "./types"

/** The active storage driver, chosen by STORAGE_DRIVER ("local" | "r2"). */
export function storage(): StorageDriver {
  return serverEnv().STORAGE_DRIVER === "r2" ? r2Driver : localDriver
}
