import type { ReactNode } from "react";
import { Platform, Text, useWindowDimensions, View } from "react-native";
import { colors } from "../theme";

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 780;

/**
 * On a wide web page (the public demo), show the app inside a phone-sized frame so it
 * looks the way it does on a phone. On a real phone, or a narrow browser window, it does nothing.
 */
export function PhoneFrame({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const { width, height } = useWindowDimensions();
  if (!enabled || Platform.OS !== "web" || width < 600) return <>{children}</>;
  const frameHeight = Math.min(PHONE_HEIGHT, Math.max(480, height - 32));
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#e7e5e0" }}>
      <View
        style={{
          width: PHONE_WIDTH,
          height: frameHeight,
          borderRadius: 36,
          borderWidth: 10,
          borderColor: "#1f2328",
          overflow: "hidden",
          backgroundColor: colors.bg,
        }}
      >
        {children}
      </View>
      <Text style={{ color: colors.muted, marginTop: 10, fontSize: 12 }}>
        Demo with made-up data. Nothing leaves your browser.
      </Text>
    </View>
  );
}
