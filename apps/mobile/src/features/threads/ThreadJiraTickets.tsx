import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { environmentServerConfigsAtom } from "../../state/server";
import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  AuthOrchestrationOperateScope,
  parseJiraTicketReference,
  type ScopedThreadRef,
  type ThreadJiraTicket,
  type ThreadJiraTicketChange,
} from "@t3tools/contracts";
import { AppText as Text } from "../../components/ui/AppText";
import { ListSection } from "../../components/ui/ListSection";
import { useThreadShell } from "../../state/entities";
import { useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

export function ThreadJiraTickets({ threadRef }: { threadRef: ScopedThreadRef }) {
  const configs = useAtomValue(environmentServerConfigsAtom);
  const supported =
    configs.get(threadRef.environmentId)?.environment.capabilities.threadJiraTickets === true;
  const thread = useThreadShell(threadRef);
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
    <ListSection title="Jira tickets">
      <View className="gap-3 p-4">
        {(["work_item", "related"] as const).map((group) => {
          const tickets = (thread.jiraTickets ?? []).filter(
            (ticket) => ticket.relationship === group,
          );
          return (
            <View key={group} className="gap-2">
              <Text className="text-sm font-semibold">
                {group === "work_item" ? "Work items" : "Related tickets"}
              </Text>
              {tickets.length === 0 ? (
                <Text className="text-xs text-foreground-muted">None linked</Text>
              ) : null}
              {tickets.map((ticket) => (
                <View key={ticket.key} className="flex-row items-center justify-between gap-2">
                  <Pressable
                    accessibilityRole={ticket.url ? "link" : "text"}
                    disabled={!ticket.url}
                    onPress={() => {
                      if (ticket.url) void tryOpenExternalUrl(ticket.url, "jira-ticket");
                    }}
                  >
                    <Text className="text-sm">{ticket.key}</Text>
                  </Pressable>
                  {canOperate ? (
                    <View className="flex-row gap-3">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${ticket.key} to ${group === "work_item" ? "related tickets" : "work items"}`}
                        disabled={pending}
                        onPress={() =>
                          void mutate({
                            action: "link",
                            ticket: {
                              ...ticket,
                              relationship: group === "work_item" ? "related" : "work_item",
                            },
                          })
                        }
                      >
                        <Text className="py-2 text-sm">Move</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Unlink ${ticket.key}`}
                        disabled={pending}
                        onPress={() => void mutate({ action: "unlink", key: ticket.key })}
                      >
                        <Text className="py-2 text-sm">Unlink</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
        {canOperate ? (
          <View className="gap-2">
            <TextInput
              maxLength={2048}
              accessibilityLabel="Jira ticket key or URL"
              placeholder="APP-123 or Jira browse URL"
              value={reference}
              onChangeText={setReference}
              editable={!pending}
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-lg border border-border-subtle px-3 py-2 text-foreground"
            />
            <View className="flex-row flex-wrap gap-4">
              {(["work_item", "related"] as const).map((group) => (
                <Pressable
                  key={group}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: relationship === group }}
                  disabled={pending}
                  onPress={() => setRelationship(group)}
                >
                  <Text className="py-2 text-sm">
                    {relationship === group ? "● " : "○ "}
                    {group === "work_item" ? "Work item" : "Related ticket"}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                disabled={!parsed || pending}
                accessibilityState={{ disabled: !parsed || pending }}
                onPress={() => {
                  if (parsed) void mutate({ action: "link", ticket: { ...parsed, relationship } });
                }}
              >
                <Text className="py-2 text-sm">Link ticket</Text>
              </Pressable>
            </View>
            {reference.trim() && !parsed ? (
              <Text className="text-xs text-foreground-muted">
                Enter a ticket key or a Jira /browse/ URL.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </ListSection>
  );
}
