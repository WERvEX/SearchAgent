import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationPanel } from "./ConversationPanel";

describe("ConversationPanel", () => {
  it("renders conversations, highlights the active item, and routes actions", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(true);
    const onCollapse = vi.fn();

    render(
      <ConversationPanel
        conversations={[
          { id: 1, title: "Alpha", status: "idle", created_at: "", updated_at: "" },
          { id: 2, title: "Beta", status: "running", created_at: "", updated_at: "" },
        ]}
        activeId={2}
        onSelect={onSelect}
        onCreate={onCreate}
        onRename={onRename}
        onDelete={onDelete}
        onCollapse={onCollapse}
      />,
    );

    expect(screen.getByRole("button", { name: /alpha idle/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /beta running/i })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("button", { name: /alpha idle/i }));
    await userEvent.click(screen.getByRole("button", { name: "Rename Alpha" }));
    await userEvent.clear(screen.getByLabelText("Conversation title"));
    await userEvent.type(screen.getByLabelText("Conversation title"), "Renamed conversation");
    await userEvent.click(screen.getByRole("button", { name: "Save title" }));
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    await userEvent.click(screen.getByRole("button", { name: "Collapse history" }));

    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onRename).toHaveBeenCalledWith(1, "Renamed conversation");
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCollapse).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Delete Alpha" }));
    expect(screen.getByText("Delete “Alpha” and all of its research data?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
