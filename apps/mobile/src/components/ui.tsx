import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "../theme";

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, primary ? styles.primary : styles.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={{ color: primary ? colors.accentText : colors.accent, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} {...rest} />
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Banner({ text }: { text: string }) {
  return (
    <View style={styles.banner}>
      <Text style={{ color: colors.text }}>{text}</Text>
    </View>
  );
}

export function ErrorText({ text }: { text: string | null }) {
  return text ? <Text style={{ color: colors.owes, marginBottom: 8 }}>{text}</Text> : null;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={{ color: selected ? colors.accentText : colors.text }}>{label}</Text>
    </Pressable>
  );
}

export const screen = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48 },
  heading: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", marginTop: 20, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  muted: { color: colors.muted },
});

const styles = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: "center", marginVertical: 4 },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.accent, backgroundColor: "transparent" },
  label: { fontSize: 13, color: colors.muted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 10, padding: 10, fontSize: 16, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.line },
  banner: { backgroundColor: colors.warn, padding: 10, borderRadius: 8, marginBottom: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, marginRight: 6, marginBottom: 6 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
