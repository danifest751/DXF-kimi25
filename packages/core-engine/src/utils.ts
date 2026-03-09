/**
 * @module utils
 * Shared low-level utilities for core-engine consumers.
 */

/**
 * Convert a Node.js Buffer to a proper ArrayBuffer (zero-copy when possible).
 */
export function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
