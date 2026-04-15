import express from 'express';
import type {App} from '@slack/bolt';
import type {EnvConfig} from '../config/env.js';
import type {Services} from '../app/services.js';
import {buildHomeView} from '../onboarding/homeBlocks.js';
import {isJourneyStepId} from '../onboarding/types.js';

export function createHttpServer(
  env: EnvConfig,
  services?: Services,
  slackClient?: App['client']
) {
  const app = express();

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      slackConfigured: Boolean(env.slackAppToken && env.slackBotToken),
    });
  });

  if (services) {
    registerTestHarness(app, services, slackClient);
  }

  return app;
}

function registerTestHarness(
  app: express.Express,
  services: Services,
  slackClient?: App['client']
) {
  const {identityResolver, journey, confluenceSearch} = services;

  app.get('/test/profile', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    res.json(profile);
  });

  app.get('/test/journey/start', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const reply = await journey.start(profile);
    res.json(reply);
  });

  app.get('/test/home', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const prepared = await journey.prepareDashboard(profile);
    res.json(buildHomeView(prepared.profile, prepared.state));
  });

  app.get('/test/confluence', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const links = await confluenceSearch.findOnboardingPages(profile);
    res.json({links});
  });

  app.get('/test/journey/step', async (req, res) => {
    const email = requiredQuery(req, 'email');
    const step = requiredQuery(req, 'step');
    if (!email || !step) {
      respondMissingQuery(res, 'email and step');
      return;
    }
    if (!isJourneyStepId(step)) {
      res.status(400).json({error: 'invalid step'});
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const reply = await journey.advance(profile, step);
    res.json(reply);
  });

  app.get('/test/journey/people', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const reply = journey.showPeople(profile);
    res.json(reply);
  });

  app.get('/test/journey/ask', async (req, res) => {
    const email = requiredQuery(req, 'email');
    const question = requiredQuery(req, 'q');
    if (!email || !question) {
      respondMissingQuery(res, 'email and q');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const answer = await journey.answerQuestion(profile, question);
    res.json({answer});
  });
}

function requiredQuery(req: express.Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function respondMissingQuery(
  res: express.Response,
  keys: string
): express.Response {
  return res.status(400).json({error: `${keys} query param required`});
}
