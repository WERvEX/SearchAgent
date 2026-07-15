import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api/client";

vi.mock("./api/client", () => ({
  api: {
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    startResearch: vi.fn(),
    resumeResearch: vi.fn(),
    listLLMProfiles: vi.fn(),
  },
}));

const conversation = {
  id: 4,
  title: "Search API evaluation",
  status: "idle",
  created_at: "",
  updated_at: "",
};

const conversationDetail = { ...conversation, messages: [], projects: [] };
const profile = {
  id: 7,
  name: "Default profile",
  provider: "openai",
  base_url: null,
  model: "gpt-5",
  api_key: "",
  params: null,
  is_default: true,
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listConversations).mockResolvedValue([conversation]);
    vi.mocked(api.listLLMProfiles).mockResolvedValue([profile]);
    vi.mocked(api.getConversation).mockResolvedValue(conversationDetail);
  });

  it("maps the backend interrupted plan payload and submits the selected approval", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: {
          summary: "Compare search APIs by cost and quality.",
          options: [
            { id: "A", label: "Cost-focused comparison" },
            { id: "B", label: "Quality-focused comparison" },
          ],
        },
      },
    });
    vi.mocked(api.resumeResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: false,
      interrupt_payload: null,
    });

    render(<App />);

    await screen.findByText("Search API evaluation");
    await user.type(screen.getByLabelText("Research request"), "Compare search APIs");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Compare search APIs by cost and quality.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Quality-focused comparison"));
    await user.click(screen.getByRole("button", { name: /approve plan/i }));

    await waitFor(() =>
      expect(api.resumeResearch).toHaveBeenCalledWith("thread-1", {
        profile_id: 7,
        decision: { approved: true, chosen_option: "B" },
      }),
    );
  });

  it("does not start another research request while a plan decision is pending", async () => {
    const user = userEvent.setup();
    vi.mocked(api.startResearch).mockResolvedValue({
      thread_id: "thread-1",
      state: {},
      interrupted: true,
      interrupt_payload: {
        plan: { summary: "Choose a scope.", options: [{ id: "A", label: "Broad scope" }] },
      },
    });

    render(<App />);

    await screen.findByText("Search API evaluation");
    const request = screen.getByLabelText("Research request");
    await user.type(request, "First request");
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Choose a scope.");

    await user.type(request, "Second request");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(api.startResearch).toHaveBeenCalledTimes(1);
  });
});
