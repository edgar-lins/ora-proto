import { useEffect, useState } from "react";
import { Search, Trash2, RefreshCcw } from "lucide-react";

export default function Memories() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const user_id = "00000000-0000-0000-0000-000000000001";

  // 🔹 Busca inicial
  async function fetchMemories() {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:3000/api/v1/device/memories/list/${user_id}`);
      const data = await res.json();
      setMemories(data.memories || []);
    } catch (err) {
      console.error("Erro ao buscar memórias:", err);
    } finally {
      setLoading(false);
    }
  }

  // 🔍 Busca semântica
  async function searchMemories() {
    try {
      setSearching(true);
      const res = await fetch("http://localhost:3000/api/v1/device/memories/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, query }),
      });
      const data = await res.json();
      setMemories(data.results || []);
    } catch (err) {
      console.error("Erro ao buscar memórias:", err);
    } finally {
      setSearching(false);
    }
  }

  // 🗑️ Excluir memória
  async function deleteMemory(id) {
    if (!confirm("Tem certeza que deseja excluir esta memória?")) return;
    try {
      await fetch(`http://localhost:3000/api/v1/device/memories/${id}`, { method: "DELETE" });
      setMemories((m) => m.filter((mem) => mem.id !== id));
    } catch (err) {
      console.error("Erro ao excluir memória:", err);
    }
  }

  useEffect(() => {
    fetchMemories();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar memórias..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-gray-200"
        />
        <button
          onClick={searchMemories}
          disabled={!query || searching}
          className="bg-ora-accent px-3 py-2 rounded-lg text-black font-semibold hover:opacity-90"
        >
          <Search size={16} />
        </button>
        <button
          onClick={fetchMemories}
          className="p-2 border border-gray-700 rounded-lg hover:bg-gray-800"
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Carregando memórias...</p>
      ) : memories.length === 0 ? (
        <p className="text-gray-500">Nenhuma memória encontrada 💤</p>
      ) : (
        <ul className="space-y-3">
          {memories.map((m) => (
            <li
              key={m.id}
              className="border border-gray-800 rounded-lg p-4 bg-gray-900 hover:bg-gray-800 transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-ora-accent font-semibold">{m.summary}</h3>
                  <p className="text-gray-300 text-sm mt-1">{m.content}</p>
                  {m.tags?.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {m.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-xs bg-gray-800 px-2 py-1 rounded-lg text-gray-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteMemory(m.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
