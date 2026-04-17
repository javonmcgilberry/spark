import {describe, expect, it} from 'vitest';
import request from 'supertest';
import type {App} from '@slack/bolt';
import {createHttpServer} from '../../src/server/createHttpServer.js';
import {createTestServices} from '../helpers/createTestServices.js';
import type {EnvConfig} from '../../src/config/env.js';

const API_TOKEN = 'test-spark-api-token';

function makeEnv(services: ReturnType<typeof createTestServices>): EnvConfig {
  return {
    ...services.services.env,
    sparkApiToken: API_TOKEN,
  };
}

// TestIdentityResolver does not actually call the Slack client; it only
// needs to be present so resolveFromSlack is preferred over the email
// fallback. A bare stub is enough.
const stubSlackClient = {} as App['client'];

function authedHeaders() {
  return {
    Authorization: `Bearer ${API_TOKEN}`,
    'X-Spark-Manager-Slack-Id': 'UMGR123',
  };
}

describe('Spark API — bearer auth middleware', () => {
  it('rejects missing Authorization header with 401', async () => {
    const bundle = createTestServices();
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .get('/api/me')
      .set('X-Spark-Manager-Slack-Id', 'UMGR123');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects wrong token with 401', async () => {
    const bundle = createTestServices();
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not-the-real-token')
      .set('X-Spark-Manager-Slack-Id', 'UMGR123');

    expect(res.status).toBe(401);
  });

  it('rejects missing manager header with 400', async () => {
    const bundle = createTestServices();
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${API_TOKEN}`);

    expect(res.status).toBe(400);
  });

  it('returns 404 when the API is not configured', async () => {
    const bundle = createTestServices();
    const env: EnvConfig = {
      ...bundle.services.env,
      sparkApiToken: undefined,
    };
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app).get('/api/me');
    expect(res.status).toBe(404);
  });
});

describe('Spark API — routes (happy path)', () => {
  it('GET /api/me returns resolved manager profile', async () => {
    const bundle = createTestServices();
    const managerSlackId = bundle.profile.userId;
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .set('X-Spark-Manager-Slack-Id', managerSlackId);

    expect(res.status).toBe(200);
    expect(res.body.profile.userId).toBe(managerSlackId);
    expect(res.body.profile.teamName).toBe('Frontend Engineering');
  });

  it('POST /api/drafts creates a draft and GET /api/drafts/:id returns it', async () => {
    const bundle = createTestServices();
    const managerSlackId = bundle.profile.userId;
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const createRes = await request(app)
      .post('/api/drafts')
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .set('X-Spark-Manager-Slack-Id', managerSlackId)
      .send({
        newHireEmail: bundle.profile.email,
        welcomeNote: 'Welcome aboard!',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.pkg.status).toBe('draft');
    expect(createRes.body.pkg.welcomeNote).toBe('Welcome aboard!');

    const getRes = await request(app)
      .get(`/api/drafts/${bundle.profile.userId}`)
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .set('X-Spark-Manager-Slack-Id', managerSlackId);

    expect(getRes.status).toBe(200);
    expect(getRes.body.pkg.userId).toBe(bundle.profile.userId);
  });

  it('POST /api/drafts rejects invalid body', async () => {
    const bundle = createTestServices();
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .post('/api/drafts')
      .set(authedHeaders())
      .send({});

    expect(res.status).toBe(400);
  });

  it('PATCH /api/drafts/:id merges field updates', async () => {
    const bundle = createTestServices();
    const managerSlackId = bundle.profile.userId;
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    await request(app)
      .post('/api/drafts')
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .set('X-Spark-Manager-Slack-Id', managerSlackId)
      .send({newHireEmail: bundle.profile.email});

    const patchRes = await request(app)
      .patch(`/api/drafts/${bundle.profile.userId}`)
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .set('X-Spark-Manager-Slack-Id', managerSlackId)
      .send({
        welcomeNote: 'Patched welcome',
        buddyUserId: 'U_BUDDY_NEW',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.pkg.welcomeNote).toBe('Patched welcome');
    expect(patchRes.body.pkg.buddyUserId).toBe('U_BUDDY_NEW');
  });

  it('PATCH /api/drafts/:id returns 404 for unknown drafts', async () => {
    const bundle = createTestServices();
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .patch('/api/drafts/U_NOT_REAL')
      .set(authedHeaders())
      .send({welcomeNote: 'nope'});

    expect(res.status).toBe(404);
  });

  it('GET /api/drafts returns drafts owned by the manager', async () => {
    const bundle = createTestServices();
    const managerSlackId = bundle.profile.userId;
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    await request(app)
      .post('/api/drafts')
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .set('X-Spark-Manager-Slack-Id', managerSlackId)
      .send({newHireEmail: bundle.profile.email});

    const res = await request(app)
      .get('/api/drafts')
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .set('X-Spark-Manager-Slack-Id', managerSlackId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.drafts)).toBe(true);
    expect(res.body.drafts.length).toBeGreaterThan(0);
  });

  it('GET /api/lookup/team resolves team metadata for an email hint', async () => {
    const bundle = createTestServices();
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .get('/api/lookup/team')
      .query({hint: bundle.profile.email})
      .set(authedHeaders());

    expect(res.status).toBe(200);
    expect(res.body.teamName).toBe('Frontend Engineering');
    expect(res.body.roleTrack).toBe('frontend');
  });

  it('GET /api/lookup/contribution-tasks returns tasks from the scanner', async () => {
    const bundle = createTestServices();
    const env = makeEnv(bundle);
    const app = createHttpServer(env, bundle.services, stubSlackClient);

    const res = await request(app)
      .get('/api/lookup/contribution-tasks')
      .query({email: bundle.profile.email})
      .set(authedHeaders());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks.length).toBe(bundle.tasks.length);
  });
});
