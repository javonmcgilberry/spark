import type {App} from '@slack/bolt';
import type {Services} from '../app/services.js';
import {registerAssistantHandlers} from './handlers/assistant.js';
import {registerOnboardingHandlers} from './handlers/onboarding.js';
import {registerCommandHandlers} from './handlers/commands.js';
import {registerActionHandlers} from './handlers/actions.js';
import {registerHomeTabHandlers} from './handlers/homeTab.js';

export function registerHandlers(app: App, services: Services): void {
  registerAssistantHandlers(app, services);
  registerCommandHandlers(app, services);
  registerActionHandlers(app, services);
  registerHomeTabHandlers(app, services);
  registerOnboardingHandlers(app, services);
}
