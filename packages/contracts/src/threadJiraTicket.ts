import * as Schema from "effect/Schema";

export const JiraTicketKey = Schema.String.check(
  Schema.isPattern(/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/),
  Schema.isMaxLength(128),
).annotate({
  description:
    "Uppercase Jira issue key, for example APP-123. Keys identify links within a thread.",
});

const JiraTicketUrl = Schema.String.check(
  Schema.isMaxLength(2048),
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /\/browse\/[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }),
);

export const ThreadJiraTicket = Schema.Struct({
  key: JiraTicketKey,
  relationship: Schema.Literals(["work_item", "related"]).annotate({
    description:
      "work_item: this thread implements the ticket. related: background or reference only. Never infer work_item from a mention.",
  }),
  url: Schema.optional(JiraTicketUrl),
}).check(
  Schema.makeFilter(
    (ticket) => ticket.url === undefined || ticket.url.endsWith(`/browse/${ticket.key}`),
  ),
);
export type ThreadJiraTicket = typeof ThreadJiraTicket.Type;

const isJiraTicketKey = Schema.is(JiraTicketKey);
const isThreadJiraTicket = Schema.is(ThreadJiraTicket);

export function parseJiraTicketReference(
  value: string,
): Pick<ThreadJiraTicket, "key" | "url"> | null {
  const reference = value.trim();
  const key = reference.toUpperCase();
  if (isJiraTicketKey(key)) return { key };
  try {
    const url = new URL(reference);
    const urlKey = url.pathname.split("/").at(-1) ?? "";
    const ticket = { key: urlKey, url: reference, relationship: "related" as const };
    return isThreadJiraTicket(ticket) ? { key: urlKey, url: reference } : null;
  } catch {
    return null;
  }
}

export const ThreadJiraTicketChange = Schema.Union([
  Schema.Struct({ action: Schema.Literal("link"), ticket: ThreadJiraTicket }),
  Schema.Struct({ action: Schema.Literal("unlink"), key: JiraTicketKey }),
]);
export type ThreadJiraTicketChange = typeof ThreadJiraTicketChange.Type;

export function applyThreadJiraTicketChange(
  tickets: ReadonlyArray<ThreadJiraTicket>,
  change: ThreadJiraTicketChange,
): ReadonlyArray<ThreadJiraTicket> {
  const key = change.action === "link" ? change.ticket.key : change.key;
  if (change.action === "unlink") return tickets.filter((ticket) => ticket.key !== key);
  const existing = tickets.find((ticket) => ticket.key === key);
  const ticket = { ...existing, ...change.ticket };
  return existing
    ? tickets.map((entry) => (entry.key === key ? ticket : entry))
    : [...tickets, ticket];
}
