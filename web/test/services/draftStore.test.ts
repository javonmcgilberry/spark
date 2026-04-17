import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPatchInPlace,
  makeMemoryDraftStore,
  type DraftStore,
} from "../../lib/draftStore";
import type { OnboardingPackage } from "../../lib/types";

function samplePackage(
  overrides: Partial<OnboardingPackage> = {},
): OnboardingPackage {
  const now = new Date().toISOString();
  return {
    userId: "UHIRE001",
    status: "draft",
    createdByUserId: "UMANAGER1",
    managerUserId: "UMANAGER1",
    reviewerUserIds: ["UMANAGER1"],
    createdAt: now,
    updatedAt: now,
    sections: {
      welcome: {
        title: "Welcome",
        intro: "Welcome!",
        personalizedNote: undefined,
        onboardingPocs: [],
        journeyMilestones: [],
      },
      onboardingChecklist: { title: "Checklist", intro: "", sections: [] },
      peopleToMeet: { title: "People", intro: "", people: [] },
      toolsAccess: { title: "Tools", intro: "", tools: [] },
      slack: { title: "Slack", intro: "", channels: [] },
      initialEngineeringTasks: {
        title: "Tasks",
        intro: "",
        managerPrompt: "",
        tasks: [],
      },
      rituals: { title: "Rituals", intro: "", rituals: [] },
      engineeringResourceLibrary: {
        title: "Resources",
        intro: "",
        docs: [],
        references: {},
        keyPaths: [],
      },
    },
    ...overrides,
  };
}

describe("memory draft store", () => {
  let store: DraftStore;

  beforeEach(() => {
    store = makeMemoryDraftStore();
  });

  it("stores and retrieves a draft by user id", async () => {
    await store.create(samplePackage());
    const round = await store.get("UHIRE001");
    expect(round?.userId).toBe("UHIRE001");
    expect(round?.status).toBe("draft");
  });

  it("returns a deep-cloned copy so callers cannot mutate the store", async () => {
    await store.create(samplePackage());
    const first = await store.get("UHIRE001");
    first!.welcomeNote = "mutated";
    const second = await store.get("UHIRE001");
    expect(second?.welcomeNote).toBeUndefined();
  });

  it("lists drafts for a manager matching managerUserId", async () => {
    await store.create(samplePackage({ userId: "UHIRE001" }));
    await store.create(
      samplePackage({
        userId: "UHIRE002",
        managerUserId: "UOTHER",
        createdByUserId: "UOTHER",
        reviewerUserIds: ["UOTHER"],
      }),
    );
    const drafts = await store.listDraftsForManager("UMANAGER1");
    expect(drafts.map((p) => p.userId)).toEqual(["UHIRE001"]);
  });

  it("listPackagesManagedBy includes packages created by the user", async () => {
    await store.create(samplePackage({ userId: "UHIRE001" }));
    const listed = await store.listPackagesManagedBy("UMANAGER1");
    expect(listed).toHaveLength(1);
    expect(listed[0].userId).toBe("UHIRE001");
  });

  it("applyFieldPatch updates welcomeNote + mirrors into sections", async () => {
    await store.create(samplePackage());
    const patched = await store.applyFieldPatch("UHIRE001", {
      welcomeNote: "Welcome, Hira!",
    });
    expect(patched?.welcomeNote).toBe("Welcome, Hira!");
    expect(patched?.sections.welcome.personalizedNote).toBe("Welcome, Hira!");
  });

  it("applyFieldPatch returns undefined for a published package", async () => {
    await store.create(samplePackage({ status: "published" }));
    const patched = await store.applyFieldPatch("UHIRE001", {
      welcomeNote: "x",
    });
    expect(patched).toBeUndefined();
  });

  it("publish flips status to published and stamps publishedAt", async () => {
    await store.create(samplePackage());
    const result = await store.publish("UHIRE001", "UMANAGER1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pkg.status).toBe("published");
      expect(result.pkg.publishedByUserId).toBe("UMANAGER1");
      expect(typeof result.pkg.publishedAt).toBe("string");
    }
  });

  it("publish rejects non-managers", async () => {
    await store.create(samplePackage());
    const result = await store.publish("UHIRE001", "USOMEONE_ELSE");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_manager");
  });

  it("publish reports not_found for missing drafts", async () => {
    const result = await store.publish("U_MISSING", "UMANAGER1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});

describe("applyPatchInPlace", () => {
  it("patches stakeholderUserIds deduped with creator+manager+buddy", () => {
    const pkg = samplePackage({ buddyUserId: "UBUD001" });
    applyPatchInPlace(pkg, { stakeholderUserIds: ["UNEW", "UMANAGER1"] });
    expect(new Set(pkg.reviewerUserIds)).toEqual(
      new Set(["UMANAGER1", "UBUD001", "UNEW"]),
    );
  });

  it("syncs checklistRows into section items", () => {
    const pkg = samplePackage({
      sections: {
        ...samplePackage().sections,
        onboardingChecklist: {
          title: "",
          intro: "",
          sections: [
            {
              id: "week1-setup",
              title: "Week 1",
              goal: "",
              items: [{ label: "default", kind: "task", notes: "" }],
            },
          ],
        },
      },
    });
    applyPatchInPlace(pkg, {
      checklistRows: {
        "week1-setup": [{ label: "overridden", kind: "task", notes: "" }],
      },
    });
    expect(pkg.sections.onboardingChecklist.sections[0].items[0].label).toBe(
      "overridden",
    );
  });
});
