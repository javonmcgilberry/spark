/**
 * Narrow SlackClient interface used across handlers, routes, and services.
 *
 * This is deliberately a smaller surface than @slack/web-api. We only
 * include the calls the Spark codebase actually makes, which keeps the
 * recording mock small and the Workers bundle lean.
 *
 * The production implementation uses fetch against https://slack.com/api
 * directly — no WebClient dependency, no Node-only surfaces. The
 * recording mock captures every call so tests can assert against them.
 */

import type {Logger} from '../logger';

export interface SlackUser {
  id?: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: SlackUserProfile;
}

export interface SlackUserProfile {
  real_name?: string;
  real_name_normalized?: string;
  display_name?: string;
  display_name_normalized?: string;
  first_name?: string;
  email?: string;
  title?: string;
  image_72?: string;
  image_192?: string;
  fields?: Record<string, SlackProfileFieldValue>;
}

export interface SlackProfileFieldValue {
  value?: string;
  alt?: string;
}

export interface SlackTeamProfileField {
  id?: string;
  label?: string;
}

export interface SlackConversation {
  id?: string;
  name?: string;
  is_private?: boolean;
  properties?: {canvas?: {canvas_id?: string}};
}

export interface SlackResponseMetadata {
  next_cursor?: string;
}

export interface ChatPostMessageArgs {
  channel: string;
  text?: string;
  blocks?: unknown[];
  thread_ts?: string;
  markdown_text?: string;
  metadata?: unknown;
}

export interface ChatPostMessageResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

export interface ViewsPublishArgs {
  user_id: string;
  view: unknown;
  hash?: string;
}

export interface ViewsPublishResponse {
  ok: boolean;
  error?: string;
}

export interface UsersInfoResponse {
  ok: boolean;
  user?: SlackUser;
  error?: string;
}

export interface UsersLookupByEmailResponse {
  ok: boolean;
  user?: SlackUser;
  error?: string;
}

export interface UsersProfileGetResponse {
  ok: boolean;
  profile?: SlackUserProfile;
  error?: string;
}

export interface TeamProfileGetResponse {
  ok: boolean;
  profile?: {fields?: SlackTeamProfileField[]};
  error?: string;
}

export interface UsersListResponse {
  ok: boolean;
  members?: SlackUser[];
  response_metadata?: SlackResponseMetadata;
  error?: string;
}

export interface UsersConversationsResponse {
  ok: boolean;
  channels?: SlackConversation[];
  response_metadata?: SlackResponseMetadata;
  error?: string;
}

export interface ConversationsRepliesResponse {
  ok: boolean;
  messages?: Array<{
    text?: string;
    user?: string;
    bot_id?: string;
    ts?: string;
  }>;
  error?: string;
}

export interface ConversationsCreateResponse {
  ok: boolean;
  channel?: SlackConversation;
  error?: string;
}

export interface ConversationsInviteResponse {
  ok: boolean;
  channel?: SlackConversation;
  error?: string;
}

export interface ConversationsInfoResponse {
  ok: boolean;
  channel?: SlackConversation;
  error?: string;
}

export interface AssistantThreadsSetArgs {
  channel_id: string;
  thread_ts: string;
  status?: string;
  title?: string;
  prompts?: Array<{title: string; message: string}>;
}

export interface SlackCall {
  method: string;
  args: Record<string, unknown>;
  at: number;
}

