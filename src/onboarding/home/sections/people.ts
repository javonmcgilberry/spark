import type {KnownBlock} from '@slack/types';
import {divider, header} from '../../../slack/blockKit.js';
import {groupPeopleByWeek} from '../../display.js';
import type {OnboardingPackage} from '../../types.js';
import {
  buildPersonCard,
  buildRoleLabel,
  formatPersonLabel,
  paragraph,
} from '../shared.js';

export function renderPeopleSection(
  onboardingPackage: OnboardingPackage
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    header(onboardingPackage.sections.peopleToMeet.title),
    paragraph(onboardingPackage.sections.peopleToMeet.intro),
  ];

  groupPeopleByWeek(onboardingPackage.sections.peopleToMeet.people).forEach(
    (bucket, bucketIndex) => {
      if (bucketIndex > 0) {
        blocks.push(divider());
      }

      blocks.push(header(bucket.label, 2));
      bucket.people.forEach((person) => {
        blocks.push(
          buildPersonCard(
            person,
            `*${formatPersonLabel(person)}*\n_${buildRoleLabel(person)}_\n${person.discussionPoints}${
              person.userGuide
                ? `\n<${person.userGuide.url}|User guide> — ${person.userGuide.summary}`
                : ''
            }`
          )
        );
      });
    }
  );

  return blocks;
}
