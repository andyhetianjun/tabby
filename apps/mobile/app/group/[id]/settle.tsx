import { formatMoney } from "@tabby/core";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Banner, Button, Card, ErrorText, screen } from "../../../src/components/ui";
import { useClient } from "../../../src/session";
import { useRemote } from "../../../src/useRemote";

export default function Settle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useClient();
  const [error, setError] = useState<string | null>(null);
  const remote = useRemote(
    `settle:${id}`,
    useCallback(async () => {
      const [group, balances] = await Promise.all([client.getGroup(id), client.getBalances(id)]);
      return { group, balances };
    }, [client, id]),
  );

  if (!remote.data) {
    return remote.loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : <Text style={{ padding: 16 }}>{remote.error}</Text>;
  }
  const { group, balances } = remote.data;
  const nameOf = (memberId: string) => group.members.find((m) => m.id === memberId)?.name ?? "Someone";

  const markPaid = async (t: { from: string; to: string; amount: number }) => {
    setError(null);
    try {
      await client.createPayment(id, t);
      await remote.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that payment");
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.page}>
      {remote.offline ? <Banner text="You are offline. You can look, but recording a payment needs a connection." /> : null}
      <ErrorText text={error} />
      {balances.transfers.length === 0 ? <Text style={screen.muted}>Everyone is settled up.</Text> : null}
      {balances.transfers.length > 0 ? (
        <Text style={[screen.muted, { marginBottom: 8 }]}>
          {balances.transfers.length} payment{balances.transfers.length === 1 ? "" : "s"} settles everything.
        </Text>
      ) : null}
      {balances.transfers.map((t) => (
        <Card key={`${t.from}-${t.to}`}>
          <View style={screen.row}>
            <Text style={{ flex: 1 }}>
              {nameOf(t.from)} pays {nameOf(t.to)}
            </Text>
            <Text style={{ fontWeight: "700" }}>{formatMoney(t.amount, group.currency)}</Text>
          </View>
          <Button kind="secondary" label="Mark as paid" disabled={remote.offline} onPress={() => void markPaid(t)} />
        </Card>
      ))}
    </ScrollView>
  );
}
