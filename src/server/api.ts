import express, {type RequestHandler, type Router} from 'express';
import type {App} from '@slack/bolt';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {EnvConfig} from '../config/env.js';
import type {Services} from '../app/services.js';
import type {TeamProfile} from '../onboarding/types.js';

const checklistItemSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(['task', 'live-training', 'workramp', 'reading', 'recording']),
  notes: z.string(),
  resourceLabel: z.string().optional(),
  resourceUrl: z.string().optional(),
  sectionId: z.string().optional(),
});

const patchBodySchema = z.object({
  welcomeNote: z.string().nullable().optional(),
  buddyUserId: z.string().nullable().optional(),
  stakeholderUserIds: z.array(z.string()).optional(),
  customChecklistItems: z.array(checklistItemSchema).optional(),
});

const createBodySchema = z.object({
  newHireSlackId: z.string().optional(),
  newHireEmail: z.string().email().optional(),
  welcomeNote: z.string().optional(),
  buddyUserId: z.string().optional(),
  stakeholderUserIds: z.array(z.string()).optional(),
});

const slackIdHeaderSchema = z.string().regex(/^[A-Z0-9]+$/);

interface AuthedRequest extends express.Request {
  managerSlackId: string;
  requestId: string;
}

/**
 * Bearer-token + manager-identity middleware.
 *
 * Rejects requests that lack a valid `Authorization: Bearer <SPARK_API_TOKEN>`
 * header with 401. Rejects requests missing `X-Spark-Manager-Slack-Id` with
 * 400. Attaches the resolved manager id to the request so route handlers can
 * trust it.
 */
export function requireSparkApiAuth(env: EnvConfig): RequestHandler {
  return (req, res, next) => {
    if (!env.sparkApiToken) {
      res.status(503).json({error: 'spark api is not configured on this bot'});
      return;
    }
    const rawAuth = req.header('authorization') ?? '';
    const bearer = rawAuth.replace(/^Bearer\s+/i, '');
    if (!bearer || bearer !== env.sparkApiToken) {
      res.status(401).json({error: 'unauthorized'});
      return;
    }
    const managerHeader = req.header('x-spark-manager-slack-id');
    const managerParse = slackIdHeaderSchema.safeParse(managerHeader);
    if (!managerParse.success) {
      res.status(400).json({error: 'x-spark-manager-slack-id header required'});
      return;
    }
    (req as AuthedRequest).managerSlackId = managerParse.data;
    (req as AuthedRequest).requestId = randomUUID();
    next();
  };
}

/**
 * Build the productized Spark API router. Mounted at `/api` and protected
 * by `requireSparkApiAuth`. The test harness at `/test/*` stays untouched.
 */
