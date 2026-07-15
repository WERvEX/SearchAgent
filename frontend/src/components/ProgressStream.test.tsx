import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressStream } from "./ProgressStream";

describe("ProgressStream", () => {
  it("shows the connection status and an empty state", () => {
    render(<ProgressStream status="connecting" events={[]} />);

    expect(screen.getByText("connecting")).toBeInTheDocument();
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("renders concise typed progress details", () => {
    render(
      <ProgressStream
        status="open"
        events={[
          {
            id: "event-1",
            event: "research.progress",
            data: {
              schema_version: 1,
              kind: "research.progress",
              occurred_at: "2026-07-15T10:30:00Z",
              thread_id: "thread-1",
              conversation_id: 4,
              project_id: 7,
              phase: "writing",
              message: "Drafting report",
              data: { section: "summary" },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("writing")).toBeInTheDocument();
    expect(screen.getByText("Drafting report")).toBeInTheDocument();
    expect(screen.queryByText(/schema_version/)).not.toBeInTheDocument();
  });

  it("falls back to a readable representation for unknown events", () => {
    render(<ProgressStream status="open" events={[{ id: "event-1", event: "other.event", data: { note: "Unknown" } }]} />);

    expect(screen.getByText("other.event")).toBeInTheDocument();
    expect(screen.getByText(/"note": "Unknown"/)).toBeInTheDocument();
  });
});
