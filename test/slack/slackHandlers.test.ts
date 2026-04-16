import type {App} from '@slack/bolt';
import {ErrorCode} from '@slack/web-api';
import {describe, expect, it, vi} from 'vitest';
import {
  HOME_CHECKLIST_ACTION_ID,
  HOME_NAV_ACTION_ID,
  HOME_TOOL_ACCESS_ACTION_ID,
} from '../../src/onboarding/homeBlocks.js';
import {HOME_SECTION_IDS} from '../../src/onboarding/types.js';
import {registerActionHandlers} from '../../src/slack/handlers/actions.js';
import {registerCommandHandlers} from '../../src/slack/handlers/commands.js';
import {registerHomeTabHandlers} from '../../src/slack/handlers/homeTab.js';
import {
  SPARK_ADD_CHECKLIST_ITEM_CALLBACK_ID,
  SPARK_CREATE_DRAFT_CALLBACK_ID,
  SPARK_EDIT_DRAFT_CALLBACK_ID,
  SPARK_OPEN_CELEBRATION_SHARE_MODAL_ACTION_ID,
  SPARK_OPEN_ADD_CHECKLIST_ITEM_MODAL_ACTION_ID,
  SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID,
  SPARK_PUBLISH_DRAFT_ACTION_ID,
  SPARK_SHARE_CELEBRATION_CALLBACK_ID,
} from '../../src/slack/workflowUi.js';
import {collectTextContent} from '../helpers/collectTextContent.js';
import {createFakeSlackClient} from '../helpers/createFakeSlackClient.js';
import {createTestServices} from '../helpers/createTestServices.js';