export function createSparkApiRouter(
  services: Services,
  slackClient?: App['client']
): Router {
  const router = express.Router();
  router.use(express.json({limit: '512kb'}));
  const {
    logger,
    identityResolver,
    onboardingPackages,
    journey,
    canvas,
    confluenceSearch,
    peopleInsights,
    slackUserDirectory,
    taskScanner,
  } = services;

  const resolveManagerProfile = async (
    managerSlackId: string
  ): Promise<TeamProfile> => {
    if (slackClient) {
      return identityResolver.resolveFromSlack(
        {client: slackClient} as App,
        managerSlackId
      );
    }
    return identityResolver.resolveFromEmail(
      `${managerSlackId.toLowerCase()}@webflow-test.local`,
      slackClient
    );
  };

  const resolveNewHireProfile = async (opts: {
    slackId?: string;
    email?: string;
  }): Promise<TeamProfile | null> => {
    if (opts.slackId && slackClient) {
      return identityResolver.resolveFromSlack(
        {client: slackClient} as App,
        opts.slackId
      );
    }
    if (opts.email) {
      return identityResolver.resolveFromEmail(opts.email, slackClient);
    }
    return null;
  };

  const log = (req: express.Request, status: number, durationMs: number) => {
    const authed = req as AuthedRequest;
    logger.info(
      `[api ${authed.requestId ?? '-'}] ${req.method} ${req.path} manager=${
        authed.managerSlackId ?? '-'
      } status=${status} duration=${durationMs}ms`
    );
  };

  const wrap = (
    fn: (req: AuthedRequest, res: express.Response) => Promise<void>
  ): RequestHandler => {
    return async (req, res) => {
      const started = Date.now();
      try {
        await fn(req as AuthedRequest, res);
      } catch (error) {
        logger.warn(`[api] handler error`, error);
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : 'server error',
          });
        }
      } finally {
        log(req, res.statusCode, Date.now() - started);
      }
    };
  };

  router.get(
    '/me',
    wrap(async (req, res) => {
      const profile = await resolveManagerProfile(req.managerSlackId);
      res.json({profile});
    })
  );

  router.get(
    '/drafts',
    wrap(async (req, res) => {
      const drafts = onboardingPackages.listDraftsForManager(
        req.managerSlackId
      );
      const published = onboardingPackages.getPackagesManagedBy(
        req.managerSlackId
      );
      res.json({
        drafts,
        publishedPackages: published.filter(
          (pkg) => pkg.status === 'published'
        ),
      });
    })
  );

  router.get(
    '/drafts/:userId',
    wrap(async (req, res) => {
      const userId = paramValue(req, 'userId');
      const pkg = onboardingPackages.getPackageForUser(userId);
      if (!pkg) {
        res.status(404).json({error: 'draft not found'});
        return;
      }
      res.json({pkg});
    })
  );

  router.post(
    '/drafts',
    wrap(async (req, res) => {
      const body = createBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res
          .status(400)
          .json({error: 'invalid body', issues: body.error.issues});
        return;
      }
      const hire = await resolveNewHireProfile({
        slackId: body.data.newHireSlackId,
        email: body.data.newHireEmail,
      });
      if (!hire) {
        res
          .status(400)
          .json({error: 'newHireSlackId or newHireEmail required'});
        return;
      }
      const pkg = await onboardingPackages.createDraftPackage({
        profile: hire,
        createdByUserId: req.managerSlackId,
        welcomeNote: body.data.welcomeNote,
        buddyUserId: body.data.buddyUserId,
        stakeholderUserIds: body.data.stakeholderUserIds,
        slackClient,
      });
      res.status(201).json({pkg});
    })
  );

  router.patch(
    '/drafts/:userId',
    wrap(async (req, res) => {
      const body = patchBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res
          .status(400)
          .json({error: 'invalid body', issues: body.error.issues});
        return;
      }
      const pkg = onboardingPackages.applyFieldPatch(
        paramValue(req, 'userId'),
        body.data
      );
      if (!pkg) {
        res.status(404).json({error: 'draft not found or already published'});
        return;
      }
      res.json({pkg});
    })
  );

  router.post(
    '/drafts/:userId/hydrate-slack',
    wrap(async (req, res) => {
      const userId = paramValue(req, 'userId');
      const pkg = onboardingPackages.getPackageForUser(userId);
      if (!pkg) {
        res.status(404).json({error: 'draft not found'});
        return;
      }
      if (!slackClient) {
        res.status(503).json({error: 'slack client not available'});
        return;
      }
      if (pkg.draftChannelId) {
        res.json({pkg, alreadyHydrated: true});
        return;
      }
      const hire = await resolveNewHireProfile({slackId: pkg.userId});
      if (!hire) {
        res.status(500).json({error: 'could not resolve new hire profile'});
        return;
      }
      const workspace = await services.canvas.createDraftWorkspace(
        slackClient,
        pkg,
        hire
      );
      if (workspace) {
        pkg.draftChannelId = workspace.channelId;
        pkg.draftChannelName = workspace.channelName;
        pkg.draftCanvasId = workspace.canvasId;
        pkg.draftCanvasUrl = workspace.canvasUrl;
        pkg.updatedAt = new Date().toISOString();
      }
      res.json({pkg, alreadyHydrated: false});
    })
  );

  router.post(
    '/drafts/:userId/publish',
    wrap(async (req, res) => {
      const result = onboardingPackages.publishPackage(
        paramValue(req, 'userId'),
        req.managerSlackId
      );
      if (!result.ok) {
        res.status(result.reason === 'not_found' ? 404 : 403).json({
          error: result.reason,
        });
        return;
      }
      if (slackClient && result.pkg.status === 'published') {
        const hire = await resolveNewHireProfile({slackId: result.pkg.userId});
        if (hire) {
          const prepared = await journey.prepareDashboard(hire);
          if (
            prepared.onboardingPackage &&
            prepared.onboardingPackage.status === 'published'
          ) {
            try {
              await canvas.publishWorkspace(
                slackClient,
                prepared.onboardingPackage,
                hire,
                prepared.state
              );
            } catch (error) {
              logger.warn(
                'Canvas publish workspace failed; draft is still published.',
                error
              );
            }
          }
        }
      }
      res.json({pkg: result.pkg});
    })
  );

  router.get(
    '/lookup/team',
    wrap(async (req, res) => {
      const hint = stringQuery(req, 'hint');
      if (!hint) {
        res.status(400).json({error: 'hint required'});
        return;
      }
      const profile = await identityResolver.resolveFromEmail(
        hint,
        slackClient
      );
      res.json({
        teamName: profile.teamName,
        pillarName: profile.pillarName,
        githubTeamSlug: profile.githubTeamSlug,
        roleTrack: profile.roleTrack,
        manager: profile.manager,
        buddy: profile.buddy,
      });
    })
  );

  router.get(
    '/lookup/teammates',
    wrap(async (req, res) => {
      const team = stringQuery(req, 'team');
      const emailSeed = stringQuery(req, 'emailSeed');
      if (!team && !emailSeed) {
        res.status(400).json({error: 'team or emailSeed required'});
        return;
      }
      // The IdentityResolver is the source of truth for team composition;
      // resolve a profile from the seeding email to get the full roster.
      const seedEmail =
        emailSeed ??
        `${team!.toLowerCase().replace(/\s+/g, '-')}@webflow-test.local`;
      const profile = await identityResolver.resolveFromEmail(
        seedEmail,
        slackClient
      );
      const teammates = profile.teammates;
      const insights = await peopleInsights.getInsightsForPeople(
        teammates,
        profile.teamName
      );
      res.json({
        teamName: profile.teamName,
        teammates,
        insights,
      });
    })
  );

  router.get(
    '/lookup/confluence-people',
    wrap(async (req, res) => {
      const email = stringQuery(req, 'email');
      if (!email) {
        res.status(400).json({error: 'email required'});
        return;
      }
      const profile = await identityResolver.resolveFromEmail(
        email,
        slackClient
      );
      const people = [profile.manager, profile.buddy, ...profile.teammates];
      const guides = await confluenceSearch.findPeopleGuides(profile, people);
      res.json({guides});
    })
  );

  router.get(
    '/lookup/slack-users',
    wrap(async (req, res) => {
      const q = stringQuery(req, 'q') ?? '';
      const rawLimit = Number(stringQuery(req, 'limit') ?? '10');
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(25, Math.floor(rawLimit)))
        : 10;
      if (!slackClient) {
        res.status(503).json({error: 'slack client not available'});
        return;
      }
      const users = await slackUserDirectory.search(slackClient, q, limit);
      res.json({users});
    })
  );

  router.get(
    '/lookup/contribution-tasks',
    wrap(async (req, res) => {
      const email = stringQuery(req, 'email');
      if (!email) {
        res.status(400).json({error: 'email required'});
        return;
      }
      const profile = await identityResolver.resolveFromEmail(
        email,
        slackClient
      );
      const tasks = await taskScanner.scan(profile);
      res.json({tasks});
    })
  );

  return router;
}

function stringQuery(req: express.Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function paramValue(req: express.Request, key: string): string {
  const raw = (req.params as Record<string, unknown>)[key];
  return typeof raw === 'string' ? raw : '';
}
