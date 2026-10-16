import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import path from 'node:path';

export type ClientCredential = { user: string; password: string };

/** Client secrets never enter SQLite, logs or API metadata. Back up this directory with admin data. */
export class CredentialStore {
  constructor(private directory: string) {}
  private async key() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, 'client-credentials.key');
    try { await writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    await chmod(file, 0o600);
    const key = await readFile(file);
    if (key.length !== 32) throw new Error('Invalid client credential encryption key');
    return key;
  }
  private file(database: string) {
    return path.join(this.directory, `client-${createHash('sha256').update(database).digest('hex')}.enc`);
  }
  async get(database: string): Promise<ClientCredential | null> {
    let raw: Buffer;
    try { raw = await readFile(this.file(database)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    const decipher = createDecipheriv('aes-256-gcm', await this.key(), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(database));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString());
  }
  async set(database: string, credential: ClientCredential) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await this.key(), iv);
    cipher.setAAD(Buffer.from(database));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(credential)), cipher.final()]);
    const file = this.file(database), temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
    await rename(temporary, file);
  }
}