describe('Slack handlers', () => {
  it('routes /spark to a direct modal or the default ephemeral menu', async () => {
    const {services, profile} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerCommandHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;

    const ackWithMention = vi.fn(async () => undefined);
    const respondWithMention = vi.fn(async () => undefined);
    await app.invokeCommand('/spark', {
      command: {
        user_id: managerUserId,
        channel_id: 'C_TEAM',
        trigger_id: 'TRIGGER_DIRECT',
        text: `<@${profile.userId}>`,
      },
      ack: ackWithMention,
      respond: respondWithMention,
      client: slack.client,
    });

    expect(ackWithMention).toHaveBeenCalledOnce();
    expect(respondWithMention).not.toHaveBeenCalled();
    expect(slack.calls.viewsOpen).toHaveLength(1);
    expect(slack.calls.viewsOpen[0].view).toMatchObject({
      callback_id: SPARK_CREATE_DRAFT_CALLBACK_ID,
    });

    const ackDefault = vi.fn(async () => undefined);
    const respondDefault = vi.fn(async () => undefined);
    await app.invokeCommand('/spark', {
      command: {
        user_id: managerUserId,
        channel_id: 'C_TEAM',
        trigger_id: 'TRIGGER_MENU',
        text: '',
      },
      ack: ackDefault,
      respond: respondDefault,
      client: slack.client,
    });

    expect(ackDefault).toHaveBeenCalledOnce();
    expect(respondDefault).toHaveBeenCalledOnce();
    const defaultResponse = getFirstMockArgument(respondDefault);
    expect(defaultResponse).toMatchObject({
      response_type: 'ephemeral',
    });
    expect(collectTextContent(defaultResponse.blocks)).toContain(
      'Create draft'
    );
  });

  it('reports publish failures to the acting user', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerActionHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;
    const buddyUserId = profile.buddy.slackUserId!;

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
    });

    const notManagerAck = vi.fn(async () => undefined);
    await app.invokeAction(SPARK_PUBLISH_DRAFT_ACTION_ID, {
      ack: notManagerAck,
      body: {
        user: {id: buddyUserId},
        channel: {id: 'C_REVIEW'},
      },
      client: slack.client,
      action: {
        type: 'button',
        value: profile.userId,
      },
    });

    expect(notManagerAck).toHaveBeenCalledOnce();
    expect(slack.calls.chatPostMessage).toHaveLength(1);
    expect(slack.calls.chatPostMessage[0]).toMatchObject({
      channel: buddyUserId,
      text: "Only the new hire's manager can publish this onboarding plan.",
    });
    expect(slack.calls.viewsPublish).toHaveLength(0);

    const missing = createTestServices();
    const missingSlack = createFakeSlackClient();
    const missingApp = createFakeBoltApp(missingSlack.client);
    registerActionHandlers(missingApp.app, missing.services);
    const missingManagerUserId = missing.profile.manager.slackUserId!;
    const notFoundAck = vi.fn(async () => undefined);

    await missingApp.invokeAction(SPARK_PUBLISH_DRAFT_ACTION_ID, {
      ack: notFoundAck,
      body: {
        user: {id: missingManagerUserId},
        channel: {id: 'C_REVIEW'},
      },
      client: missingSlack.client,
      action: {
        type: 'button',
        value: missing.profile.userId,
      },
    });

    expect(notFoundAck).toHaveBeenCalledOnce();
    expect(missingSlack.calls.chatPostMessage).toHaveLength(1);
    expect(missingSlack.calls.chatPostMessage[0]).toMatchObject({
      channel: missingManagerUserId,
      text: "Spark couldn't find that onboarding draft anymore.",
    });
    expect(missingSlack.calls.viewsPublish).toHaveLength(0);
  });

  it('creates, edits, and publishes drafts through Slack actions', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerActionHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;
    const buddyUserId = profile.buddy.slackUserId!;
    const reviewerUserId = 'UREV123';
    const pmUserId = profile.teammates[0].slackUserId!;
    const designerUserId = profile.teammates[1].slackUserId!;

    await app.invokeView(SPARK_CREATE_DRAFT_CALLBACK_ID, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: managerUserId}},
      view: {
        state: {
          values: {
            new_hire: {
              selected_user: {selected_user: profile.userId},
            },
            buddy: {
              selected_user: {selected_user: buddyUserId},
            },
            stakeholders: {
              selected_users: {selected_users: [pmUserId]},
            },
            welcome_note: {
              value: {value: 'Welcome aboard'},
            },
          },
        },
      },
      client: slack.client,
    });

    const createdPackage = services.onboardingPackages.getPackageForUser(
      profile.userId
    );
    expect(createdPackage?.status).toBe('draft');
    expect(createdPackage?.draftChannelId).toMatch(/^C/);
    expect(slack.calls.chatPostMessage).toHaveLength(2);
    expect(slack.calls.chatPostMessage[0].channel).toBe(
      createdPackage?.draftChannelId
    );
    expect(slack.calls.chatPostMessage[1].channel).toBe(managerUserId);

    await app.invokeAction(SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID, {
      ack: vi.fn(async () => undefined),
      body: {trigger_id: 'TRIGGER_EDIT'},
      client: slack.client,
      action: {
        type: 'button',
        value: profile.userId,
      },
    });

    expect(slack.calls.viewsOpen.at(-1)?.view).toMatchObject({
      callback_id: SPARK_EDIT_DRAFT_CALLBACK_ID,
      private_metadata: profile.userId,
    });

    await app.invokeView(SPARK_EDIT_DRAFT_CALLBACK_ID, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: managerUserId}},
      view: {
        private_metadata: profile.userId,
        state: {
          values: {
            buddy: {
              selected_user: {selected_user: reviewerUserId},
            },
            stakeholders: {
              selected_users: {selected_users: [pmUserId, designerUserId]},
            },
            welcome_note: {
              value: {value: 'Updated note'},
            },
          },
        },
      },
      client: slack.client,
    });

    const updatedPackage = services.onboardingPackages.getPackageForUser(
      profile.userId
    );
    expect(updatedPackage?.welcomeNote).toBe('Updated note');
    expect(updatedPackage?.buddyUserId).toBe(reviewerUserId);
    expect(updatedPackage?.reviewerUserIds).toEqual(
      expect.arrayContaining([
        managerUserId,
        reviewerUserId,
        pmUserId,
        designerUserId,
      ])
    );

    await app.invokeAction(SPARK_PUBLISH_DRAFT_ACTION_ID, {
      ack: vi.fn(async () => undefined),
      body: {
        user: {id: managerUserId},
        channel: {id: 'C_REVIEW'},
      },
      client: slack.client,
      action: {
        type: 'button',
        value: profile.userId,
      },
    });

    const publishedPackage = services.onboardingPackages.getPackageForUser(
      profile.userId
    );
    expect(publishedPackage?.status).toBe('published');
    expect(slack.calls.viewsPublish).toHaveLength(1);
    expect(
      slack.calls.chatPostMessage.some(
        (call) =>
          call.channel === profile.userId &&
          typeof call.text === 'string' &&
          call.text.includes('Welcome to Webflow')
      )
    ).toBe(true);
    expect(
      slack.calls.chatPostMessage.some(
        (call) =>
          call.channel === 'C_REVIEW' &&
          call.text === `Spark onboarding is live for <@${profile.userId}>.`
      )
    ).toBe(true);
  });

  it('adds custom checklist items through the draft modal flow', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerActionHandlers(app.app, services);
    registerHomeTabHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
      slackClient: slack.client,
    });

    await app.invokeAction(SPARK_OPEN_ADD_CHECKLIST_ITEM_MODAL_ACTION_ID, {
      ack: vi.fn(async () => undefined),
      body: {trigger_id: 'TRIGGER_ADD'},
      client: slack.client,
      action: {
        type: 'button',
        value: profile.userId,
      },
    });

    expect(slack.calls.viewsPush.at(-1)?.view).toMatchObject({
      callback_id: SPARK_ADD_CHECKLIST_ITEM_CALLBACK_ID,
      private_metadata: profile.userId,
    });

    await app.invokeView(SPARK_ADD_CHECKLIST_ITEM_CALLBACK_ID, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: managerUserId}},
      view: {
        private_metadata: profile.userId,
        state: {
          values: {
            item_label: {
              value: {value: 'Review launch checklist'},
            },
            item_kind: {
              selected_kind: {
                selected_option: {value: 'reading'},
              },
            },
            item_section: {
              selected_section: {
                selected_option: {value: 'week2-workflows'},
              },
            },
            item_notes: {
              value: {value: 'Skim the launch docs before sprint planning.'},
            },
            item_resource_url: {
              value: {value: 'docs.webflow.com/launch-checklist'},
            },
          },
        },
      },
      client: slack.client,
    });

    const pkg = services.onboardingPackages.getPackageForUser(profile.userId);
    expect(pkg?.customChecklistItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Review launch checklist',
          kind: 'reading',
          sectionId: 'week2-workflows',
          resourceUrl: 'https://docs.webflow.com/launch-checklist',
        }),
      ])
    );

    services.onboardingPackages.publishPackage(profile.userId, managerUserId);

    await app.invokeEvent('app_home_opened', {
      event: {
        tab: 'home',
        user: profile.userId,
      },
      client: slack.client,
    });

    await app.invokeAction(`${HOME_NAV_ACTION_ID}:onboarding-checklist`, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: profile.userId}},
      client: slack.client,
      action: {
        type: 'button',
        value: 'onboarding-checklist',
      },
    });

    expect(collectViewText(slack.calls.viewsPublish.at(-1))).toContain(
      'Review launch checklist'
    );
  });

  it('opens the celebration share modal and reports private-channel posting errors', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerActionHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;

    await app.invokeAction(SPARK_OPEN_CELEBRATION_SHARE_MODAL_ACTION_ID, {
      ack: vi.fn(async () => undefined),
      body: {trigger_id: 'TRIGGER_SHARE'},
      client: slack.client,
      action: {
        type: 'button',
        value: profile.userId,
      },
    });

    expect(slack.calls.viewsOpen.at(-1)?.view).toMatchObject({
      callback_id: SPARK_SHARE_CELEBRATION_CALLBACK_ID,
      private_metadata: profile.userId,
    });

    await app.invokeView(SPARK_SHARE_CELEBRATION_CALLBACK_ID, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: managerUserId}},
      view: {
        private_metadata: profile.userId,
        state: {
          values: {
            share_destination: {
              selected_conversation: {
                selected_conversation: 'C_CELEBRATE',
              },
            },
          },
        },
      },
      client: slack.client,
    });

    expect(
      slack.calls.chatPostMessage.some(
        (call) =>
          call.channel === 'C_CELEBRATE' &&
          typeof call.text === 'string' &&
          call.text.includes(profile.displayName)
      )
    ).toBe(true);
    expect(slack.calls.chatPostMessage.at(-1)).toMatchObject({
      channel: managerUserId,
      text: `Shared ${profile.displayName}'s milestone in <#C_CELEBRATE>.`,
    });

    slack.setChatPostMessageError('C_PRIVATE', {
      code: ErrorCode.PlatformError,
      data: {error: 'not_in_channel'},
    });

    await app.invokeView(SPARK_SHARE_CELEBRATION_CALLBACK_ID, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: managerUserId}},
      view: {
        private_metadata: profile.userId,
        state: {
          values: {
            share_destination: {
              selected_conversation: {
                selected_conversation: 'C_PRIVATE',
              },
            },
          },
        },
      },
      client: slack.client,
    });

    expect(slack.calls.chatPostMessage.at(-1)).toMatchObject({
      channel: managerUserId,
      text: expect.stringContaining('invite Spark first'),
    });
  });

  it('publishes pending reviewer Home with draft review details', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerHomeTabHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;

    const draft = await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
      welcomeNote: 'Needs one more review',
      slackClient: slack.client,
    });

    await app.invokeEvent('app_home_opened', {
      event: {
        tab: 'home',
        user: managerUserId,
      },
      client: slack.client,
    });

    expect(slack.calls.viewsPublish).toHaveLength(1);
    expect(slack.calls.viewsPublish[0].user_id).toBe(managerUserId);
    const viewText = collectViewText(slack.calls.viewsPublish[0]);
    expect(viewText).toContain(
      'These onboarding drafts still need a final review'
    );
    expect(viewText).toContain('Edit draft details');
    expect(viewText).toContain(`Draft channel: #${draft.draftChannelName}`);
  });

  it('publishes Home and syncs checklist changes', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerHomeTabHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
      welcomeNote: 'Published from test',
      slackClient: slack.client,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);

    await app.invokeEvent('app_home_opened', {
      event: {
        tab: 'home',
        user: profile.userId,
      },
      client: slack.client,
    });

    expect(slack.calls.viewsPublish).toHaveLength(1);
    expect(collectViewText(slack.calls.viewsPublish[0])).toContain(
      'Spark onboarding'
    );
    expect(collectViewBlocks(slack.calls.viewsPublish[0]).length).toBeLessThan(
      100
    );

    for (const sectionId of HOME_SECTION_IDS) {
      await app.invokeAction(`${HOME_NAV_ACTION_ID}:${sectionId}`, {
        ack: vi.fn(async () => undefined),
        body: {user: {id: profile.userId}},
        client: slack.client,
        action: {
          type: 'button',
          value: sectionId,
        },
      });

      expect(
        collectViewBlocks(slack.calls.viewsPublish.at(-1)).length
      ).toBeLessThan(100);
    }

    await app.invokeAction(`${HOME_NAV_ACTION_ID}:resources`, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: profile.userId}},
      client: slack.client,
      action: {
        type: 'button',
        value: 'resources',
      },
    });
    const resourcesText = collectViewText(slack.calls.viewsPublish.at(-1));
    expect(resourcesText).toContain('Tools access');
    expect(resourcesText).toContain('Slack channels');
    expect(resourcesText).toContain('Rituals');
    expect(resourcesText).toContain('Engineering resource library');
    expect(resourcesText).toContain('github.com/webflow/webflow');

    const firstChecklistSection = services.onboardingPackages.getPackageForUser(
      profile.userId
    )?.sections.onboardingChecklist.sections[0];
    if (!firstChecklistSection) {
      throw new Error(
        'Expected a published checklist section for the Home test'
      );
    }

    await app.invokeAction(`${HOME_NAV_ACTION_ID}:onboarding-checklist`, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: profile.userId}},
      client: slack.client,
      action: {
        type: 'button',
        value: 'onboarding-checklist',
      },
    });

    await app.invokeAction(
      `${HOME_CHECKLIST_ACTION_ID}:${firstChecklistSection.id}:0`,
      {
        ack: vi.fn(async () => undefined),
        body: {user: {id: profile.userId}},
        client: slack.client,
        action: {
          type: 'static_select',
          action_id: `${HOME_CHECKLIST_ACTION_ID}:${firstChecklistSection.id}:0`,
          selected_option: {value: 'completed'},
        },
      }
    );

    expect(collectViewText(slack.calls.viewsPublish.at(-1))).toContain('1/');
    expect(
      collectViewBlocks(slack.calls.viewsPublish.at(-1)).length
    ).toBeLessThan(100);
    expect(
      getSectionAccessoryInitialValue(
        slack.calls.viewsPublish.at(-1),
        `${HOME_CHECKLIST_ACTION_ID}:${firstChecklistSection.id}:0`
      )
    ).toBe('completed');
    expect(slack.calls.canvasesEdit.length).toBeGreaterThan(0);
  });

  it('persists tool-access checkboxes when toggled on the Resources tab', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerHomeTabHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
      slackClient: slack.client,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);

    await app.invokeEvent('app_home_opened', {
      event: {tab: 'home', user: profile.userId},
      client: slack.client,
    });

    await app.invokeAction(`${HOME_NAV_ACTION_ID}:resources`, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: profile.userId}},
      client: slack.client,
      action: {type: 'button', value: 'resources'},
    });

    const generalChunkActionId = `${HOME_TOOL_ACCESS_ACTION_ID}:general:0`;
    await app.invokeAction(generalChunkActionId, {
      ack: vi.fn(async () => undefined),
      body: {user: {id: profile.userId}},
      client: slack.client,
      action: {
        type: 'checkboxes',
        action_id: generalChunkActionId,
        selected_options: [{value: 'general::okta'}, {value: 'general::slack'}],
      },
    });

    const selected = getCheckboxInitialValues(
      slack.calls.viewsPublish.at(-1),
      generalChunkActionId
    );
    expect(selected).toEqual(
      expect.arrayContaining(['general::okta', 'general::slack'])
    );
  });

  it('routes welcome actions into guided step and people replies', async () => {
    const {profile, services} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerActionHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
      slackClient: slack.client,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);

    const stepAck = vi.fn(async () => undefined);
    await app.invokeAction('spark_go_to_step', {
      ack: stepAck,
      body: {
        user: {id: profile.userId},
        channel: {id: 'D_SPARK'},
        message: {ts: '1717.010'},
      },
      client: slack.client,
      action: {
        type: 'button',
        value: 'day2-3-follow-up',
      },
    });

    expect(stepAck).toHaveBeenCalledOnce();
    expect(slack.calls.chatPostMessage.at(-1)).toMatchObject({
      channel: 'D_SPARK',
      thread_ts: '1717.010',
    });
    expect(String(slack.calls.chatPostMessage.at(-1)?.text ?? '')).toContain(
      'day 2-3'
    );
    expect(slack.calls.canvasesEdit.length).toBeGreaterThan(0);

    const peopleAck = vi.fn(async () => undefined);
    await app.invokeAction('spark_show_people', {
      ack: peopleAck,
      body: {
        user: {id: profile.userId},
        channel: {id: 'D_SPARK'},
        message: {ts: '1717.011'},
      },
      client: slack.client,
    });

    expect(peopleAck).toHaveBeenCalledOnce();
    expect(slack.calls.chatPostMessage.at(-1)).toMatchObject({
      channel: 'D_SPARK',
      thread_ts: '1717.011',
    });
    expect(
      collectTextContent(slack.calls.chatPostMessage.at(-1)?.blocks)
    ).toContain('People to meet');
  });

  it('posts task previews, contribution steps, and celebration DMs', async () => {
    const {profile, services, tasks} = createTestServices();
    const slack = createFakeSlackClient();
    const app = createFakeBoltApp(slack.client);
    registerActionHandlers(app.app, services);
    const managerUserId = profile.manager.slackUserId!;
    const buddyUserId = profile.buddy.slackUserId!;

    await services.onboardingPackages.createDraftPackage({
      profile,
      createdByUserId: managerUserId,
      slackClient: slack.client,
    });
    services.onboardingPackages.publishPackage(profile.userId, managerUserId);
    await services.journey.advance(profile, 'contribution-milestone');

    await app.invokeAction('spark_select_task', {
      ack: vi.fn(async () => undefined),
      body: {
        user: {id: profile.userId},
        channel: {id: 'D_SPARK'},
        message: {ts: '1717.001'},
      },
      client: slack.client,
      action: {
        type: 'static_select',
        selected_option: {
          value: tasks[0].id,
        },
      },
    });

    expect(slack.calls.chatPostMessage.at(-1)).toMatchObject({
      channel: 'D_SPARK',
      thread_ts: '1717.001',
      text: expect.stringContaining(tasks[0].title),
    });

    const messageCountBeforeConfirm = slack.calls.chatPostMessage.length;
    await app.invokeAction('spark_confirm_pr', {
      ack: vi.fn(async () => undefined),
      body: {
        user: {id: profile.userId},
        channel: {id: 'D_SPARK'},
        message: {ts: '1717.001'},
      },
      client: slack.client,
    });

    expect(slack.calls.reactionsAdd).toHaveLength(1);
    expect(slack.calls.chatPostMessage.length).toBeGreaterThan(
      messageCountBeforeConfirm
    );
    expect(
      slack.calls.chatPostMessage.filter(
        (call) => call.channel === managerUserId || call.channel === buddyUserId
      )
    ).toHaveLength(2);
  });
});

