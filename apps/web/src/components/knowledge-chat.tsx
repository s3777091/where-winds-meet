"use client";

import {
  ArrowSquareOut,
  BookOpenText,
  ChatCircleDots,
  PaperPlaneTilt,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createClient } from "@/utils/supabase/client";

type ChatSource = {
  id: string;
  citation?: number;
  title: string;
  url: string;
  source: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  sources?: ChatSource[];
  error?: boolean;
};

const SUGGESTIONS = [
  "Câu đố chuông Blind to the World giải thế nào?",
  "Echoes of Old Battles bị kẹt ở bức tường",
  "Tìm cách mở khóa Meridian Touch",
];

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Mô tả nhiệm vụ, câu đố, NPC hoặc vật phẩm đang làm bạn mắc kẹt. Mình chỉ trả lời từ dữ liệu đã lập chỉ mục và luôn kèm nguồn kiểm tra.",
};

export function KnowledgeChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function scrollToLatest() {
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setPending(true);
    scrollToLatest();

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { answer?: string; sources?: ChatSource[]; detail?: string }
        | null;

      if (!response.ok || !payload?.answer) {
        throw new Error(payload?.detail ?? "Trợ lý chưa thể trả lời lúc này.");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload.answer!,
          sources: payload.sources ?? [],
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Trợ lý chưa thể trả lời lúc này.",
          error: true,
        },
      ]);
    } finally {
      setPending(false);
      scrollToLatest();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.replace("/login");
  }

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {open ? (
        <section
          aria-label="Trợ lý giải đố"
          className="pointer-events-auto absolute inset-2 flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[var(--line-strong)] bg-[rgb(12_18_24/0.98)] shadow-[0_24px_80px_rgb(2_7_12/0.58)] sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(720px,calc(100dvh-2rem))] sm:w-[420px]"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[var(--accent)] text-[var(--accent-ink)]">
              <Sparkle size={20} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Giang hồ vấn đáp</span>
              <span className="mt-0.5 block text-[10px] text-[var(--muted)]">Neo4j KB, câu trả lời có trích nguồn</span>
            </span>
            <button
              type="button"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={() => void signOut()}
              className="grid size-9 place-items-center rounded-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
            >
              <ArrowSquareOut size={18} weight="bold" />
            </button>
            <button
              type="button"
              aria-label="Đóng trợ lý"
              onClick={() => setOpen(false)}
              className="grid size-9 place-items-center rounded-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
            >
              <X size={18} weight="bold" />
            </button>
          </header>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
            <div className="space-y-4">
              {messages.map((message) => (
                <article key={message.id} className={message.role === "user" ? "ml-10" : "mr-5"}>
                  <div
                    className={`rounded-[14px] px-3.5 py-3 text-[13px] leading-5 ${
                      message.role === "user"
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : message.error
                          ? "border border-[var(--danger)]/35 bg-[var(--danger)]/10 text-[#f2b2b2]"
                          : "border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]"
                    }`}
                  >
                    {message.content}
                  </div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {message.sources.map((source, index) => (
                        <a
                          key={source.id}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start gap-2 rounded-[10px] border border-[var(--line)] px-2.5 py-2 text-[10px] leading-4 text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                        >
                          <BookOpenText size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                          <span className="min-w-0">
                            <span className="block font-semibold text-[var(--text)]">
                              S{source.citation ?? index + 1}. {source.title}
                            </span>
                            <span className="block truncate">{source.source}</span>
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}

              {pending && (
                <div className="mr-16 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="skeleton h-3 w-4/5 rounded-full" />
                  <div className="skeleton mt-2 h-3 w-3/5 rounded-full" />
                  <span className="sr-only">Đang tìm trong kho tri thức</span>
                </div>
              )}
            </div>
          </div>

          {messages.length === 1 && (
            <div className="shrink-0 px-4 pb-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void ask(suggestion)}
                    className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="shrink-0 border-t border-[var(--line)] p-3">
            <label htmlFor="knowledge-question" className="sr-only">Câu hỏi về Where Winds Meet</label>
            <div className="flex items-end gap-2 rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface)] p-2 focus-within:border-[var(--accent)]">
              <textarea
                id="knowledge-question"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={1200}
                placeholder="Bạn đang mắc ở nhiệm vụ nào?"
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[13px] leading-5 text-[var(--text)] outline-none placeholder:text-[var(--subtle)]"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                aria-label="Gửi câu hỏi"
                className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[var(--accent)] text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <PaperPlaneTilt size={18} weight="fill" />
              </button>
            </div>
            <p className="mt-2 px-1 text-[9px] leading-4 text-[var(--subtle)]">
              Trợ lý có thể chưa biết dữ liệu mới. Hãy mở nguồn trước khi làm thay đổi khó hoàn tác trong game.
            </p>
          </form>
        </section>
      ) : (
        <button
          type="button"
          aria-label="Hỏi cách giải"
          title="Hỏi cách giải"
          onClick={() => setOpen(true)}
          className="pointer-events-auto absolute bottom-4 right-4 flex h-12 items-center gap-2 rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_48%,var(--line))] bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_18px_50px_rgb(2_7_12/0.48)] transition hover:-translate-y-0.5 hover:bg-[var(--accent-strong)] active:translate-y-px"
        >
          <ChatCircleDots size={21} weight="fill" />
          <span className="hidden sm:inline">Hỏi cách giải</span>
        </button>
      )}
    </div>
  );
}
