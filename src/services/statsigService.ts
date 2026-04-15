import type {Logger} from '../app/logger.js';

const STATSIG_BASE_URL = 'https://statsigapi.net';
const STALE_GATES_CACHE_TTL_MS = 5 * 60 * 1000;

export interface StatsigGate {
  name: string;
  status: string;
}

interface StatsigResponse {
  data: StatsigGate[];
  pagination: {
    nextPage?: string;
  };
}

export class StatsigService {
  private cache: {gates: StatsigGate[]; fetchedAt: number} | null = null;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly logger: Logger
  ) {}

  async listStaleGates(): Promise<StatsigGate[]> {
    if (!this.apiKey) {
      return [];
    }

    if (
      this.cache &&
      Date.now() - this.cache.fetchedAt < STALE_GATES_CACHE_TTL_MS
    ) {
      return this.cache.gates;
    }

    const pages: StatsigGate[][] = [];
    let nextPath = '/console/v1/gates?includeArchived=true';

    while (nextPath) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch(`${STATSIG_BASE_URL}${nextPath}`, {
          headers: {
            'STATSIG-API-KEY': this.apiKey,
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Statsig request failed (${response.status})`);
        }

        const body = (await response.json()) as StatsigResponse;
        pages.push(body.data ?? []);
        nextPath = body.pagination?.nextPage ?? '';
      } catch (error) {
        this.logger.warn('Failed to fetch stale Statsig gates.', error);
        return [];
      } finally {
        clearTimeout(timeout);
      }
    }

    const gates = pages
      .flat()
      .filter((gate) => ['Disabled', 'Archived'].includes(gate.status));

    this.cache = {
      gates,
      fetchedAt: Date.now(),
    };

    return gates;
  }
}
