import { useState } from "react";

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Olá! Sou o ORA 🧠. Em que posso te ajudar hoje?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3000/api/v1/device/context/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "00000000-0000-0000-0000-000000000001",
          query: input,
        }),
      });

      const data = await res.json();
      if (data.answer) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Desculpe, não consegui responder agora 😔" },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro ao conectar ao ORA 😵" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                msg.role === "user"
                  ? "bg-ora-accent text-black"
                  : "bg-gray-800 text-gray-200"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-gray-500 text-sm italic">ORA está pensando...</div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex border-t border-gray-800 p-3">
        <input
          type="text"
          placeholder="Digite sua mensagem..."
          className="flex-1 bg-transparent outline-none text-gray-200 placeholder-gray-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="ml-3 bg-ora-accent text-black px-4 py-2 rounded-lg font-medium hover:bg-green-400 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
