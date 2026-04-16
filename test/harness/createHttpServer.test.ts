import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {createHttpServer} from '../../src/server/createHttpServer.js';
import {collectTextContent} from '../helpers/collectTextContent.js';
import {createFakeSlackClient} from '../helpers/createFakeSlackClient.js';
import {createTestServices} from '../helpers/createTestServices.js';

describe('createHttpServer test harness', () => {
  it('covers the manager-led draft lifecycle through the HTTP harness', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createHttpServer(services.env, services, slack.client);
    const managerUserId = profile.manager.slackUserId!;
    const buddyUserId = profile.buddy.slackUserId!;
    const reviewerUserId = 'UREV123';
    const pmUserId = profile.teammates[0].slackUserId!;
    const designerUserId = profile.teammates[1].slackUserId!;

    const pendingHome = await request(app)
      .get('/test/home')
      .query({email: profile.email});

    expect(pendingHome.status).toBe(200);
    expect(collectTextContent(pendingHome.body.blocks)).toContain(
      'Your onboarding plan has not been published yet.'
    );

    const created = await request(app).get('/test/draft/create').query({
      email: profile.email,
      createdByUserId: managerUserId,
      buddyUserId,
      stakeholderUserIds: pmUserId,
      welcomeNote: 'Welcome to the team',
    });

    expect(created.status).toBe(200);
    expect(created.body.status).toBe('draft');
    expect(created.body.welcomeNote).toBe('Welcome to the team');
    expect(created.body.draftChannelId).toMatch(/^C/);
    expect(created.body.draftCanvasId).toMatch(/^F/);
    expect(created.body.reviewerUserIds).toEqual(
      expect.arrayContaining([managerUserId, buddyUserId, pmUserId])
    );
    expect(slack.calls.conversationsCreate).toHaveLength(1);
    expect(slack.calls.conversationsCanvasesCreate).toHaveLength(1);

    const updated = await request(app)
      .get('/test/draft/update')
      .query({
        email: profile.email,
        createdByUserId: managerUserId,
        buddyUserId: reviewerUserId,
        stakeholderUserIds: `${pmUserId},${designerUserId}`,
        welcomeNote: 'Updated onboarding note',
      });

    expect(updated.status).toBe(200);
    expect(updated.body.welcomeNote).toBe('Updated onboarding note');
    expect(updated.body.buddyUserId).toBe(reviewerUserId);
    expect(updated.body.reviewerUserIds).toEqual(
      expect.arrayContaining([
        managerUserId,
        reviewerUserId,
        pmUserId,
        designerUserId,
      ])
    );

    const blockedPublish = await request(app).get('/test/draft/publish').query({
      email: profile.email,
      publishedByUserId: reviewerUserId,
    });

    expect(blockedPublish.status).toBe(200);
    expect(blockedPublish.body).toMatchObject({
      published: false,
      reason: 'not_manager',
    });

    const published = await request(app).get('/test/draft/publish').query({
      email: profile.email,
      publishedByUserId: managerUserId,
    });

    expect(published.status).toBe(200);
    expect(published.body.published).toBe(true);
    expect(published.body.pkg.status).toBe('published');

    const publishedHome = await request(app)
      .get('/test/home')
      .query({email: profile.email});

    expect(publishedHome.status).toBe(200);
    const publishedHomeText = collectTextContent(publishedHome.body.blocks);
    expect(publishedHomeText).toContain('Published');
    expect(publishedHomeText).toContain('Manager note:');
    expect(slack.calls.canvasesEdit.length).toBeGreaterThan(0);
  });

  it('covers journey progression, task selection, and milestone confirmation', async () => {
    const {profile, services, tasks} = createTestServices();
    const app = createHttpServer(services.env, services);

    await request(app).get('/test/draft/create').query({
      email: profile.email,
      createdByUserId: profile.manager.slackUserId,
      welcomeNote: 'Ready to publish',
    });
    await request(app).get('/test/draft/publish').query({
      email: profile.email,
      publishedByUserId: profile.manager.slackUserId,
    });

    const followUp = await request(app).get('/test/journey/step').query({
      email: profile.email,
      step: 'day2-3-follow-up',
    });

    expect(followUp.status).toBe(200);
    expect(followUp.body.text).toContain('day 2-3');

    const contribution = await request(app).get('/test/journey/step').query({
      email: profile.email,
      step: 'contribution-milestone',
    });

    expect(contribution.status).toBe(200);
    expect(collectTextContent(contribution.body.blocks)).toContain(
      'Choose a starter task'
    );

    const selected = await request(app).get('/test/journey/task/select').query({
      email: profile.email,
      taskId: tasks[0].id,
    });

    expect(selected.status).toBe(200);
    expect(selected.body.text).toContain(tasks[0].title);
    expect(collectTextContent(selected.body.blocks)).toContain('Get my steps');

    const confirmed = await request(app)
      .get('/test/journey/task/confirm')
      .query({
        email: profile.email,
      });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.text).toBe("Here's a clear path to get this done.");
    expect(collectTextContent(confirmed.body.blocks)).toContain(
      'Suggested branch'
    );
  });
});
