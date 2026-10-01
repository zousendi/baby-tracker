import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const key = existsSync('.dev.vars') ? readFileSync('.dev.vars','utf8').match(/^ADMIN_KEY=(.+)$/m)?.[1] : randomBytes(32).toString('hex');
if (!key || key.length < 32) throw new Error('Invalid local ADMIN_KEY; preserve the existing file and correct it.');
for (const path of ['.dev.vars','.env']) if (!existsSync(path)) writeFileSync(path, `ADMIN_KEY=${key}\n`, { mode: 0o600 });
console.log('Local admin secret prepared in ignored .dev.vars and .env. Values were not printed.');
