export function collectTextContent(value: unknown): string {
  const parts: string[] = [];
  visit(value, parts);
  return parts.join(' ');
}

function visit(value: unknown, parts: string[]): void {
  if (typeof value === 'string') {
    parts.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      visit(entry, parts);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      visit(entry, parts);
    }
  }
}
