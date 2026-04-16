import express from 'express';
import type {App} from '@slack/bolt';
import type {EnvConfig} from '../config/env.js';
import type {Services} from '../app/services.js';
import {buildHomePendingView, buildHomeView} from '../onboarding/home/index.js';
import {isJourneyStepId} from '../onboarding/types.js';
import {publishHomeView} from '../slack/publishHome.js';

export function createHttpServer(
  env: EnvConfig,
  services?: Services,
  slackClient?: App['client']
) {
  const app = express();

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      pid: process.pid,
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
  const {
    identityResolver,
    journey,
    confluenceSearch,
    onboardingPackages,
    canvas,
  } = services;

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
    res.json(
      prepared.onboardingPackage &&
        prepared.onboardingPackage.status === 'published'
        ? buildHomeView(prepared.onboardingPackage, prepared.state)
        : buildHomePendingView(
            onboardingPackages.getDraftsForReviewer(profile.userId)
          )
    );
  });

  app.get('/test/home/publish', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }
    if (!slackClient) {
      res.status(503).json({error: 'Slack client not available'});
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const prepared = await journey.prepareDashboard(profile);
    const view =
      prepared.onboardingPackage &&
      prepared.onboardingPackage.status === 'published'
        ? buildHomeView(prepared.onboardingPackage, prepared.state)
        : buildHomePendingView(
            onboardingPackages.getDraftsForReviewer(profile.userId)
          );

    await publishHomeView(services, slackClient, profile.userId, view);
    res.json({
      published: true,
      userId: profile.userId,
      blocks: view.blocks.length,
    });
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

  app.get('/test/draft/create', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const createdByUserId =
      requiredQuery(req, 'createdByUserId') ?? profile.userId;
    const buddyUserId = requiredQuery(req, 'buddyUserId');
    const stakeholderUserIds = listQuery(req, 'stakeholderUserIds');
    const welcomeNote = requiredQuery(req, 'welcomeNote');

    const pkg = await onboardingPackages.createDraftPackage({
      profile,
      createdByUserId,
      welcomeNote,
      buddyUserId,
      stakeholderUserIds,
      slackClient,
    });

    res.json(pkg);
  });

  app.get('/test/draft/update', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const createdByUserId =
      requiredQuery(req, 'createdByUserId') ?? profile.userId;
    const buddyUserId = requiredQuery(req, 'buddyUserId');
    const stakeholderUserIds = listQuery(req, 'stakeholderUserIds');
    const welcomeNote = requiredQuery(req, 'welcomeNote');
    const pkg = await onboardingPackages.updateDraftPackage({
      profile,
      createdByUserId,
      welcomeNote,
      buddyUserId,
      stakeholderUserIds,
      slackClient,
    });

    if (!pkg) {
      res.status(404).json({error: 'draft not found'});
      return;
    }

    res.json(pkg);
  });

  app.get('/test/draft/publish', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const publishedByUserId =
      requiredQuery(req, 'publishedByUserId') ??
      profile.manager.slackUserId ??
      profile.userId;
    const result = onboardingPackages.publishPackage(
      profile.userId,
      publishedByUserId
    );
    if (result.ok && slackClient && result.pkg.status === 'published') {
      const prepared = await journey.prepareDashboard(profile);
      if (
        prepared.onboardingPackage &&
        prepared.onboardingPackage.status === 'published'
      ) {
        await canvas.publishWorkspace(
          slackClient,
          prepared.onboardingPackage,
          profile,
          prepared.state
        );
      }
    }
    res.json({
      published: result.ok,
      reason: result.ok ? undefined : result.reason,
      pkg: result.ok ? result.pkg : undefined,
    });
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

  app.get('/test/journey/task/select', async (req, res) => {
    const email = requiredQuery(req, 'email');
    const taskId = requiredQuery(req, 'taskId');
    if (!email || !taskId) {
      respondMissingQuery(res, 'email and taskId');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const reply = journey.selectTask(profile, taskId);
    res.json(reply);
  });

  app.get('/test/journey/task/confirm', async (req, res) => {
    const email = requiredQuery(req, 'email');
    if (!email) {
      respondMissingQuery(res, 'email');
      return;
    }

    const profile = await identityResolver.resolveFromEmail(email, slackClient);
    const reply = await journey.confirmTask(profile);
    if (slackClient) {
      const prepared = await journey.prepareDashboard(profile);
      if (
        prepared.onboardingPackage &&
        prepared.onboardingPackage.status === 'published'
      ) {
        await canvas.syncSharedProgress(
          slackClient,
          prepared.onboardingPackage,
          prepared.state
        );
      }
    }
    res.json(reply);
  });
}

function requiredQuery(req: express.Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function listQuery(req: express.Request, key: string): string[] | undefined {
  const value = requiredQuery(req, key);
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function respondMissingQuery(
  res: express.Response,
  keys: string
): express.Response {
  return res.status(400).json({error: `${keys} query param required`});
}
