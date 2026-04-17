import {describe, expect, it} from 'vitest';
import {dispatchSlackEvent} from '../../lib/slack/events';
import {makeTestCtx} from '../helpers/makeTestCtx';
import {makeMemoryDraftStore} from '../../lib/draftStore';
import urlVerification from '../fixtures/slack-events/url-verification.json';
import appHomeOpened from '../fixtures/slack-events/app-home-opened.json';
import appMention from '../fixtures/slack-events/app-mention.json';
import messageIm from '../fixtures/slack-events/message-im.json';
import assistantThreadStarted from '../fixtures/slack-events/assistant-thread-started.json';
import memberJoinedChannel from '../fixtures/slack-events/member-joined-channel.json';
import type {OnboardingPackage} from '../../lib/types';

function samplePackage(
  overrides: Partial<OnboardingPackage> = {}
): OnboardingPackage {
  const now = new Date().toISOString();
  return {
    userId: 'UHIRE0001',
    status: 'draft',
    createdByUserId: 'UMANAGER1',
    managerUserId: 'UMANAGER1',
    reviewerUserIds: ['UMANAGER1'],
    createdAt: now,
    updatedAt: now,
    sections: {
      welcome: {
        title: 'Welcome',
        intro: 'Welcome aboard!',
        personalizedNote: undefined,
        onboardingPocs: [],
        journeyMilestones: [],
      },
      onboardingChecklist: {title: 'Checklist', intro: '', sections: []},
      peopleToMeet: {title: 'People', intro: '', people: []},
      toolsAccess: {title: 'Tools', intro: '', tools: []},
      slack: {title: 'Slack', intro: '', channels: []},
      initialEngineeringTasks: {
        title: 'Tasks',
        intro: '',
        managerPrompt: '',
        tasks: [],
      },
      rituals: {title: 'Rituals', intro: '', rituals: []},
      engineeringResourceLibrary: {
        title: 'Resources',
        intro: '',
        docs: [],
        references: {},
        keyPaths: [],
      },
    },
    ...overrides,
  };
}

describe('Slack event dispatcher', () => {
  it('answers url_verification with the challenge verbatim', async () => {
    const ctx = makeTestCtx();
    const outcome = await dispatchSlackEvent(urlVerification as never, ctx);
    expect(outcome.body).toEqual({
      challenge: (urlVerification as {challenge: string}).challenge,
    });
    expect(ctx.slack._calls).toHaveLength(0);
  });

  it('routes app_home_opened to the Home publisher', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE0001: {
            id: 'UHIRE0001',
            profile: {first_name: 'New', display_name: 'newhire'},
          },
        },
      },
    });
    const outcome = await dispatchSlackEvent(appHomeOpened as never, ctx);
    expect(outcome.body).toEqual({ok: true});
    await Promise.allSettled(outcome.background ?? []);
    expect(ctx.slack._calls?.some((c) => c.method === 'views.publish')).toBe(
      true
    );
  });

  it('finds an email-keyed draft for the Slack user when publishing Home', async () => {
    const db = makeMemoryDraftStore();
    await db.create(
      samplePackage({
        userId: 'newhire@webflow.com',
        status: 'published',
        draftCanvasUrl: 'https://slack.com/docs/T1/CANVAS1',
      })
    );
    const ctx = makeTestCtx({
      db,
      slack: {
        usersProfileGet: {
          UHIRE0001: {
            first_name: 'New',
            display_name: 'newhire',
            email: 'newhire@webflow.com',
          },
        },
      },
    });

    const outcome = await dispatchSlackEvent(appHomeOpened as never, ctx);
    expect(outcome.body).toEqual({ok: true});
    await Promise.allSettled(outcome.background ?? []);
    const publish = ctx.slack._calls?.find(
      (call) => call.method === 'views.publish'
    );
    expect(publish).toBeDefined();
    const blocks = (
      publish?.args.view as {blocks: Array<{text?: {text?: string}}>}
    ).blocks;
    expect(blocks[1]?.text?.text).toContain('Your onboarding plan is live.');
    expect(blocks[2]?.text?.text).toContain('Welcome aboard!');
  });

  it('routes app_mention to a chat.postMessage in the same thread', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE0001: {
            id: 'UHIRE0001',
            profile: {first_name: 'Maria', display_name: 'maria'},
          },
        },
      },
      llm: {defaultText: 'Hey, here is a suggestion.'},
    });
    const outcome = await dispatchSlackEvent(appMention as never, ctx);
    await Promise.allSettled(outcome.background ?? []);
    const post = ctx.slack._calls?.find((c) => c.method === 'chat.postMessage');
    expect(post).toBeDefined();
    expect((post?.args as {channel: string}).channel).toBe('C0GEN0001');
  });

  it('routes message.im to a direct response', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE0001: {
            id: 'UHIRE0001',
            profile: {first_name: 'Maria'},
          },
        },
      },
      llm: {defaultText: 'Try these channels: #engineering, #props.'},
    });
    const outcome = await dispatchSlackEvent(messageIm as never, ctx);
    await Promise.allSettled(outcome.background ?? []);
    const post = ctx.slack._calls?.find((c) => c.method === 'chat.postMessage');
    expect(post).toBeDefined();
    expect((post?.args as {channel: string}).channel).toBe('D0HIRE0001');
  });

  it('routes assistant_thread_started to setTitle + setSuggestedPrompts + chat.postMessage', async () => {
    const ctx = makeTestCtx({
      slack: {
        usersInfo: {
          UHIRE0001: {
            id: 'UHIRE0001',
            profile: {first_name: 'Hira', display_name: 'hira'},
          },
        },
      },
    });
    const outcome = await dispatchSlackEvent(
      assistantThreadStarted as never,
      ctx
    );
    await Promise.allSettled(outcome.background ?? []);
    const methods = (ctx.slack._calls ?? []).map((c) => c.method);
    expect(methods).toContain('assistant.threads.setTitle');
    expect(methods).toContain('assistant.threads.setSuggestedPrompts');
    expect(methods).toContain('chat.postMessage');
  });

  it('routes member_joined_channel without throwing', async () => {
    const ctx = makeTestCtx();
    const outcome = await dispatchSlackEvent(memberJoinedChannel as never, ctx);
    expect(outcome.body).toEqual({ok: true});
    await Promise.allSettled(outcome.background ?? []);
  });

  it('ignores unrecognized event types gracefully', async () => {
    const ctx = makeTestCtx();
    const outcome = await dispatchSlackEvent(
      {
        type: 'event_callback',
        event: {type: 'team_join', user: 'U1'},
      },
      ctx
    );
    expect(outcome.body).toEqual({ok: true});
    expect(ctx.slack._calls).toHaveLength(0);
  });
});
