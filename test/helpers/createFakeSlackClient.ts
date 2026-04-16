import type {App} from '@slack/bolt';

interface FakeSlackUser {
  id: string;
  real_name: string;
  profile: {
    real_name: string;
    display_name: string;
    title: string;
    email: string;
    image_192: string;
    image_72: string;
  };
}

interface CanvasState {
  sectionIdsByTitle: Map<string, string>;
  titlesBySectionId: Map<string, string>;
}

export interface FakeSlackClientController {
  client: App['client'];
  calls: {
    authTest: Array<Record<string, never>>;
    canvasesEdit: Array<Record<string, unknown>>;
    canvasesSectionsLookup: Array<Record<string, unknown>>;
    chatPostMessage: Array<Record<string, unknown>>;
    conversationsCanvasesCreate: Array<Record<string, unknown>>;
    conversationsCreate: Array<Record<string, unknown>>;
    conversationsInfo: Array<Record<string, unknown>>;
    conversationsInvite: Array<Record<string, unknown>>;
    reactionsAdd: Array<Record<string, unknown>>;
    usersInfo: Array<Record<string, unknown>>;
    viewsOpen: Array<Record<string, unknown>>;
    viewsPublish: Array<Record<string, unknown>>;
  };
  setChatPostMessageError(channelId: string, error: unknown): void;
}

interface CreateFakeSlackClientOptions {
  users?: Record<string, Partial<FakeSlackUser>>;
}

const DEFAULT_USER_NAMES: Record<string, string> = {
  UBUD123: 'Lin Clark',
  UDES123: 'Olivia Taylor',
  UMGR123: 'Grace Hopper',
  UADA123: 'Ada Lovelace',
  UPM123: 'Riley Chen',
  UREV123: 'Sam Jordan',
};

export function createFakeSlackClient(
  options: CreateFakeSlackClientOptions = {}
): FakeSlackClientController {
  const calls: FakeSlackClientController['calls'] = {
    authTest: [],
    canvasesEdit: [],
    canvasesSectionsLookup: [],
    chatPostMessage: [],
    conversationsCanvasesCreate: [],
    conversationsCreate: [],
    conversationsInfo: [],
    conversationsInvite: [],
    reactionsAdd: [],
    usersInfo: [],
    viewsOpen: [],
    viewsPublish: [],
  };
  const channels = new Map<
    string,
    {id: string; name: string; canvasId?: string}
  >();
  const canvases = new Map<string, CanvasState>();
  const chatPostMessageErrors = new Map<string, unknown>();
  let channelCount = 0;
  let canvasCount = 0;
  let sectionCount = 0;

  const client = {
    auth: {
      test: async () => {
        calls.authTest.push({});
        return {
          ok: true,
          team_id: 'T_TEST',
          url: 'https://webflow-test.slack.com/',
        };
      },
    },
    canvases: {
      edit: async (args: Record<string, unknown>) => {
        calls.canvasesEdit.push(args);
        const canvasId =
          typeof args.canvas_id === 'string' ? args.canvas_id : undefined;
        if (!canvasId) {
          return {ok: true};
        }

        const canvas = getOrCreateCanvas(canvases, canvasId);
        const changes = Array.isArray(args.changes) ? args.changes : [];
        for (const change of changes) {
          if (!isRecord(change)) {
            continue;
          }
          applyCanvasChange(
            canvas,
            change,
            () => `S${String(++sectionCount).padStart(8, '0')}`
          );
        }

        return {ok: true};
      },
      sections: {
        lookup: async (args: Record<string, unknown>) => {
          calls.canvasesSectionsLookup.push(args);
          const canvasId =
            typeof args.canvas_id === 'string' ? args.canvas_id : undefined;
          const criteria = isRecord(args.criteria) ? args.criteria : undefined;
          const sectionTitle =
            typeof criteria?.contains_text === 'string'
              ? criteria.contains_text
              : undefined;
          const sectionId =
            canvasId && sectionTitle
              ? canvases.get(canvasId)?.sectionIdsByTitle.get(sectionTitle)
              : undefined;

          return {
            ok: true,
            sections: sectionId ? [{id: sectionId}] : [],
          };
        },
      },
    },
    chat: {
      postMessage: async (args: Record<string, unknown>) => {
        calls.chatPostMessage.push(args);
        const channelId = typeof args.channel === 'string' ? args.channel : '';
        const error = chatPostMessageErrors.get(channelId);
        if (error) {
          throw error;
        }

        return {
          ok: true,
          channel: channelId,
          ts: `1700000000.${String(calls.chatPostMessage.length).padStart(6, '0')}`,
        };
      },
    },
    conversations: {
      canvases: {
        create: async (args: Record<string, unknown>) => {
          calls.conversationsCanvasesCreate.push(args);
          const channelId =
            typeof args.channel_id === 'string' ? args.channel_id : '';
          const canvasId = `F${String(++canvasCount).padStart(8, '0')}`;
          const canvas = getOrCreateCanvas(canvases, canvasId);
          const markdown = extractMarkdown(args.document_content);
          registerCanvasHeadings(canvas, markdown, () => {
            return `S${String(++sectionCount).padStart(8, '0')}`;
          });

          const channel = channels.get(channelId);
          if (channel) {
            channel.canvasId = canvasId;
          }

          return {
            ok: true,
            canvas_id: canvasId,
          };
        },
      },
      create: async (args: Record<string, unknown>) => {
        calls.conversationsCreate.push(args);
        const channelId = `C${String(++channelCount).padStart(8, '0')}`;
        const channelName =
          typeof args.name === 'string' ? args.name : `spark-${channelCount}`;
        channels.set(channelId, {id: channelId, name: channelName});

        return {
          ok: true,
          channel: {
            id: channelId,
            name: channelName,
          },
        };
      },
      info: async (args: Record<string, unknown>) => {
        calls.conversationsInfo.push(args);
        const channelId = typeof args.channel === 'string' ? args.channel : '';
        const channel = channels.get(channelId);

        return {
          ok: true,
          channel: {
            id: channelId,
            name: channel?.name,
            properties: channel?.canvasId
              ? {canvas: {canvas_id: channel.canvasId}}
              : undefined,
          },
        };
      },
      invite: async (args: Record<string, unknown>) => {
        calls.conversationsInvite.push(args);
        return {ok: true};
      },
    },
    reactions: {
      add: async (args: Record<string, unknown>) => {
        calls.reactionsAdd.push(args);
        return {ok: true};
      },
    },
    users: {
      info: async (args: Record<string, unknown>) => {
        calls.usersInfo.push(args);
        const userId = typeof args.user === 'string' ? args.user : 'UUNKNOWN';
        return {
          ok: true,
          user: buildSlackUser(userId, options.users?.[userId]),
        };
      },
    },
    views: {
      open: async (args: Record<string, unknown>) => {
        calls.viewsOpen.push(args);
        return {
          ok: true,
          view: {id: `V${String(calls.viewsOpen.length).padStart(6, '0')}`},
        };
      },
      publish: async (args: Record<string, unknown>) => {
        calls.viewsPublish.push(args);
        return {ok: true};
      },
    },
  } as App['client'];

  return {
    client,
    calls,
    setChatPostMessageError(channelId: string, error: unknown) {
      chatPostMessageErrors.set(channelId, error);
    },
  };
}

