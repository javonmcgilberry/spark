import type {KnownBlock} from '@slack/types';
import {APP_NAME} from '../../../config/constants.js';
import {
  divider,
  header,
  richText,
  richTextQuote,
  section,
} from '../../../slack/blockKit.js';
import type {OnboardingPackage} from '../../types.js';
import {paragraph} from '../shared.js';

export function renderTasksSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const tasks = onboardingPackage.sections.initialEngineeringTasks.tasks;
  return [
    header(onboardingPackage.sections.initialEngineeringTasks.title),
    paragraph(onboardingPackage.sections.initialEngineeringTasks.intro),
    header('Manager guidance', 2),
    richText([
      richTextQuote(
        onboardingPackage.sections.initialEngineeringTasks.managerPrompt
      ),
    ]),
    ...(tasks.length > 0
      ? tasks.flatMap((task, index) => [
          ...(index > 0 ? [divider()] : []),
          section(
            `*${task.title}*\n${task.description}\n_Why it works: ${task.rationale}_\nSkill: \`${task.skillCommand}\``
          ),
        ])
      : [
          section(
            `No starter tasks are here yet. Your manager can add one in the draft flow, or ${APP_NAME} can scan for a good first contribution.`
          ),
        ]),
  ];
}
