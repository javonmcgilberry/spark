import {describe, expect, it, vi, beforeEach} from 'vitest';
import type {
  ContentBlock,
  MessageParam,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages/messages.mjs';
import type {GitHubService} from '../../src/services/githubService.js';
import type {JiraService} from '../../src/services/jiraService.js';
import type {OnboardingPackageService} from '../../src/services/onboardingPackageService.js';
import {createTestLogger} from '../helpers/createTestLogger.js';

const anthropicCreateMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {create: anthropicCreateMock};
    constructor(_options: unknown) {}
  }
  return {default: MockAnthropic};
});

// Import after the mock so the real client does not get instantiated.
const {LlmService, FALLBACK_UNREACHABLE} =
  await import('../../src/services/llmService.js');

function buildProfile() {
  return {
    userId: 'U1',
    firstName: 'Ada',
    displayName: 'Ada Lovelace',
    email: 'ada@webflow.com',
    teamName: 'Frontend Engineering',
    pillarName: 'Core Experience',
    roleTrack: 'frontend' as const,
    manager: {
      name: 'Grace',
      role: 'Engineering Manager',
      discussionPoints: '',
      weekBucket: 'week1-2' as const,
    },
    buddy: {
      name: 'Lin',
      role: 'Onboarding Buddy',
      discussionPoints: '',
      weekBucket: 'week1-2' as const,
    },
    teammates: [],
    docs: [],
    keyPaths: [],
    recommendedChannels: [],
    tools: [],
    rituals: [],
    checklist: [],
  };
}

function toolResponse(blocks: ContentBlock[]): unknown {
  return {
    stop_reason: blocks.some((b) => b.type === 'tool_use')
      ? 'tool_use'
      : 'end_turn',
    content: blocks,
  };
}

function textBlock(text: string): ContentBlock {
  return {type: 'text', text, citations: []} as ContentBlock;
}

function toolUseBlock(
  id: string,
  name: string,
  input: Record<string, unknown>
): ContentBlock {
  return {type: 'tool_use', id, name, input} as ContentBlock;
}

