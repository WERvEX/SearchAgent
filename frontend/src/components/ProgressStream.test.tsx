import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressStream } from "./ProgressStream";

describe("ProgressStream", () => {
  it("shows the connection status and an empty state", () => {
    render(<ProgressStream status="connecting" events={[]} />);

    expect(screen.getByText("Connecting")).toBeInTheDocument();
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("renders a real research lifecycle event", () => {
    render(
      <ProgressStream
        status="open"
        events={[
          {
            id: "event-1",
            event: "research.plan_ready",
            data: {
              thread_id: "thread-1",
              conversation_id: 4,
              project_id: 7,
              option_count: 2,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("Plan ready")).toBeInTheDocument();
    expect(screen.getByText("2 plan options prepared")).toBeInTheDocument();
    expect(screen.queryByText(/thread-1/)).not.toBeInTheDocument();
  });

  it("falls back to a readable representation for unknown events", () => {
    render(<ProgressStream status="open" events={[{ id: "event-1", event: "other.event", data: { note: "Unknown" } }]} />);

    expect(screen.getByText("other.event")).toBeInTheDocument();
    expect(screen.getByText(/"note": "Unknown"/)).toBeInTheDocument();
  });
});
