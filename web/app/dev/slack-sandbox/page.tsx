import {notFound} from 'next/navigation';
import SlackSandboxClient from './SlackSandboxClient';

/**
 * /dev/slack-sandbox — the team's Slack debugger.
 *
 * Every event fixture Spark understands is reachable from this page.
 * Pick a scenario, tweak the JSON if needed, click Send, see the
 * response + recorded outbound Slack calls inline. No tunnel required
 * for daily iteration — the tunnel is for AFFIRMATION, not iteration.
 *
 * Gated by NODE_ENV !== 'production'. The route also returns 404 via
 * notFound() as a belt-and-braces check.
 */
export default function SlackSandboxPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <SlackSandboxClient fixtures={FIXTURE_CATALOG} />;
}

export const dynamic = 'force-dynamic';

const FIXTURE_CATALOG: Array<{
  id: string;
  label: string;
  endpoint: 'events' | 'interactivity';
  description: string;
  file: string;
}> = [
  {
    id: 'url-verification',
    label: 'URL verification (handshake)',
    endpoint: 'events',
    description:
      "Slack's initial verification when you save the Events URL. Must return the `challenge` value.",
    file: '/dev-fixtures/url-verification.json',
  },
  {
    id: 'assistant-thread-started',
    label: 'Assistant thread started',
    endpoint: 'events',
    description:
      'Hire opens the AI assistant thread. Triggers Spark welcome + plan-prep + home publish.',
    file: '/dev-fixtures/assistant-thread-started.json',
  },
  {
    id: 'assistant-thread-context-changed',
    label: 'Assistant thread context changed',
    endpoint: 'events',
    description:
      'Hire switched channels within the thread. Re-evaluates context.',
    file: '/dev-fixtures/assistant-thread-context-changed.json',
  },
  {
    id: 'app-mention',
    label: 'App mention (@Spark ...)',
    endpoint: 'events',
    description: 'Hire @-mentions Spark in a channel.',
    file: '/dev-fixtures/app-mention.json',
  },
  {
    id: 'message-im',
    label: 'Direct message to Spark',
    endpoint: 'events',
    description: "Hire DM's Spark. Routes through the Assistant agent.",
    file: '/dev-fixtures/message-im.json',
  },
  {
    id: 'app-home-opened',
    label: 'App Home opened',
    endpoint: 'events',
    description: "Hire opened Spark's Home tab. Re-publishes the Home view.",
    file: '/dev-fixtures/app-home-opened.json',
  },
  {
    id: 'member-joined-channel',
    label: 'Member joined channel',
    endpoint: 'events',
    description:
      'Someone joined a channel Spark watches. Used for onboarding channel auto-greet.',
    file: '/dev-fixtures/member-joined-channel.json',
  },
  {
    id: 'interactivity-button',
    label: 'Block Kit button action',
    endpoint: 'interactivity',
    description: "Hire clicked a button in one of Spark's Block Kit views.",
    file: '/dev-fixtures/interactivity-button.json',
  },
];
