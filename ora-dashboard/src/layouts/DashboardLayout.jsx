import { MessageSquare, Brain, Settings } from "lucide-react";

export default function DashboardLayout({ children, activePage, onChangePage }) {
  const menuItems = [
    { id: "chat", label: "Chat", icon: <MessageSquare size={20} /> },
    { id: "memories", label: "Memórias", icon: <Brain size={20} /> },
    { id: "settings", label: "Configurações", icon: <Settings size={20} /> },
  ];

  return (
    <div className="flex min-h-screen bg-ora-bg text-ora-text">
      {/* Sidebar */}
      <aside className="w-64 bg-[#121212] border-r border-gray-800 p-4 flex flex-col">
        <h1 className="text-xl font-bold mb-6 text-ora-accent">ORA Dashboard</h1>
        <nav className="space-y-2 flex-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onChangePage(item.id)}
              className={`w-full flex items-center gap-3 p-2 rounded-lg transition ${
                activePage === item.id
                  ? "bg-ora-accent text-black"
                  : "hover:bg-gray-800 text-gray-300"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="text-xs text-gray-500 text-center mt-auto">
          ORA v1.0.0 — Online ✅
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-gray-800 flex items-center justify-between px-6">
          <h2 className="text-lg font-semibold">
            {menuItems.find((m) => m.id === activePage)?.label}
          </h2>
          <div className="text-sm text-gray-400">
            Usuário: <span className="text-ora-accent">#0001</span>
          </div>
        </header>

        {/* Área de conteúdo */}
        <section className="flex-1 p-6 overflow-y-auto">{children}</section>
      </main>
    </div>
  );
}
