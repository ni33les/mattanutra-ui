import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

const nativeHash = typeof process !== "undefined" && typeof process.getBuiltinModule === "function"
  ? process.getBuiltinModule("node:crypto").hash : undefined;

/** Identical UTF-8 SHA-256 in the browser simulator and server matcher. */
export function sha256Hex(value: string): string {
  return nativeHash ? nativeHash("sha256", value, "hex") : bytesToHex(sha256(utf8ToBytes(value)));
}
