import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressStream } from "./ProgressStream";

describe("ProgressStream", () => {
  it("shows the connection status and an empty state", () => {
    render(<ProgressStream status="connecting" events={[]} />);

    expect(screen.getByText("connecting")).toBeInTheDocument();
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("renders event names and structured event data", () => {
    render(
      <ProgressStream
        status="open"
        events={[{ id: "event-1", event: "research.completed", data: { report_id: 7 } }]}
      />,
    );

    expect(screen.getByText("research.completed")).toBeInTheDocument();
    expect(screen.getByText(/"report_id": 7/)).toBeInTheDocument();
  });
});
