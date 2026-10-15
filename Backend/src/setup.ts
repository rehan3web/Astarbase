import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { envFile, projectDir, loadConfig } from './config.js';

export async function startCompose(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // Force the Docker CLI to the local Unix socket, ignoring remote contexts.
    const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock' };
    delete env.DOCKER_CONTEXT;
    delete env.DOCKER_TLS_VERIFY;
    delete env.DOCKER_CERT_PATH;
    const child = spawn('docker', ['--host', 'unix:///var/run/docker.sock', 'compose', '--env-file', envFile,
      '-f', `${projectDir}/docker-compose.yml`, 'up', '-d', '--build', '--wait'], {
      cwd: projectDir, env, stdio: 'inherit',
    });
    child.once('error', () => reject(new Error('Docker with the Compose plugin is required on the deployment host')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Compose startup failed (${code}); check the local Docker socket`)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadConfig();
  startCompose().then(() => console.log('Stack started; the Admin API pushed its schema before becoming healthy.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
