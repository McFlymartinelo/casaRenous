import multer from "multer"
import type { Env } from "@casarenous/shared"
import { maxUploadBytes } from "./uploads.js"

export function createUpload(env: Env) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes(env),
      files: 1,
      fields: 25,
      fieldSize: 20_000,
    },
  })
}
