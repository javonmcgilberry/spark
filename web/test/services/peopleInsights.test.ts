import { describe, expect, it } from "vitest";
import { makeTestCtx } from "../helpers/makeTestCtx";
import {
  getInsight,
  getInsightWithHints,
  getInsightsForPeople,
} from "../../lib/services/peopleInsights";
import type { OnboardingPerson } from "../../lib/types";

const alice: OnboardingPerson = {
  name: "Alice Adams",
  role: "Engineer",
  discussionPoints: "Cool stuff.",
  weekBucket: "week1-2",
  email: "alice.adams@webflow.com",
  slackUserId: "UALICE",
};

describe("peopleInsights", () => {
  it("returns data-starved insight when both jira + github are unconfigured", async () => {
    const ctx = makeTestCtx();
    const insight = await getInsight(ctx, alice, "Frontend");
    expect(insight.dataStarved).toBe(true);
    expect(insight.recentTickets).toHaveLength(0);
    expect(insight.recentPRs).toHaveLength(0);
    expect(insight.attempts).toHaveLength(2);
    expect(insight.attempts[0].reason).toBe("not_configured");
    expect(insight.attempts[1].reason).toBe("not_configured");
  });

  it("merges jira + github data and lets llm produce a blurb", async () => {
    const ctx = makeTestCtx({
      jira: {
        configured: true,
        assignedToEmail: {
          "alice.adams@webflow.com": [
            {
              key: "WEB-1",
              summary: "Ship thing",
              status: "In Progress",
              url: "https://jira/browse/WEB-1",
            },
          ],
        },
      },
      github: {
        configured: true,
        openForUser: {
          "alice-adams": [
            {
              number: 42,
              title: "fix: thing",
              url: "https://github.com/webflow/webflow/pull/42",
              state: "open",
              author: "alice-adams",
              repository: "webflow/webflow",
              updatedAt: "2025-11-01T00:00:00Z",
              draft: false,
            },
          ],
        },
      },
      llm: {
        textResponses: [
          {
            match: /Ask me about/i,
            text: "Ask me about shipping features in the Frontend team.",
          },
        ],
        defaultText: "Ask me about shipping features in the Frontend team.",
      },
    });
    const insight = await getInsight(ctx, alice, "Frontend");
    expect(insight.dataStarved).toBe(false);
    expect(insight.recentTickets).toHaveLength(1);
    expect(insight.recentPRs).toHaveLength(1);
    expect(insight.askMeAbout).toContain("Ask me about");
  });

  it("honors jiraTicketKey hint in getInsightWithHints", async () => {
    const ctx = makeTestCtx({
      jira: {
        configured: true,
        byKey: {
          "WEB-99": {
            key: "WEB-99",
            summary: "Hinted ticket",
            status: "Open",
            url: "https://jira/browse/WEB-99",
          },
        },
      },
    });
    const insight = await getInsightWithHints(ctx, alice, "Frontend", {
      jiraTicketKey: "WEB-99",
    });
    expect(insight.recentTickets[0]?.key).toBe("WEB-99");
  });

  it("getInsightsForPeople returns one entry per person keyed by cache key", async () => {
    const ctx = makeTestCtx();
    const bob: OnboardingPerson = {
      ...alice,
      slackUserId: "UBOB",
      name: "Bob",
      email: "bob@webflow.com",
    };
    const result = await getInsightsForPeople(ctx, [alice, bob], "Frontend");
    expect(Object.keys(result)).toEqual(["ualice", "ubob"]);
  });
});
