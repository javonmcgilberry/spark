export const HOME_CHECKLIST_ACTION_ID = 'spark_item_status';
export const HOME_NAV_ACTION_ID = 'spark_home_open_section';
export const HOME_TOOL_ACCESS_ACTION_ID = 'spark_tool_access';
export const TOOL_CHECKBOX_CHUNK_SIZE = 10;

export function buildChecklistItemActionId(
  sectionId: string,
  itemIndex: number
): string {
  return `${HOME_CHECKLIST_ACTION_ID}:${sectionId}:${itemIndex}`;
}

export function parseChecklistItemActionId(
  actionId: string
): {sectionId: string; itemIndex: number} | null {
  if (!actionId.startsWith(`${HOME_CHECKLIST_ACTION_ID}:`)) {
    return null;
  }

  const [, sectionId, itemIndexText] = actionId.split(':');
  const itemIndex = Number(itemIndexText);
  if (!sectionId || Number.isNaN(itemIndex)) {
    return null;
  }

  return {sectionId, itemIndex};
}

export function slugifyToolCategory(category: string): string {
  return (
    category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category'
  );
}

export function buildToolAccessKey(category: string, toolName: string): string {
  return `${category.toLowerCase()}::${toolName.toLowerCase()}`;
}

export function buildToolAccessActionId(
  category: string,
  chunkIndex: number
): string {
  return `${HOME_TOOL_ACCESS_ACTION_ID}:${slugifyToolCategory(category)}:${chunkIndex}`;
}