describe('LlmService', () => {
  beforeEach(() => {
    anthropicCreateMock.mockReset();
  });

  describe('buildTools registration', () => {
    async function toolNamesFor(
      svc: InstanceType<typeof LlmService>
    ): Promise<string[]> {
      anthropicCreateMock.mockResolvedValueOnce(
        toolResponse([textBlock('ok')])
      );
      await svc.answerUser({question: 'hi', profile: buildProfile()});
      const [call] = anthropicCreateMock.mock.calls;
      const tools = (call[0] as {tools: ToolUnion[]}).tools;
      return tools.map((t) => t.name);
    }

    it('registers search_jira only when Jira is configured', async () => {
      const noJira = new LlmService('test-key', createTestLogger());
      expect(await toolNamesFor(noJira)).not.toContain('search_jira');

      anthropicCreateMock.mockReset();

      const jira = {
        isConfigured: vi.fn().mockReturnValue(true),
      } as unknown as JiraService;
      const withJira = new LlmService(
        'test-key',
        createTestLogger(),
        undefined,
        {
          jira,
        }
      );
      expect(await toolNamesFor(withJira)).toContain('search_jira');
    });

    it('registers search_github_prs only when GitHub is configured', async () => {
      const noGh = new LlmService('test-key', createTestLogger());
      expect(await toolNamesFor(noGh)).not.toContain('search_github_prs');

      anthropicCreateMock.mockReset();

      const github = {
        isConfigured: vi.fn().mockReturnValue(true),
      } as unknown as GitHubService;
      const withGh = new LlmService('test-key', createTestLogger(), undefined, {
        github,
      });
      expect(await toolNamesFor(withGh)).toContain('search_github_prs');
    });
  });

  describe('agent loop behavior', () => {
    it('captures set_suggested_prompts tool_use and returns parsed prompts', async () => {
      const svc = new LlmService('test-key', createTestLogger());

      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([
            toolUseBlock('tool-1', 'set_suggested_prompts', {
              prompts: [
                {title: 'My checklist', message: "what's on my checklist?"},
                {title: 'Who should I meet', message: 'who should I meet?'},
              ],
            }),
          ])
        )
        .mockResolvedValueOnce(
          toolResponse([textBlock('Here is your answer.')])
        );

      const result = await svc.answerUser({
        question: 'what can you do?',
        profile: buildProfile(),
      });

      expect(result.text).toBe('Here is your answer.');
      expect(result.suggestedPrompts).toEqual([
        {title: 'My checklist', message: "what's on my checklist?"},
        {title: 'Who should I meet', message: 'who should I meet?'},
      ]);

      // The tool_result echoed back should be 'ok'
      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const lastUserMessage =
        secondCall.messages[secondCall.messages.length - 1];
      expect(lastUserMessage.role).toBe('user');
      const content = lastUserMessage.content as Array<{content: string}>;
      expect(content[0].content).toBe('ok');
    });

    it('returns FALLBACK_UNREACHABLE when no API key is configured', async () => {
      const svc = new LlmService(undefined, createTestLogger());

      const result = await svc.answerUser({
        question: 'anything',
        profile: buildProfile(),
      });

      expect(result.text).toBe(FALLBACK_UNREACHABLE);
      expect(result.suggestedPrompts).toBeNull();
      expect(anthropicCreateMock).not.toHaveBeenCalled();
    });

    it('returns FALLBACK_UNREACHABLE when the Anthropic client throws', async () => {
      const svc = new LlmService('test-key', createTestLogger());
      anthropicCreateMock.mockRejectedValueOnce(new Error('network down'));

      const result = await svc.answerUser({
        question: 'hi',
        profile: buildProfile(),
      });

      expect(result.text).toBe(FALLBACK_UNREACHABLE);
    });

    it('prepends conversation history as alternating user/assistant turns', async () => {
      const svc = new LlmService('test-key', createTestLogger());
      anthropicCreateMock.mockResolvedValueOnce(
        toolResponse([textBlock('ok')])
      );

      await svc.answerUser({
        question: 'follow up',
        profile: buildProfile(),
        history: [
          {role: 'user', content: 'first question'},
          {role: 'assistant', content: 'first answer'},
        ],
      });

      const [call] = anthropicCreateMock.mock.calls;
      const messages = (call[0] as {messages: MessageParam[]}).messages;
      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({role: 'user', content: 'first question'});
      expect(messages[1]).toEqual({role: 'assistant', content: 'first answer'});
      expect(messages[2]).toEqual({role: 'user', content: 'follow up'});
    });
  });

  describe('catalog tool routing', () => {
    it('list_slack_channels returns default channels when no published package exists', async () => {
      const packages = {
        getPackageForUser: vi.fn().mockReturnValue(undefined),
      } as unknown as OnboardingPackageService;
      const svc = new LlmService('test-key', createTestLogger(), undefined, {
        onboardingPackages: packages,
      });

      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([toolUseBlock('t1', 'list_slack_channels', {})])
        )
        .mockResolvedValueOnce(
          toolResponse([textBlock('Here are some channels.')])
        );

      const result = await svc.answerUser({
        question: 'show me channels',
        profile: buildProfile(),
      });

      expect(result.text).toBe('Here are some channels.');
      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const toolResultTurn =
        secondCall.messages[secondCall.messages.length - 1];
      const toolResultContent = (
        toolResultTurn.content as Array<{content: string}>
      )[0].content;
      const parsed = JSON.parse(toolResultContent);
      expect(parsed.categories.length).toBeGreaterThan(0);
      expect(parsed.categories[0].channels.length).toBeGreaterThan(0);
    });

    it('list_checklist returns empty weeks when no published package exists', async () => {
      const packages = {
        getPackageForUser: vi.fn().mockReturnValue(undefined),
      } as unknown as OnboardingPackageService;
      const svc = new LlmService('test-key', createTestLogger(), undefined, {
        onboardingPackages: packages,
      });

      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([toolUseBlock('t1', 'list_checklist', {})])
        )
        .mockResolvedValueOnce(
          toolResponse([textBlock('Your manager is still setting things up.')])
        );

      await svc.answerUser({
        question: 'what is my checklist',
        profile: buildProfile(),
      });

      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const toolResultTurn =
        secondCall.messages[secondCall.messages.length - 1];
      const toolResultContent = (
        toolResultTurn.content as Array<{content: string}>
      )[0].content;
      expect(JSON.parse(toolResultContent)).toEqual({weeks: []});
    });

    it('list_slack_channels annotates joined state when joinedSlackChannels is provided', async () => {
      const svc = new LlmService('test-key', createTestLogger());
      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([toolUseBlock('t1', 'list_slack_channels', {})])
        )
        .mockResolvedValueOnce(
          toolResponse([textBlock('Here are some channels.')])
        );

      await svc.answerUser({
        question: 'what channels am I missing?',
        profile: buildProfile(),
        joinedSlackChannels: new Set(['webflow-announcements', 'props']),
      });

      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const toolResultTurn =
        secondCall.messages[secondCall.messages.length - 1];
      const toolResultContent = (
        toolResultTurn.content as Array<{content: string}>
      )[0].content;
      const parsed = JSON.parse(toolResultContent) as {
        categories: Array<{channels: Array<{name: string; joined?: boolean}>}>;
        joinedCount: number;
        totalCount: number;
      };
      expect(parsed).toHaveProperty('joinedCount');
      expect(parsed).toHaveProperty('totalCount');
      expect(parsed.joinedCount).toBeGreaterThan(0);

      const allChannels = parsed.categories.flatMap((c) => c.channels);
      for (const channel of allChannels) {
        expect(typeof channel.joined).toBe('boolean');
      }
      const announcements = allChannels.find(
        (c) => c.name === '#webflow-announcements'
      );
      expect(announcements?.joined).toBe(true);
    });

    it('save_user_guide_answer routes parsed args to the intake sink and reports success', async () => {
      const saveAnswer = vi.fn();
      const finalize = vi.fn().mockReturnValue({markdown: '', missing: []});
      const svc = new LlmService('test-key', createTestLogger(), undefined, {
        userGuideIntake: {saveAnswer, finalize},
      });

      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([
            toolUseBlock('t1', 'save_user_guide_answer', {
              sectionId: 'schedule',
              answer: '  9-5 PT, DMs welcome  ',
            }),
          ])
        )
        .mockResolvedValueOnce(toolResponse([textBlock('Saved.')]));

      await svc.answerUser({
        question: 'I work 9-5 PT',
        profile: buildProfile(),
      });

      expect(saveAnswer).toHaveBeenCalledOnce();
      expect(saveAnswer).toHaveBeenCalledWith(
        'U1',
        'schedule',
        '  9-5 PT, DMs welcome  '
      );

      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const toolResultTurn =
        secondCall.messages[secondCall.messages.length - 1];
      const toolResultContent = (
        toolResultTurn.content as Array<{content: string}>
      )[0].content;
      const parsed = JSON.parse(toolResultContent) as {
        saved?: boolean;
        sectionId?: string;
      };
      expect(parsed.saved).toBe(true);
      expect(parsed.sectionId).toBe('schedule');
    });

    it('save_user_guide_answer returns a validation error for an unknown sectionId without calling the sink', async () => {
      const saveAnswer = vi.fn();
      const finalize = vi.fn().mockReturnValue({markdown: '', missing: []});
      const svc = new LlmService('test-key', createTestLogger(), undefined, {
        userGuideIntake: {saveAnswer, finalize},
      });

      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([
            toolUseBlock('t1', 'save_user_guide_answer', {
              sectionId: 'totally-invalid',
              answer: 'anything',
            }),
          ])
        )
        .mockResolvedValueOnce(toolResponse([textBlock('Got it.')]));

      await svc.answerUser({
        question: 'ok',
        profile: buildProfile(),
      });

      expect(saveAnswer).not.toHaveBeenCalled();
      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const toolResultContent = (
        secondCall.messages[secondCall.messages.length - 1].content as Array<{
          content: string;
        }>
      )[0].content;
      expect(JSON.parse(toolResultContent)).toEqual({
        error: expect.stringContaining('sectionId must be one of'),
      });
    });

    it('finalize_user_guide returns the sink output verbatim including missing sections', async () => {
      const saveAnswer = vi.fn();
      const finalize = vi.fn().mockReturnValue({
        markdown: '# Ada\n\n## schedule\n\n9-5',
        missing: ['style', 'values'],
      });
      const svc = new LlmService('test-key', createTestLogger(), undefined, {
        userGuideIntake: {saveAnswer, finalize},
      });

      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([toolUseBlock('t1', 'finalize_user_guide', {})])
        )
        .mockResolvedValueOnce(
          toolResponse([textBlock('Here is your draft.')])
        );

      await svc.answerUser({
        question: 'finalize it',
        profile: buildProfile(),
      });

      expect(finalize).toHaveBeenCalledOnce();
      expect(finalize).toHaveBeenCalledWith(
        expect.objectContaining({userId: 'U1', firstName: 'Ada'})
      );

      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const toolResultContent = (
        secondCall.messages[secondCall.messages.length - 1].content as Array<{
          content: string;
        }>
      )[0].content;
      expect(JSON.parse(toolResultContent)).toEqual({
        markdown: '# Ada\n\n## schedule\n\n9-5',
        missing: ['style', 'values'],
      });
    });

    it('user guide tools are not registered when no intake sink is supplied', async () => {
      const svc = new LlmService('test-key', createTestLogger());
      anthropicCreateMock.mockResolvedValueOnce(
        toolResponse([textBlock('ok')])
      );

      await svc.answerUser({question: 'hi', profile: buildProfile()});

      const tools = (
        anthropicCreateMock.mock.calls[0][0] as {tools: ToolUnion[]}
      ).tools;
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('save_user_guide_answer');
      expect(names).not.toContain('finalize_user_guide');
    });

    it('list_slack_channels omits joined entirely when no set is supplied', async () => {
      const svc = new LlmService('test-key', createTestLogger());
      anthropicCreateMock
        .mockResolvedValueOnce(
          toolResponse([toolUseBlock('t1', 'list_slack_channels', {})])
        )
        .mockResolvedValueOnce(
          toolResponse([textBlock('Here are some channels.')])
        );

      await svc.answerUser({
        question: 'what channels are there?',
        profile: buildProfile(),
      });

      const secondCall = anthropicCreateMock.mock.calls[1][0] as {
        messages: MessageParam[];
      };
      const toolResultTurn =
        secondCall.messages[secondCall.messages.length - 1];
      const toolResultContent = (
        toolResultTurn.content as Array<{content: string}>
      )[0].content;
      const parsed = JSON.parse(toolResultContent) as {
        categories: Array<{channels: Array<{name: string; joined?: boolean}>}>;
        joinedCount?: number;
      };
      expect(parsed.joinedCount).toBeUndefined();
      const sampleChannel = parsed.categories[0]?.channels[0];
      expect(sampleChannel).not.toHaveProperty('joined');
    });
  });
});
