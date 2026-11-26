import { formatMoney, type CreateExpenseBody, type Member } from "@tabby/core";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { buildReceiptExpense, type ReceiptFormState } from "../lib/receiptForm";
import { colors } from "../theme";
import { Button, Card, Chip, ErrorText, Field } from "./ui";

const blankItem = (members: Member[]) => ({ name: "", amountText: "", memberIds: members.slice(0, 1).map((m) => m.id) });

export function ReceiptForm({
  members,
  currency,
  onSubmit,
}: {
  members: Member[];
  currency: string;
  onSubmit: (body: CreateExpenseBody) => void | Promise<void>;
}) {
  const [form, setForm] = useState<ReceiptFormState>(() => ({
    description: "",
    paidBy: members[0]?.id ?? "",
    items: [blankItem(members)],
    taxText: "",
    tipText: "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<ReceiptFormState>) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (index: number, patch: Partial<ReceiptFormState["items"][number]>) =>
    set({ items: form.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) });
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
  const preview = useMemo(() => buildReceiptExpense(form, currency, "preview"), [form, currency]);

  const submit = async () => {
    const result = buildReceiptExpense(form, currency);
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
      <Field label="Where was it?" value={form.description} onChangeText={(description) => set({ description })} placeholder="Dinner at the noodle place" />

      <Text style={{ color: colors.muted, marginBottom: 4 }}>Paid by</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
        {members.map((m) => (
          <Chip key={m.id} label={m.name} selected={form.paidBy === m.id} onPress={() => set({ paidBy: m.id })} />
        ))}
      </View>

      <Text style={{ color: colors.muted, marginBottom: 4 }}>Items (tap names to choose who shared each one)</Text>
      {form.items.map((item, index) => (
        <Card key={index}>
          <Field label={`Item ${index + 1} name`} value={item.name} onChangeText={(name) => setItem(index, { name })} placeholder="Noodles" />
          <Field
            label={`Item ${index + 1} price`}
            value={item.amountText}
            onChangeText={(amountText) => setItem(index, { amountText })}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {members.map((m) => {
              const on = item.memberIds.includes(m.id);
              return (
                <Chip
                  key={m.id}
                  label={m.name}
                  selected={on}
                  onPress={() => setItem(index, { memberIds: on ? item.memberIds.filter((id) => id !== m.id) : [...item.memberIds, m.id] })}
                />
              );
            })}
          </View>
          {form.items.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => set({ items: form.items.filter((_, i) => i !== index) })}>
              <Text style={{ color: colors.owes, marginTop: 4 }}>Remove item {index + 1}</Text>
            </Pressable>
          ) : null}
        </Card>
      ))}
      <Button kind="secondary" label="Add another item" onPress={() => set({ items: [...form.items, blankItem(members)] })} />

      <View style={{ height: 12 }} />
      <Field label={`Tax (${currency})`} value={form.taxText} onChangeText={(taxText) => set({ taxText })} keyboardType="decimal-pad" placeholder="0.00" />
      <Field label={`Tip (${currency})`} value={form.tipText} onChangeText={(tipText) => set({ tipText })} keyboardType="decimal-pad" placeholder="0.00" />

      {preview.ok ? (
        <Card>
          <Text style={{ fontWeight: "600", marginBottom: 4 }}>Receipt total {formatMoney(preview.split.total, currency)}</Text>
          {preview.split.people.map((p) => (
            <Text key={p.memberId} style={{ color: colors.muted }}>
              {nameOf(p.memberId)}: {formatMoney(p.total, currency)} (items {formatMoney(p.items, currency)}, tax {formatMoney(p.tax, currency)}, tip {formatMoney(p.tip, currency)})
            </Text>
          ))}
        </Card>
      ) : null}

      <ErrorText text={error} />
      <Button label={saving ? "Saving..." : "Save receipt"} onPress={() => void submit()} disabled={saving} />
    </View>
  );
}