export interface SlackClient {
  chat: {
    postMessage(args: ChatPostMessageArgs): Promise<ChatPostMessageResponse>;
  };
  views: {
    publish(args: ViewsPublishArgs): Promise<ViewsPublishResponse>;
  };
  users: {
    info(args: {user: string}): Promise<UsersInfoResponse>;
    lookupByEmail(args: {email: string}): Promise<UsersLookupByEmailResponse>;
    list(args?: {limit?: number; cursor?: string}): Promise<UsersListResponse>;
    conversations(args: {
      user: string;
      types?: string;
      limit?: number;
      exclude_archived?: boolean;
      cursor?: string;
    }): Promise<UsersConversationsResponse>;
    profile: {
      get(args: {user: string}): Promise<UsersProfileGetResponse>;
    };
  };
  team: {
    profile: {
      get(): Promise<TeamProfileGetResponse>;
    };
  };
  conversations: {
    create(args: {
      name: string;
      is_private?: boolean;
    }): Promise<ConversationsCreateResponse>;
    invite(args: {
      channel: string;
      users: string;
    }): Promise<ConversationsInviteResponse>;
    info(args: {
      channel: string;
      include_num_members?: boolean;
    }): Promise<ConversationsInfoResponse>;
    replies(args: {
      channel: string;
      ts: string;
      oldest?: string;
      limit?: number;
    }): Promise<ConversationsRepliesResponse>;
  };
  assistant: {
    threads: {
      setStatus(args: AssistantThreadsSetArgs): Promise<{ok: boolean}>;
      setTitle(args: AssistantThreadsSetArgs): Promise<{ok: boolean}>;
      setSuggestedPrompts(
        args: AssistantThreadsSetArgs
      ): Promise<{ok: boolean}>;
    };
  };
  /**
   * Opaque call-through for less-used endpoints like canvases.*.
   * Returns raw JSON; the caller is responsible for typing.
   */
  apiCall<T = unknown>(
    method: string,
    args?: Record<string, unknown>
  ): Promise<T>;
  /**
   * Test-only: inspect recorded calls. Only present on the recording
   * mock — production returns undefined.
   */
  _calls?: SlackCall[];
}

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * Build a production Slack client backed by fetch. No @slack/web-api
 * dependency — Workers-compatible, smaller bundle, fully typed surface.
 */
