import {loadEnv} from './config/env.js';
import {createLogger} from './app/logger.js';
import {createServices} from './app/services.js';
import {createHttpServer} from './server/createHttpServer.js';
import {createSlackApp} from './slack/createSlackApp.js';
import {registerHandlers} from './slack/registerHandlers.js';

async function main() {
  const env = loadEnv();
  const logger = createLogger('spark');
  logger.info(`Starting Spark (pid=${process.pid}, port=${env.port})`);
  const services = createServices(env, logger);
  const slackApp = createSlackApp(env);

  const httpApp = createHttpServer(env, services, slackApp?.client);
  httpApp.listen(env.port, () => {
    logger.info(`HTTP server listening on port ${env.port}`);
    logger.info(
      'Test harness ready — try: curl localhost:' +
        env.port +
        '/test/journey/start?email=YOUR_EMAIL'
    );
  });

  if (slackApp) {
    registerHandlers(slackApp, services);
    try {
      await slackApp.start();
      logger.info('Slack Socket Mode connected');
    } catch (error) {
      logger.warn(
        'Slack connection failed (app may not be approved yet) — continuing in HTTP-only mode',
        error
      );
    }
  } else {
    logger.warn('Slack tokens not configured — running in HTTP-only mode');
  }
}

main().catch((error) => {
  console.error('[spark] Fatal error during startup', error);
  process.exit(1);
});