function createFakeBoltApp(client: App['client']) {
  type Handler = (payload: unknown) => Promise<unknown>;
  type RegisteredAction = {
    id: string | RegExp;
    handler: Handler;
  };

  const commandHandlers = new Map<string, Handler>();
  const actionHandlers: RegisteredAction[] = [];
  const eventHandlers = new Map<string, Handler>();
  const viewHandlers = new Map<string, Handler>();

  const app = {
    client,
    action(id: string | RegExp, handler: Handler) {
      actionHandlers.push({id, handler});
    },
    command(id: string, handler: Handler) {
      commandHandlers.set(id, handler);
    },
    event(id: string, handler: Handler) {
      eventHandlers.set(id, handler);
    },
    message() {},
    view(id: string, handler: Handler) {
      viewHandlers.set(id, handler);
    },
  } as App;

  return {
    app,
    async invokeAction(id: string, payload: unknown) {
      const registered = actionHandlers.find(({id: matcher}) =>
        typeof matcher === 'string' ? matcher === id : matcher.test(id)
      );
      const handler = registered?.handler;
      if (!handler) {
        throw new Error(
          `No action handler registered for ${id}. Registered: ${actionHandlers
            .map(({id: matcher}) => matcher.toString())
            .join(', ')}`
        );
      }
      return handler(payload);
    },
    async invokeCommand(id: string, payload: unknown) {
      const handler = commandHandlers.get(id);
      if (!handler) {
        throw new Error(`No command handler registered for ${id}`);
      }
      return handler(payload);
    },
    async invokeEvent(id: string, payload: unknown) {
      const handler = eventHandlers.get(id);
      if (!handler) {
        throw new Error(`No event handler registered for ${id}`);
      }
      return handler(payload);
    },
    async invokeView(id: string, payload: unknown) {
      const handler = viewHandlers.get(id);
      if (!handler) {
        throw new Error(`No view handler registered for ${id}`);
      }
      return handler(payload);
    },
  };
}

