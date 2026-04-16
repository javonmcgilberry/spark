import type {KnownBlock} from '@slack/types';
import {actions} from '../../slack/blockKit.js';
import {HOME_SECTION_TABS} from '../catalog.js';
import type {HomeSectionId} from '../types.js';
import {HOME_NAV_ACTION_ID} from './actionIds.js';

export function buildTabNavigation(activeSection: HomeSectionId): KnownBlock[] {
  return [
    actions(
      HOME_SECTION_TABS.map((tab) => ({
        label: tab.label,
        actionId: `${HOME_NAV_ACTION_ID}:${tab.id}`,
        value: tab.id,
        style: activeSection === tab.id ? 'primary' : undefined,
      }))
    ),
  ];
}
