import { describe, expect, it } from "vitest";

import { groupSessionsByUpdateDate } from "../src/services/sessionGroups";

describe("groupSessionsByUpdateDate", () => {
  it("groups sessions into Today, Yesterday, and dated buckets", () => {
    const now = new Date(2026, 9, 27, 12, 0, 0);

    const groups = groupSessionsByUpdateDate(
      [
        { id: "today", title: "Today", updatedAt: new Date(2026, 9, 27, 8).getTime() },
        { id: "yesterday", title: "Yesterday", updatedAt: new Date(2026, 9, 26, 23).getTime() },
        { id: "older", title: "Older", updatedAt: new Date(2026, 9, 25, 10).getTime() },
      ],
      now,
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "Oct 25, 2026"]);
    expect(groups[0]?.sessions.map((session) => session.id)).toEqual(["today"]);
  });

  it("sorts sessions by newest update time", () => {
    const now = new Date(2026, 9, 27, 12, 0, 0);

    const groups = groupSessionsByUpdateDate(
      [
        { id: "older", title: "Older", updatedAt: 1 },
        { id: "newer", title: "Newer", updatedAt: 2 },
      ],
      now,
    );

    expect(groups[0]?.sessions.map((session) => session.id)).toEqual(["newer", "older"]);
  });
});
