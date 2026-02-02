/**
 * Node-compatible stdin reader
 * Replaces Bun.stdin.text() for cross-runtime compatibility
 */
/**
 * Read all content from stdin as text
 * Works with both Node.js and Bun
 */
export async function readStdin() {
    const chunks = [];
    return new Promise((resolve, reject) => {
        process.stdin.on("data", (chunk) => {
            chunks.push(Buffer.from(chunk));
        });
        process.stdin.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        process.stdin.on("error", (err) => {
            reject(err);
        });
        // Handle case where stdin is empty/closed immediately
        if (process.stdin.readableEnded) {
            resolve("");
        }
    });
}
