import React, { useState, useRef, useEffect } from 'react';
import { generateAIAdvice } from '../services/geminiService';
import { ChatMessage, ProcessingConfig, ImageFormat, Language } from '../types';
import { MessageSquare, Send, Bot, X, Sparkles } from 'lucide-react';
import { translations } from '../translations';

interface AssistantPanelProps {
  config: ProcessingConfig;
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

const AssistantPanel: React.FC<AssistantPanelProps> = ({ config, isOpen, onClose, language }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const t = translations[language];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: t.aiWelcome,
      timestamp: Date.now(),
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Update welcome message when language changes if it's the only message
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === 'welcome') {
      setMessages([{
        id: 'welcome',
        role: 'model',
        text: t.aiWelcome,
        timestamp: Date.now(),
      }]);
    }
  }, [language, t.aiWelcome]); // Removed messages from dependency to avoid infinite loops, simplistic check

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const context = {
      width: config.width,
      height: config.height,
      format: config.format === ImageFormat.JPG ? 'JPEG' : config.format === ImageFormat.PNG ? 'PNG' : 'WebP',
    };

    const responseText = await generateAIAdvice(userMsg.text, context, language);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, botMsg]);
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full md:w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200 transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5" />
          <h3 className="font-semibold">{t.aiTitle}</h3>
        </div>
        <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center space-x-2">
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t.aiPlaceholder}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500 flex items-center">
            <Sparkles className="w-3 h-3 mr-1 text-yellow-500" />
            {t.aiPowered}
        </div>
      </div>
    </div>
  );
};

export default AssistantPanel;