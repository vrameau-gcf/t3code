import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { environmentServerConfigsAtom } from "~/state/server";
import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";
import {
  AuthOrchestrationOperateScope,
  parseJiraTicketReference,
  type ScopedThreadRef,
  type ThreadJiraTicket,
  type ThreadJiraTicketChange,
} from "@t3tools/contracts";
import { useQuietThreadShell } from "~/state/entities";
import { useEnvironmentScope } from "~/state/session";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

export function ThreadJiraTicketsPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const configs = useAtomValue(environmentServerConfigsAtom);
  const supported =
    configs.get(threadRef.environmentId)?.environment.capabilities.threadJiraTickets === true;
  const thread = useQuietThreadShell(threadRef);
  const canOperate = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const update = useAtomCommand(threadEnvironment.updateMetadata, "update Jira ticket link");
  const [reference, setReference] = useState("");
  const [relationship, setRelationship] = useState<ThreadJiraTicket["relationship"]>("work_item");
  const [pending, setPending] = useState(false);
  const parsed = parseJiraTicketReference(reference);
  const mutate = async (jiraTicketChange: ThreadJiraTicketChange) => {
    if (pending || !canOperate || !supported) return;
    setPending(true);
    try {
      const result = await update({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId, jiraTicketChange },
      });
      if (result._tag === "Success" && jiraTicketChange.action === "link") setReference("");
    } finally {
      setPending(false);
    }
  };
  if (!thread || !supported) return null;
  return (
    <ThreadDetailsSection headingId="thread-jira-tickets-heading" title="Jira tickets">
      <div className="flex flex-col gap-3 px-1.5">
        {(["work_item", "related"] as const).map((group) => {
          const tickets = (thread.jiraTickets ?? []).filter(
            (ticket) => ticket.relationship === group,
          );
          return (
            <div key={group} className="flex flex-col gap-1">
              <h4 className="text-xs font-medium">
                {group === "work_item" ? "Work items" : "Related tickets"}
              </h4>
              {tickets.length === 0 ? (
                <p className="text-xs text-muted-foreground">None linked</p>
              ) : null}
              {tickets.map((ticket) => (
                <div key={ticket.key} className="flex items-center justify-between gap-2">
                  {ticket.url ? (
                    <a
                      href={ticket.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      {ticket.key}
                    </a>
                  ) : (
                    <span className="text-xs">{ticket.key}</span>
                  )}
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!canOperate || pending}
                      onClick={() =>
                        void mutate({
                          action: "link",
                          ticket: {
                            ...ticket,
                            relationship: group === "work_item" ? "related" : "work_item",
                          },
                        })
                      }
                      aria-label={`Move ${ticket.key} to ${group === "work_item" ? "related tickets" : "work items"}`}
                    >
                      Move
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!canOperate || pending}
                      onClick={() => void mutate({ action: "unlink", key: ticket.key })}
                      aria-label={`Unlink ${ticket.key}`}
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {canOperate ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (parsed) void mutate({ action: "link", ticket: { ...parsed, relationship } });
            }}
          >
            <Input
              maxLength={2048}
              size="compact"
              aria-label="Jira ticket key or URL"
              placeholder="APP-123 or Jira browse URL"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={pending}
            />
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={relationship}
                  onValueChange={(value) =>
                    setRelationship(value === "related" ? "related" : "work_item")
                  }
                  disabled={pending}
                >
                  <SelectTrigger size="compact" aria-label="Jira ticket relationship">
                    <SelectValue>
                      {relationship === "work_item" ? "Work item" : "Related ticket"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="work_item">Work item</SelectItem>
                    <SelectItem value="related">Related ticket</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
              <Button type="submit" size="xs" variant="outline" disabled={!parsed || pending}>
                Link ticket
              </Button>
            </div>
            {reference.trim() && !parsed ? (
              <p role="status" className="text-xs text-muted-foreground">
                Enter a ticket key or a Jira /browse/ URL.
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}
