import { createHash } from "node:crypto";

export async function sha256FileBytes(bytes: ArrayBuffer): Promise<string> {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}
