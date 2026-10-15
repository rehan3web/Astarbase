import { loadConfig } from '../src/config.js';

// Non-secret fixtures used only by tests; never loaded into the application env.
export const config = loadConfig({
  DB_NAME: 'test_project',
  DB_USER: 'test_admin',
  DB_PASSWORD: 'test-password-not-for-deployment',
  ADMIN_API_TOKEN: 'test-token-not-for-deployment-0000000000',
  AUTO_START_COMPOSE: 'false',
});