function getFirstMockArgument(
  mockFn: ReturnType<typeof vi.fn>
): Record<string, unknown> {
  const firstCall = mockFn.mock.calls.at(0);
  const firstArg = firstCall?.[0];
  if (!isRecord(firstArg)) {
    throw new Error('Expected the mock function to be called with an object.');
  }

  return firstArg;
}

function collectViewText(
  publishCall: Record<string, unknown> | undefined
): string {
  const view = isRecord(publishCall?.view) ? publishCall.view : undefined;

  return collectTextContent(view?.blocks ?? []);
}

function collectViewBlocks(
  publishCall: Record<string, unknown> | undefined
): Record<string, unknown>[] {
  const view = isRecord(publishCall?.view) ? publishCall.view : undefined;
  return Array.isArray(view?.blocks) ? view.blocks.filter(isRecord) : [];
}

function getSectionAccessoryInitialValue(
  publishCall: Record<string, unknown> | undefined,
  actionId: string
): string | undefined {
  const targetBlock = collectViewBlocks(publishCall).find((block) => {
    const accessory = isRecord(block.accessory) ? block.accessory : undefined;
    return accessory?.action_id === actionId;
  });
  const accessory = isRecord(targetBlock?.accessory)
    ? targetBlock.accessory
    : undefined;
  const initialOption = isRecord(accessory?.initial_option)
    ? accessory.initial_option
    : undefined;
  return typeof initialOption?.value === 'string'
    ? initialOption.value
    : undefined;
}

function getCheckboxInitialValues(
  publishCall: Record<string, unknown> | undefined,
  actionId: string
): string[] {
  for (const block of collectViewBlocks(publishCall)) {
    const elements = Array.isArray(block.elements) ? block.elements : [];
    for (const element of elements) {
      if (!isRecord(element)) {
        continue;
      }
      if (element.action_id !== actionId || element.type !== 'checkboxes') {
        continue;
      }
      const initial = Array.isArray(element.initial_options)
        ? element.initial_options
        : [];
      return initial
        .map((option) =>
          isRecord(option) && typeof option.value === 'string'
            ? option.value
            : undefined
        )
        .filter((value): value is string => Boolean(value));
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
