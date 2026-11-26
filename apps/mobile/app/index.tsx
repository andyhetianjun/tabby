import { Redirect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Banner, Button, Card, ErrorText, Field, screen } from "../src/components/ui";
import { useClient, useSession } from "../src/session";
import { useRemote } from "../src/useRemote";

export default function GroupList() {
  const { ready, session } = useSession();
  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!session) return <Redirect href="/sign-in" />;
  return <Groups userName={session.userName} demo={session.demo === true} />;
}

function Groups({ userName, demo }: { userName: string; demo: boolean }) {
  const client = useClient();
  const { signOut, resetDemo, demoOnly } = useSession();
  const router = useRouter();
  const groups = useRemote("groups", useCallback(() => client.listGroups(), [client]));
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ id: string }>) => {
    setError(null);
    try {
      const group = await action();
      router.push({ pathname: "/group/[id]", params: { id: group.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.page} keyboardShouldPersistTaps="handled">
      {demo ? (
        <Banner text="Demo mode: no server. The people and amounts are made up and are saved only on this device." />
      ) : (
        <Text style={screen.muted}>Signed in as {userName}</Text>
      )}
      {groups.offline ? <Banner text="You are offline. Showing the last saved list." /> : null}
      <ErrorText text={error ?? groups.error} />

      <Text style={screen.heading}>Your groups</Text>
      {groups.loading ? <ActivityIndicator /> : null}
      {groups.data?.length === 0 ? <Text style={screen.muted}>No groups yet. Create one below.</Text> : null}
      {groups.data?.map((g) => (
        <Pressable key={g.id} onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.id } })}>
          <Card>
            <View style={screen.row}>
              <Text style={{ fontWeight: "600", fontSize: 16 }}>{g.name}</Text>
              <Text style={screen.muted}>{g.currency}</Text>
            </View>
          </Card>
        </Pressable>
      ))}

      <Text style={screen.heading}>New group</Text>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Apartment 4B" />
      <Field label="Currency" value={currency} onChangeText={(t) => setCurrency(t.toUpperCase())} maxLength={3} autoCapitalize="characters" />
      <Button
        label="Create group"
        disabled={!name.trim() || currency.length !== 3}
        onPress={() => void run(() => client.createGroup({ name, currency }))}
      />

      <Text style={screen.heading}>Join with a code</Text>
      <Field label="Invite code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="A1B2C3D4" />
      <Button kind="secondary" label="Join group" disabled={code.trim().length < 4} onPress={() => void run(() => client.joinGroup(code.trim()))} />

      <View style={{ marginTop: 24 }}>
        {demo ? <Button kind="secondary" label="Reset demo data" onPress={() => void resetDemo()} /> : null}
        {demoOnly ? null : <Button kind="secondary" label={demo ? "Leave demo" : "Sign out"} onPress={() => void signOut()} />}
      </View>
    </ScrollView>
  );
}