function buildSlackUser(
  userId: string,
  override: Partial<FakeSlackUser> | undefined
): FakeSlackUser {
  const name = override?.real_name ?? DEFAULT_USER_NAMES[userId] ?? userId;
  const profile = override?.profile ?? {};
  const email =
    profile.email ??
    `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@webflow.com`;

  return {
    id: userId,
    real_name: name,
    profile: {
      real_name: profile.real_name ?? name,
      display_name: profile.display_name ?? name,
      title: profile.title ?? 'Engineer',
      email,
      image_192:
        profile.image_192 ?? `https://example.com/${userId.toLowerCase()}.png`,
      image_72:
        profile.image_72 ?? `https://example.com/${userId.toLowerCase()}.png`,
    },
  };
}

function getOrCreateCanvas(
  canvases: Map<string, CanvasState>,
  canvasId: string
): CanvasState {
  const existing = canvases.get(canvasId);
  if (existing) {
    return existing;
  }

  const created: CanvasState = {
    sectionIdsByTitle: new Map(),
    titlesBySectionId: new Map(),
  };
  canvases.set(canvasId, created);
  return created;
}

function applyCanvasChange(
  canvas: CanvasState,
  change: Record<string, unknown>,
  createSectionId: () => string
): void {
  const documentContent = isRecord(change.document_content)
    ? change.document_content
    : undefined;
  const markdown = extractMarkdown(documentContent);
  const heading = extractFirstHeading(markdown);
  const operation =
    typeof change.operation === 'string' ? change.operation : undefined;
  const sectionId =
    typeof change.section_id === 'string' ? change.section_id : undefined;

  if (operation === 'replace' && sectionId) {
    const existingTitle = canvas.titlesBySectionId.get(sectionId);
    const title = heading ?? existingTitle;
    if (!title) {
      return;
    }
    canvas.sectionIdsByTitle.set(title, sectionId);
    canvas.titlesBySectionId.set(sectionId, title);
    return;
  }

  if (!heading) {
    return;
  }

  const nextSectionId =
    canvas.sectionIdsByTitle.get(heading) ?? createSectionId();
  canvas.sectionIdsByTitle.set(heading, nextSectionId);
  canvas.titlesBySectionId.set(nextSectionId, heading);
}

function registerCanvasHeadings(
  canvas: CanvasState,
  markdown: string,
  createSectionId: () => string
): void {
  for (const line of markdown.split('\n')) {
    const heading = extractHeading(line);
    if (!heading || canvas.sectionIdsByTitle.has(heading)) {
      continue;
    }
    const sectionId = createSectionId();
    canvas.sectionIdsByTitle.set(heading, sectionId);
    canvas.titlesBySectionId.set(sectionId, heading);
  }
}

function extractMarkdown(
  documentContent: Record<string, unknown> | undefined
): string {
  return typeof documentContent?.markdown === 'string'
    ? documentContent.markdown
    : '';
}

function extractFirstHeading(markdown: string): string | undefined {
  for (const line of markdown.split('\n')) {
    const heading = extractHeading(line);
    if (heading) {
      return heading;
    }
  }

  return undefined;
}

function extractHeading(line: string): string | undefined {
  const match = line.match(/^#{1,6}\s+(.+)$/);
  return match?.[1]?.trim() || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
