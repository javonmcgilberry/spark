import type {App} from '@slack/bolt';
import {describe, expect, it, vi} from 'vitest';
import {registerBuddyHandlers} from '../../src/slack/handlers/buddy.js';
import {SPARK_BUDDY_MARK_CHECKIN_ACTION_ID} from '../../src/slack/workflowUi.js';
import {createFakeSlackClient} from '../helpers/createFakeSlackClient.js';
import {createTestServices} from '../helpers/createTestServices.js';

describe('Buddy check-in handler', () => {
  it('records the check-in and posts a confirmation DM when the mark-as-checked-in button is clicked', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerBuddyHandlers(app.app, services);
    const buddyUserId = 'U_BUDDY_ACTION';
    const hireUserId = profile.userId;

    expect(services.journey.getBuddyCheckinDue(buddyUserId, hireUserId)).toBe(
      true,
    );

    const ack = vi.fn(async () => undefined);
    await app.invokeAction(SPARK_BUDDY_MARK_CHECKIN_ACTION_ID, {
      ack,
      body: { user: {id: buddyUserId} },
      client: slack.client,
      action: {
        type: 'button',
        action_id: SPARK_BUDDY_MARK_CHECKIN_ACTION_ID,
        value: hireUserId,
      },
    });

    expect(ack).toHaveBeenCalledOnce();

    const buddyState = services.journey.getState(buddyUserId);
    expect(buddyState.buddyCheckIns[hireUserId]?.lastCheckinAt).toBeDefined();
    expect(services.journey.getBuddyCheckinDue(buddyUserId, hireUserId)).toBe(
      false,
    );

    const confirmation = slack.calls.chatPostMessage.find(
      (call) => call.channel === buddyUserId,
    );
    expect(confirmation).toBeDefined();
    expect(typeof confirmation?.text).toBe('string');
    expect(String(confirmation?.text)).toMatch(/Logged/);
  });

  it('does nothing and does not record a check-in when the action has no value', async () => {
    const {services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerBuddyHandlers(app.app, services);
    const buddyUserId = 'U_BUDDY_NO_VALUE';

    const ack = vi.fn(async () => undefined);
    await app.invokeAction(SPARK_BUDDY_MARK_CHECKIN_ACTION_ID, {
      ack,
      body: { user: {id: buddyUserId} },
      client: slack.client,
      action: {
        type: 'button',
        action_id: SPARK_BUDDY_MARK_CHECKIN_ACTION_ID,
      },
    });

    expect(ack).toHaveBeenCalledOnce();
    const state = services.journey.getState(buddyUserId);
    expect(state.buddyCheckIns).toEqual({});
    expect(slack.calls.chatPostMessage).toHaveLength(0);
  });
});

function createFakeBoltApp(client: App['client']) {
  type Handler = (payload: unknown) => Promise<unknown>;
  type RegisteredAction = {id: string | RegExp; handler: Handler};

  const actionHandlers: RegisteredAction[] = [];
  const messageHandlers: Handler[] = [];

  const app = {
    client,
    action(id: string | RegExp, handler: Handler) {
      actionHandlers.push({id, handler});
    },
    message(handler: Handler) {
      messageHandlers.push(handler);
    },
  } as unknown as App;

  return {
    app,
    async invokeAction(id: string, payload: unknown) {
      const registered = actionHandlers.find(({id: matcher}) =>
        typeof matcher === 'string' ? matcher === id : matcher.test(id),
      );
      if (!registered) {
        throw new Error(`No action handler registered for ${id}`);
      }
      return registered.handler(payload);
    },
  };
}
