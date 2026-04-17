import {describe, expect, it} from 'vitest';
import {makeTestCtx} from './makeTestCtx';

describe('makeTestCtx', () => {
  it('returns a ctx with all six services wired', () => {
    const ctx = makeTestCtx();
    expect(ctx.slack).toBeDefined();
    expect(ctx.llm).toBeDefined();
    expect(ctx.jira).toBeDefined();
    expect(ctx.github).toBeDefined();
    expect(ctx.confluence).toBeDefined();
    expect(ctx.db).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(ctx.env).toBeDefined();
    expect(ctx.scratch).toEqual({});
  });

  it('records outbound slack calls so tests can assert on them', async () => {
    const ctx = makeTestCtx();
    await ctx.slack.chat.postMessage({
      channel: 'C01',
      text: 'hello',
    });
    await ctx.slack.views.publish({
      user_id: 'U01',
      view: {type: 'home'},
    });
    expect(ctx.slack._calls).toHaveLength(2);
    expect(ctx.slack._calls?.[0]).toMatchObject({
      method: 'chat.postMessage',
      args: {channel: 'C01', text: 'hello'},
    });
    expect(ctx.slack._calls?.[1]).toMatchObject({
      method: 'views.publish',
    });
  });

  it('supports slack overrides for users.info', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE001: {
            id: 'UHIRE001',
            real_name: 'Hira Test',
            profile: {email: 'hira@webflow.com', title: 'Engineer'},
          },
        },
      },
    });
    const response = await ctx.slack.users.info({user: 'UHIRE001'});
    expect(response.ok).toBe(true);
    expect(response.user?.real_name).toBe('Hira Test');
  });

  it('lets callers inject a fully custom jira client', async () => {
    const ctx = makeTestCtx({
      jira: {
        configured: true,
        assignedToEmail: {
          'a@b.com': [
            {
              key: 'WEB-1',
              summary: 'Do the thing',
              status: 'In Progress',
              url: 'https://jira/browse/WEB-1',
            },
          ],
        },
      },
    });
    const issues = await ctx.jira.findAssignedToEmail('a@b.com');
    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe('WEB-1');
  });

  it('waitUntil captures scheduled tasks and prevents unhandled rejections', async () => {
    const tasks: Array<Promise<unknown>> = [];
    const ctx = makeTestCtx({waitUntilTasks: tasks});
    ctx.waitUntil(Promise.resolve('done'));
    ctx.waitUntil(Promise.reject(new Error('expected rejection')));
    expect(tasks).toHaveLength(2);
    const results = await Promise.allSettled(tasks);
    expect(results[0]).toMatchObject({status: 'fulfilled'});
    expect(results[1]).toMatchObject({status: 'rejected'});
  });
});
