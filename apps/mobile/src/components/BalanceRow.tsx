import { formatMoney } from "@tabby/core";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function BalanceRow({ name, amount, currency }: { name: string; amount: number; currency: string }) {
  const settled = amount === 0;
  const text = settled ? "settled up" : amount > 0 ? `is owed ${formatMoney(amount, currency)}` : `owes ${formatMoney(-amount, currency)}`;
  return (
    <View style={styles.row}>
      <Text style={styles.name}>{name}</Text>
      <Text style={{ color: settled ? colors.muted : amount > 0 ? colors.owed : colors.owes }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  name: { fontWeight: "600", color: colors.text },
});
