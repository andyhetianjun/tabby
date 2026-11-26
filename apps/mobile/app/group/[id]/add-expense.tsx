import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { NetworkError } from "../../../src/api/client";
import { ExpenseForm } from "../../../src/components/ExpenseForm";
import { ErrorText, screen } from "../../../src/components/ui";
import { enqueueExpense } from "../../../src/lib/outbox";
import { deviceStorage } from "../../../src/lib/storage";
import { useClient } from "../../../src/session";
import { useRemote } from "../../../src/useRemote";

export default function AddExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const group = useRemote(`group:${id}`, useCallback(() => client.getGroup(id), [client, id]));

  if (!group.data) {
    return group.loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : <Text style={{ padding: 16 }}>{group.error}</Text>;
  }
  const { members, currency } = group.data;

  return (
    <ScrollView contentContainerStyle={screen.page} keyboardShouldPersistTaps="handled">
      <ErrorText text={error} />
      <ExpenseForm
        members={members}
        currency={currency}
        onSubmit={async (body) => {
          try {
            await client.createExpense(id, body);
          } catch (err) {
            if (!(err instanceof NetworkError)) {
              setError(err instanceof Error ? err.message : "Could not save");
              return;
            }
            // No connection: keep it on the phone and upload next time the group opens.
            await enqueueExpense(deviceStorage, { groupId: id, body });
          }
          router.back();
        }}
      />
    </ScrollView>
  );
}
