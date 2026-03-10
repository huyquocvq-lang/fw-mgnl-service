import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Computes the SHA-256 checksum of a file by streaming it through a hash
 * digest — the file is never fully loaded into memory.
 *
 * @param filePath Absolute path to the file.
 * @returns Hex-encoded SHA-256 digest string.
 */
export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
