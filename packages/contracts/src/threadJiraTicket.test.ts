import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  ThreadJiraTicket,
  groupThreadsByOwningJiraTickets,
  parseJiraTicketReference,
  applyThreadJiraTicketChange,
} from "./threadJiraTicket.ts";

describe("thread Jira tickets", () => {
  const decode = Schema.decodeUnknownSync(ThreadJiraTicket);

  it("accepts keys and Jira browse links, rejecting mismatched or unsafe links", () => {
    expect(decode({ key: "APP-12", relationship: "work_item" }).key).toBe("APP-12");
    expect(
      decode({
        key: "APP-12",
        relationship: "related",
        url: "https://example.atlassian.net/browse/APP-12",
      }).relationship,
    ).toBe("related");
    for (const url of [
      "javascript:alert(1)",
      "https://example.net/browse/APP-13",
      "https://user:password@example.net/browse/APP-12",
      "https://example.net/browse/APP-12?token=secret",
    ]) {
      expect(() => decode({ key: "APP-12", relationship: "related", url })).toThrow();
    }
    expect(() => decode({ key: "APP-12" })).toThrow();
    expect(() => decode({ key: "app-12", relationship: "work_item" })).toThrow();
  });

  it("parses ticket keys and browse URLs without treating ordinary text as links", () => {
    expect(parseJiraTicketReference(" app-12 ")).toEqual({ key: "APP-12" });
    expect(parseJiraTicketReference("https://example.net/jira/browse/APP-12")).toEqual({
      key: "APP-12",
      url: "https://example.net/jira/browse/APP-12",
    });
    expect(parseJiraTicketReference("see APP-12 for context")).toBeNull();
    expect(parseJiraTicketReference("https://example.net/browse/APP-12?token=secret")).toBeNull();
  });

  it("keeps multiple work items separate from context and reclassifies without duplicates", () => {
    const first = decode({
      key: "APP-1",
      relationship: "work_item",
      url: "https://example.net/browse/APP-1",
    });
    const second = decode({ key: "APP-2", relationship: "work_item" });
    const related = decode({ key: "APP-3", relationship: "related" });
    const tickets = [first, second, related];
    const moved = applyThreadJiraTicketChange(tickets, {
      action: "link",
      ticket: { key: "APP-1", relationship: "related" },
    });
    expect(moved).toEqual([{ ...first, relationship: "related" }, second, related]);
    expect(tickets[0]).toEqual(first);
    expect(
      applyThreadJiraTicketChange(moved, {
        action: "link",
        ticket: { key: "APP-1", relationship: "related" },
      }),
    ).toEqual(moved);
    expect(applyThreadJiraTicketChange(moved, { action: "unlink", key: "APP-2" })).toEqual([
      moved[0],
      related,
    ]);
    expect(applyThreadJiraTicketChange(moved, { action: "unlink", key: "APP-99" })).toEqual(moved);
  });
});

it("groups by the complete owning set, ignoring order, duplicates and related tickets", () => {
  const owner = (key: string) => ({ key, relationship: "work_item" as const });
  const threads = [
    { id: "pair", jiraTickets: [owner("APP-2"), owner("APP-1")] },
    { id: "single", jiraTickets: [owner("APP-1")] },
    {
      id: "same-pair",
      jiraTickets: [
        owner("APP-1"),
        owner("APP-2"),
        owner("APP-1"),
        { key: "APP-9", relationship: "related" as const },
      ],
    },
    { id: "related-only", jiraTickets: [{ key: "APP-1", relationship: "related" as const }] },
    { id: "empty", jiraTickets: [] },
  ];
  const groups = groupThreadsByOwningJiraTickets(threads, (thread) => thread.jiraTickets);
  expect(
    groups.map((group) => ({ label: group.label, ids: group.threads.map((thread) => thread.id) })),
  ).toEqual([
    { label: "APP-1 + APP-2", ids: ["pair", "same-pair"] },
    { label: "APP-1", ids: ["single"] },
    { label: "No owning Jira tickets", ids: ["related-only", "empty"] },
  ]);
  expect(threads[0]!.jiraTickets.map((ticket) => ticket.key)).toEqual(["APP-2", "APP-1"]);
  expect(groupThreadsByOwningJiraTickets([], () => undefined)).toEqual([]);
});
