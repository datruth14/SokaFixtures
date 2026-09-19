export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (typeof globalThis.File === "undefined") {
      try {
        const { File: NodeFile } = await import("node:buffer");
        if (typeof NodeFile === "function") {
          Object.defineProperty(globalThis, "File", {
            value: NodeFile,
            writable: true,
            configurable: true,
          });
        }
      } catch {
        /* Node <18.13 has no File; Next requires Node >=18.18 so this is safe */
      }
    }
  }
}