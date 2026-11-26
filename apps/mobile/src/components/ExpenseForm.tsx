import { formatMoney, type CreateExpenseBody, type Member } from "@tabby/core";
import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { buildExpenseBody, type ExpenseFormState, type SplitType } from "../lib/expenseForm";
import { colors } from "../theme";
import { Button, Chip, ErrorText, Field } from "./ui";

const SPLIT_LABELS: Record<SplitType, string> = {
  equal: "Equally",
  exact: "Exact amounts",
  shares: "Shares",
  percent: "Percent",
};

const VALUE_HINT: Partial<Record<SplitType, string>> = {
  exact: "amount",
  shares: "shares",
  percent: "%",
};

export function ExpenseForm({
  members,
  currency,
  defaultPayer,
  onSubmit,
}: {
  members: Member[];
  currency: string;
  defaultPayer?: string;
  onSubmit: (body: CreateExpenseBody) => void | Promise<void>;
}) {
  const [form, setForm] = useState<ExpenseFormState>(() => ({
    description: "",
    amountText: "",
    paidBy: defaultPayer ?? members[0]?.id ?? "",
    splitType: "equal",
    included: Object.fromEntries(members.map((m) => [m.id, true])),
    values: {},
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<ExpenseFormState>) => setForm((f) => ({ ...f, ...patch }));
  const preview = useMemo(() => buildExpenseBody(form, currency, "preview"), [form, currency]);
  const shareOf = (id: string) =>
    preview.ok ? preview.shares.find((s) => s.memberId === id)?.amount : undefined;

  const submit = async () => {
    const result = buildExpenseBody(form, currency);
    if (!result.ok) return setError(result.error);
    setError(null);
    setSaving(true);
    try {
      await onSubmit(result.body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Field label="What was it for?" value={form.description} onChangeText={(description) => set({ description })} placeholder="Groceries" />
      <Field
        label={`Amount (${currency})`}
        value={form.amountText}
        onChangeText={(amountText) => set({ amountText })}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      <Text style={{ color: colors.muted, marginBottom: 4 }}>Paid by</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
        {members.map((m) => (
          <Chip key={m.id} label={m.name} selected={form.paidBy === m.id} onPress={() => set({ paidBy: m.id })} />
        ))}
      </View>

      <Text style={{ color: colors.muted, marginBottom: 4 }}>Split</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
        {(Object.keys(SPLIT_LABELS) as SplitType[]).map((type) => (
          <Chip key={type} label={SPLIT_LABELS[type]} selected={form.splitType === type} onPress={() => set({ splitType: type })} />
        ))}
      </View>

      {members.map((m) => {
        const on = form.included[m.id] ?? false;
        const share = on ? shareOf(m.id) : undefined;
        return (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <View style={{ width: 110 }}>
              <Chip label={m.name} selected={on} onPress={() => set({ included: { ...form.included, [m.id]: !on } })} />
            </View>
            {on && form.splitType !== "equal" ? (
              <TextInput
                accessibilityLabel={`${m.name} ${VALUE_HINT[form.splitType]}`}
                value={form.values[m.id] ?? ""}
                onChangeText={(text) => set({ values: { ...form.values, [m.id]: text } })}
                placeholder={VALUE_HINT[form.splitType]}
                keyboardType="decimal-pad"
                style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 6, width: 80, marginRight: 8, backgroundColor: colors.card }}
              />
            ) : null}
            {share !== undefined ? <Text style={{ color: colors.muted }}>{formatMoney(share, currency)}</Text> : null}
          </View>
        );
      })}

      <ErrorText text={error} />
      <Button label={saving ? "Saving..." : "Save expense"} onPress={() => void submit()} disabled={saving} />
    </View>
  );
}
