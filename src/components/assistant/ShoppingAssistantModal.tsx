import React, { useState } from 'react';
import { X, Sparkles, MessageSquare, Send, ArrowRight, Flame, ShieldAlert } from 'lucide-react';
import { aiService } from '../../services/aiService';
import { Product } from '../../types';

interface ShoppingAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProductById: (productId: string) => void;
}

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
  suggestedIds?: string[];
}

const STARTER_PROMPTS = [
  'I want something for a quiet evening.',
  'Which candle is more floral?',
  'How should I care for my candles?',
  'What should I gift a friend for their celebration?'
];

export const ShoppingAssistantModal: React.FC<ShoppingAssistantModalProps> = ({
  isOpen,
  onClose,
  onSelectProductById
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'assistant',
      text: 'Welcome. I am your Calm Flame concierge. How can I assist you with our scents, candles, or mindful rituals today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || isTyping) return;

    const userMsg: ChatMessage = { sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await aiService.askAssistant(textToSend);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: response.reply,
          suggestedIds: response.suggestedProducts
        }
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: 'The Calm Flame handcrafts candles and offerings rooted in India\'s botanical heritage to bring quiet presence to your space.'
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full sm:max-w-lg bg-[#FAF7F2] border border-[#E5DCCE] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[85vh] sm:h-[620px] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#2A2521] text-white flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
            </div>
            <div>
              <h3 className="text-sm font-serif font-bold text-[#1F1B18] tracking-tight">
                Ask The Calm Flame
              </h3>
              <p className="text-[10px] text-[#79716B]">Scent guidance & mindful concierge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-[#2A2521] text-white rounded-br-xs'
                    : 'bg-white text-[#4A2F22] border border-[#E5DCCE] rounded-bl-xs shadow-2xs'
                }`}
              >
                {m.text}
              </div>

              {/* Product recommendation chips if returned */}
              {m.suggestedIds && m.suggestedIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.suggestedIds.map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        onClose();
                        onSelectProductById(id);
                      }}
                      className="px-2.5 py-1 bg-[#F2ECE1] hover:bg-[#E5DCCE] border border-[#DBC4A9] rounded-lg text-[11px] font-semibold text-[#1F1B18] flex items-center gap-1 transition-colors"
                    >
                      <Flame className="w-3 h-3 text-[#D18D4D]" />
                      <span className="capitalize">{id.replace(/-/g, ' ')} &rarr;</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-1.5 text-xs text-[#79716B] p-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D18D4D] animate-ping" />
              <span>Contemplating...</span>
            </div>
          )}
        </div>

        {/* Starter Prompts */}
        {messages.length === 1 && (
          <div className="px-4 py-2 border-t border-[#E5DCCE]/60 bg-[#F2ECE1]/30">
            <span className="text-[10px] uppercase font-semibold text-[#79716B] block mb-1.5">
              Suggested Questions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(p)}
                  className="px-2.5 py-1 bg-white hover:bg-stone-50 text-[11px] text-[#65412E] rounded-full border border-[#DBC4A9] transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 sm:p-4 border-t border-[#E5DCCE] bg-white flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about scents, moods, rituals..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="p-2.5 bg-[#2A2521] hover:bg-[#4A2F22] disabled:opacity-50 text-white rounded-xl transition-colors"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
