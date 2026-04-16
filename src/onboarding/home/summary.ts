import type {KnownBlock} from '@slack/types';
import {richText, richTextSection, richTextText} from '../../slack/blockKit.js';
import type {OnboardingPackage} from '../types.js';

export function buildHomeSummaryBlock(
  onboardingPackage: OnboardingPackage,
  completedCount: number,
  totalCount: number
): KnownBlock {
  return richText([
    richTextSection([
      richTextText('Checklist progress: ', {bold: true}),
      richTextText(`${completedCount}/${totalCount}`),
      ...(onboardingPackage.welcomeNote
        ? [
            richTextText('\nManager note: ', {bold: true}),
            richTextText('Included'),
          ]
        : []),
    ]),
  ]);
}
