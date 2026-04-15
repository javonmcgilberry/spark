import {ErrorCode, type WebAPIPlatformError} from '@slack/web-api';

interface SlackPlatformMetadata {
  error: string;
  needed?: string;
  provided?: string;
}

type SlackPlatformErrorWithMetadata = Omit<WebAPIPlatformError, 'data'> & {
  data: SlackPlatformMetadata;
};

export function getSlackPlatformError(
  error: unknown
): SlackPlatformErrorWithMetadata | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const candidate = error as Partial<SlackPlatformErrorWithMetadata>;
  return candidate.code === ErrorCode.PlatformError && candidate.data?.error
    ? (candidate as SlackPlatformErrorWithMetadata)
    : undefined;
}

export function hasSlackErrorCode(error: unknown, errorCode: string): boolean {
  return getSlackPlatformError(error)?.data.error === errorCode;
}

export function isMissingScopeError(
  error: unknown,
  neededScope: string
): boolean {
  const platformError = getSlackPlatformError(error);
  return (
    platformError?.data.error === 'missing_scope' &&
    platformError.data.needed === neededScope
  );
}

export function formatSlackError(error: unknown): string {
  const platformError = getSlackPlatformError(error);
  if (!platformError) {
    return error instanceof Error ? error.message : String(error);
  }

  return [
    platformError.data.error,
    platformError.data.needed
      ? `needed=${platformError.data.needed}`
      : undefined,
    platformError.data.provided
      ? `provided=${platformError.data.provided}`
      : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}
