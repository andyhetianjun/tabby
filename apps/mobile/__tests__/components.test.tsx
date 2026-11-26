import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BalanceRow } from "../src/components/BalanceRow";
import { ExpenseForm } from "../src/components/ExpenseForm";

describe("BalanceRow", () => {
  it("shows who is owed", async () => {
    await render(<BalanceRow name="Ann" amount={12345} currency="CAD" />);
    expect(screen.getByText("Ann")).toBeTruthy();
    expect(screen.getByText("is owed $123.45")).toBeTruthy();
  });
  it("shows who owes", async () => {
    await render(<BalanceRow name="Ben" amount={-500} currency="CAD" />);
    expect(screen.getByText("owes $5.00")).toBeTruthy();
  });
  it("shows settled", async () => {
    await render(<BalanceRow name="Cat" amount={0} currency="CAD" />);
    expect(screen.getByText("settled up")).toBeTruthy();
  });
});

describe("ExpenseForm", () => {
  const members = [
    { id: "a", name: "Ann", claimed: true },
    { id: "b", name: "Ben", claimed: false },
    { id: "c", name: "Cat", claimed: false },
  ];

  it("submits an equal split with the odd cent shown in the preview", async () => {
    const onSubmit = jest.fn();
    await render(<ExpenseForm members={members} currency="CAD" onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText("What was it for?"), "Pizza");
    await fireEvent.changeText(screen.getByLabelText("Amount (CAD)"), "10.00");
    expect(screen.getByText("$3.34")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save expense"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const body = onSubmit.mock.calls[0][0];
    expect(body).toMatchObject({
      description: "Pizza",
      amount: 1000,
      paidBy: "a",
      split: { type: "equal", memberIds: ["a", "b", "c"] },
    });
  });

  it("shows an error instead of submitting when exact amounts do not add up", async () => {
    const onSubmit = jest.fn();
    await render(<ExpenseForm members={members} currency="CAD" onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText("What was it for?"), "Dinner");
    await fireEvent.changeText(screen.getByLabelText("Amount (CAD)"), "30");
    await fireEvent.press(screen.getByText("Exact amounts"));
    await fireEvent.changeText(screen.getByLabelText("Ann amount"), "10");
    await fireEvent.changeText(screen.getByLabelText("Ben amount"), "10");
    await fireEvent.changeText(screen.getByLabelText("Cat amount"), "5");
    await fireEvent.press(screen.getByText("Save expense"));
    expect(await screen.findByText(/add up to/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks for a description first", async () => {
    const onSubmit = jest.fn();
    await render(<ExpenseForm members={members} currency="CAD" onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText("Save expense"));
    expect(await screen.findByText("Add a description.")).toBeTruthy();
  });
});
