import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationPanel } from "./ConversationPanel";

describe("ConversationPanel", () => {
  it("renders conversations, highlights the active item, and routes actions", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();

    render(
      <ConversationPanel
        conversations={[
          { id: 1, title: "Alpha", status: "idle", created_at: "", updated_at: "" },
          { id: 2, title: "Beta", status: "running", created_at: "", updated_at: "" },
        ]}
        activeId={2}
        onSelect={onSelect}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByRole("button", { name: /beta running/i })).toHaveClass("bg-zinc-900");
    expect(screen.getByRole("button", { name: /alpha idle/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /beta running/i })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("button", { name: /alpha idle/i }));
    await userEvent.click(screen.getByRole("button", { name: /^new$/i }));

    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
