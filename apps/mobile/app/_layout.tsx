import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PhoneFrame } from "../src/components/PhoneFrame";
import { DEMO_ONLY, SessionProvider } from "../src/session";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <PhoneFrame enabled={DEMO_ONLY}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Groups" }} />
          <Stack.Screen name="sign-in" options={{ title: "Tabby", headerBackVisible: false }} />
          <Stack.Screen name="group/[id]/index" options={{ title: "Group" }} />
          <Stack.Screen name="group/[id]/add-expense" options={{ title: "Add expense" }} />
          <Stack.Screen name="group/[id]/add-receipt" options={{ title: "Split a receipt" }} />
          <Stack.Screen name="group/[id]/settle" options={{ title: "Settle up" }} />
        </Stack>
      </PhoneFrame>
    </SessionProvider>
  );
}
