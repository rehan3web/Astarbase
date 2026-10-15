import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { RecoveryError, resetDatabasePassword } from '../services/system/password-recovery.service.js';

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--confirm-user') {
    throw new RecoveryError('Usage: node dist/src/maintenance/reset-password.js --confirm-user <DB_USER>');
  }
  await resetDatabasePassword(config, args[1]);
  console.log('Password reset confirmed. Application data and authentication rules were not changed.');
  console.log('The database role now uses the DB_PASSWORD supplied by your current Compose environment.');
  console.log('Restart the stack with docker compose up -d --wait. Existing clients need the matching password.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof RecoveryError ? error.message :
      'Recovery failed. Check Compose configuration, local Docker socket permissions, and the stopped Postgres container. No credentials are logged.');
    process.exitCode = 1;
  });
}
