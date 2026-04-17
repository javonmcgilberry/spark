import { describe, expect, it } from "vitest";
import { makeTestCtx } from "../helpers/makeTestCtx";
import {
  handleCreateDraft,
  handleListDrafts,
} from "../../lib/handlers/drafts/list";
import {
  handleGetDraft,
  handlePatchDraft,
} from "../../lib/handlers/drafts/byId";
import { handleCritiqueDraft } from "../../lib/handlers/drafts/critique";
import type { HandlerCtx } from "../../lib/ctx";

const session = { managerSlackId: "UMANAGER1", source: "env" as const };

function jsonRequest(
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Request {
  return new Request("https://test.local/api/drafts", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function setupWithDraft(): Promise<HandlerCtx> {
  const ctx = makeTestCtx({
    slack: {
      usersLookupByEmail: {
        "alice@webflow.com": {
          id: "UHIRE001",
          real_name: "Alice Adams",
          profile: {
            first_name: "Alice",
            display_name: "alice",
            email: "alice@webflow.com",
            title: "Software Engineer",
          },
        },
      },
      usersInfo: {
        UHIRE001: {
          id: "UHIRE001",
          real_name: "Alice Adams",
          profile: {
            first_name: "Alice",
            display_name: "alice",
            email: "alice@webflow.com",
          },
        },
      },
    },
  });

  const create = await handleCreateDraft(
    jsonRequest({ newHireSlackId: "UHIRE001" }),
    ctx,
    session,
  );
  expect(create.status).toBe(201);
  return ctx;
}

describe("drafts handlers", () => {
  it("create → list → get round-trip", async () => {
    const ctx = await setupWithDraft();

    const list = await handleListDrafts(ctx, session);
    const listed = (await list.json()) as { drafts: Array<{ userId: string }> };
    expect(listed.drafts.map((d) => d.userId)).toEqual(["UHIRE001"]);

    const getRes = await handleGetDraft(ctx, session, "UHIRE001");
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { pkg: { userId: string } };
    expect(getBody.pkg.userId).toBe("UHIRE001");
  });

  it("patchDraft updates welcomeNote", async () => {
    const ctx = await setupWithDraft();
    const res = await handlePatchDraft(
      jsonRequest({ welcomeNote: "Hello Alice!" }, "PATCH"),
      ctx,
      session,
      "UHIRE001",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pkg: { welcomeNote: string } };
    expect(body.pkg.welcomeNote).toBe("Hello Alice!");
  });

  it("patchDraft rejects invalid body shape", async () => {
    const ctx = await setupWithDraft();
    const res = await handlePatchDraft(
      jsonRequest(
        {
          customChecklistItems: [
            {
              label: "x",
              kind: "not-a-kind",
              notes: "y",
            },
          ],
        },
        "PATCH",
      ),
      ctx,
      session,
      "UHIRE001",
    );
    expect(res.status).toBe(400);
  });

  it("handleGetDraft 404 when missing", async () => {
    const ctx = makeTestCtx();
    const res = await handleGetDraft(ctx, session, "UNONEXISTENT");
    expect(res.status).toBe(404);
  });

  it("critique surfaces no-buddy finding for a fresh draft", async () => {
    const ctx = await setupWithDraft();
    const res = await handleCritiqueDraft(ctx, session, "UHIRE001");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { findings: Array<{ id: string }> };
    expect(body.findings.some((f) => f.id === "no-buddy")).toBe(true);
  });
});
