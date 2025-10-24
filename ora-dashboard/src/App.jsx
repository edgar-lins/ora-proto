import { useState } from "react";
import DashboardLayout from "./layouts/DashboardLayout";
import Chat from "./pages/Chat";
import Memories from "./pages/Memories";

export default function App() {
  const [activePage, setActivePage] = useState("chat");

  return (
    <DashboardLayout activePage={activePage} onChangePage={setActivePage}>
      {activePage === "chat" && <Chat />}
      {activePage === "memories" && <Memories />}
      {activePage === "settings" && <div>Configurações em breve ⚙️</div>}
    </DashboardLayout>
  );
}
