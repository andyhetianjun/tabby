import { Redirect } from "expo-router";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { Button, ErrorText, Field, screen } from "../src/components/ui";
import { DEFAULT_API_URL, useSession } from "../src/session";

export default function SignIn() {
  const { session, signIn, startDemo } = useSession();
  const [name, setName] = useState("");
  const [url, setUrl] = useState(DEFAULT_API_URL);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Redirect href="/" />;

  const submit = async () => {
    if (!name.trim()) return setError("Enter your name.");
    setBusy(true);
    setError(null);
    try {
      await signIn(url, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.page} keyboardShouldPersistTaps="handled">
      <Text style={[screen.muted, { marginBottom: 16 }]}>
        There are no passwords. Enter a name and this phone gets its own token from the server.
      </Text>
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Andy" autoCapitalize="words" />
      <Field
        label="Server address"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.20:3000"
      />
      <ErrorText text={error} />
      <Button label={busy ? "Connecting..." : "Continue"} onPress={() => void submit()} disabled={busy} />
      <Text style={[screen.muted, { marginTop: 24, marginBottom: 8 }]}>
        No server? Try the app with a made-up group. Everything stays on this device.
      </Text>
      <Button kind="secondary" label="Try the demo" onPress={() => void startDemo()} />
    </ScrollView>
  );
}
