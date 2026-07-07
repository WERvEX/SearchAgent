import { useState } from "react";
import { AppPanel, AppShell } from "./components/AppShell";

export default function App() {
  const [activePanel, setActivePanel] = useState<AppPanel>("research");

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      left={<div className="p-4 text-sm">No conversations yet</div>}
      main={<div className="p-6 text-sm">{activePanel === "settings" ? "Settings" : "Research workspace"}</div>}
      right={<div className="p-4 text-sm">Event stream</div>}
    />
  );
}
