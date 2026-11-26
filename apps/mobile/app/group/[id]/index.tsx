import { formatMoney } from "@tabby/core";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { BalanceRow } from "../../../src/components/BalanceRow";
import { Banner, Button, Card, ErrorText, Field, screen } from "../../../src/components/ui";
import { flushOutbox, readOutbox } from "../../../src/lib/outbox";
import { deviceStorage } from "../../../src/lib/storage";
import { useClient } from "../../../src/session";
import { colors } from "../../../src/theme";
import { useRemote } from "../../../src/useRemote";

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useClient();
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [newMember, setNewMember] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Send anything saved while offline first, then fetch fresh numbers.
    await flushOutbox(deviceStorage, client).catch(() => undefined);
    const [group, expenses, balances] = await Promise.all([
      client.getGroup(id),
      client.listExpenses(id),
      client.getBalances(id),
    ]);
    return { group, expenses, balances };
  }, [client, id]);
  const remote = useRemote(`group-detail:${id}`, load);

  useFocusEffect(
    useCallback(() => {
      void readOutbox(deviceStorage).then((items) => setPending(items.filter((i) => i.groupId === id).length));
    }, [id, remote.data]),
  );

  if (!remote.data) {
    return remote.loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : <Text style={{ padding: 16 }}>{remote.error}</Text>;
  }
  const { group, expenses, balances } = remote.data;
  const nameOf = (memberId: string) => group.members.find((m) => m.id === memberId)?.name ?? "Someone";

  const addMember = async () => {
    setError(null);
    try {
      await client.addMember(id, newMember.trim());
      setNewMember("");
      await remote.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that person");
    }
  };

  const removeExpense = async (expenseId: string) => {
    setError(null);
    try {
      await client.deleteExpense(id, expenseId);
      await remote.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that expense");
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: group.name }} />
      {remote.offline ? <Banner text="You are offline. Showing the last saved numbers." /> : null}
      {pending > 0 ? <Banner text={`${pending} expense${pending === 1 ? "" : "s"} saved on this phone, waiting to upload.`} /> : null}
      <ErrorText text={error} />

      <Text style={screen.muted}>Invite code: {group.joinCode}</Text>

      <Text style={screen.heading}>Balances</Text>
      <Card>
        {balances.balances.map((b) => (
          <BalanceRow key={b.memberId} name={nameOf(b.memberId)} amount={b.amount} currency={group.currency} />
        ))}
      </Card>
      <Button label="Add expense" onPress={() => router.push({ pathname: "/group/[id]/add-expense", params: { id } })} />
      <Button kind="secondary" label="Split a receipt by items" onPress={() => router.push({ pathname: "/group/[id]/add-receipt", params: { id } })} />
      <Button kind="secondary" label="Settle up" onPress={() => router.push({ pathname: "/group/[id]/settle", params: { id } })} />

      <Text style={screen.heading}>Expenses</Text>
      {expenses.length === 0 ? <Text style={screen.muted}>Nothing yet.</Text> : null}
      {expenses.map((e) => (
        <Card key={e.id}>
          <View style={screen.row}>
            <Text style={{ fontWeight: "600", flex: 1 }}>{e.description}</Text>
            <Text style={{ fontWeight: "600" }}>{formatMoney(e.amount, group.currency)}</Text>
          </View>
          <View style={screen.row}>
            <Text style={screen.muted}>
              {nameOf(e.paidBy)} paid · {new Date(e.createdAt).toLocaleDateString()}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void removeExpense(e.id)}>
              <Text style={{ color: colors.owes }}>Delete</Text>
            </Pressable>
          </View>
        </Card>
      ))}

      <Text style={screen.heading}>People</Text>
      <Text style={screen.muted}>{group.members.map((m) => m.name).join(", ")}</Text>
      <View style={{ marginTop: 12 }}>
        <Field label="Add someone by name" value={newMember} onChangeText={setNewMember} placeholder="Sam" />
        <Button kind="secondary" label="Add person" disabled={!newMember.trim()} onPress={() => void addMember()} />
      </View>
    </ScrollView>
  );
}