export function makeSlackWebClient(token: string, logger: Logger): SlackClient {
  const call = async <T = unknown>(
    method: string,
    args: object = {}
  ): Promise<T> => {
    const url = `${SLACK_API_BASE}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(args),
    });
    const json = (await res.json()) as {ok?: boolean; error?: string} & T;
    if (!json.ok) {
      logger.warn(
        `Slack API ${method} failed: ${json.error ?? res.statusText}`
      );
    }
    return json as T;
  };

  return {
    chat: {
      postMessage: (args) =>
        call<ChatPostMessageResponse>('chat.postMessage', args),
    },
    views: {
      publish: (args) => call<ViewsPublishResponse>('views.publish', args),
    },
    users: {
      info: (args) => call<UsersInfoResponse>('users.info', args),
      lookupByEmail: (args) =>
        call<UsersLookupByEmailResponse>('users.lookupByEmail', args),
      list: (args) => call<UsersListResponse>('users.list', args ?? {}),
      conversations: (args) =>
        call<UsersConversationsResponse>('users.conversations', args),
      profile: {
        get: (args) => call<UsersProfileGetResponse>('users.profile.get', args),
      },
    },
    team: {
      profile: {
        get: () => call<TeamProfileGetResponse>('team.profile.get'),
      },
    },
    conversations: {
      create: (args) =>
        call<ConversationsCreateResponse>('conversations.create', args),
      invite: (args) =>
        call<ConversationsInviteResponse>('conversations.invite', args),
      info: (args) =>
        call<ConversationsInfoResponse>('conversations.info', args),
      replies: (args) =>
        call<ConversationsRepliesResponse>('conversations.replies', args),
    },
    assistant: {
      threads: {
        setStatus: (args) => call('assistant.threads.setStatus', args),
        setTitle: (args) => call('assistant.threads.setTitle', args),
        setSuggestedPrompts: (args) =>
          call('assistant.threads.setSuggestedPrompts', args),
      },
    },
    apiCall: <T>(method: string, args?: Record<string, unknown>) =>
      call<T>(method, args ?? {}),
  };
}

/**
 * Recording mock used by tests and by the /dev/slack-sandbox page.
 *
 * Every method appends to `calls` and returns a canned-but-plausible
 * response. Tests can seed specific lookups via `overrides` to simulate
 * real Slack replies without hitting the network.
 */
export interface RecordingSlackOverrides {
  usersInfo?: Record<string, SlackUser>;
  usersLookupByEmail?: Record<string, SlackUser>;
  usersProfileGet?: Record<string, SlackUserProfile>;
  usersList?: SlackUser[];
  teamProfileFields?: SlackTeamProfileField[];
  conversationsReplies?: Record<
    string,
    NonNullable<ConversationsRepliesResponse['messages']>
  >;
}

export function makeRecordingSlackClient(
  overrides: RecordingSlackOverrides = {}
): SlackClient {
  const calls: SlackCall[] = [];
  const record = <T>(method: string, args: object, result: T): T => {
    calls.push({
      method,
      args: args as Record<string, unknown>,
      at: Date.now(),
    });
    return result;
  };

  return {
    _calls: calls,
    chat: {
      postMessage: async (args) =>
        record('chat.postMessage', args as unknown as Record<string, unknown>, {
          ok: true,
          channel: args.channel,
          ts: `${Date.now() / 1000}`,
        }),
    },
    views: {
      publish: async (args) =>
        record('views.publish', args as unknown as Record<string, unknown>, {
          ok: true,
        }),
    },
    users: {
      info: async (args) => {
        const user = overrides.usersInfo?.[args.user];
        return record('users.info', args, {
          ok: Boolean(user),
          user,
        });
      },
      lookupByEmail: async (args) => {
        const user = overrides.usersLookupByEmail?.[args.email.toLowerCase()];
        return record('users.lookupByEmail', args, {
          ok: Boolean(user),
          user,
        });
      },
      list: async (args) =>
        record('users.list', (args ?? {}) as Record<string, unknown>, {
          ok: true,
          members: overrides.usersList ?? [],
        }),
      conversations: async (args) =>
        record('users.conversations', args, {
          ok: true,
          channels: [],
        }),
      profile: {
        get: async (args) => {
          const profile = overrides.usersProfileGet?.[args.user];
          return record('users.profile.get', args, {
            ok: true,
            profile: profile ?? {},
          });
        },
      },
    },
    team: {
      profile: {
        get: async () =>
          record(
            'team.profile.get',
            {},
            {
              ok: true,
              profile: {fields: overrides.teamProfileFields ?? []},
            }
          ),
      },
    },
    conversations: {
      create: async (args) =>
        record('conversations.create', args, {
          ok: true,
          channel: {
            id: `C_TEST_${args.name}`,
            name: args.name,
            is_private: args.is_private,
          },
        }),
      invite: async (args) =>
        record('conversations.invite', args, {
          ok: true,
          channel: {id: args.channel},
        }),
      info: async (args) =>
        record('conversations.info', args, {
          ok: true,
          channel: {id: args.channel},
        }),
      replies: async (args) => {
        const messages = overrides.conversationsReplies?.[args.ts] ?? [];
        return record('conversations.replies', args, {
          ok: true,
          messages,
        });
      },
    },
    assistant: {
      threads: {
        setStatus: async (args) =>
          record(
            'assistant.threads.setStatus',
            args as unknown as Record<string, unknown>,
            {ok: true}
          ),
        setTitle: async (args) =>
          record(
            'assistant.threads.setTitle',
            args as unknown as Record<string, unknown>,
            {ok: true}
          ),
        setSuggestedPrompts: async (args) =>
          record(
            'assistant.threads.setSuggestedPrompts',
            args as unknown as Record<string, unknown>,
            {ok: true}
          ),
      },
    },
    apiCall: async <T>(method: string, args?: Record<string, unknown>) =>
      record(method, args ?? {}, {ok: true} as unknown as T),
  };
}
