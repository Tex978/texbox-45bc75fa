import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, RefreshCw, Cat, Smile } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { UserAvatar } from "./Avatar";
import {
  chatMessages,
  chatMessageSend,
  chatRead,
  chatUnread,
  chatReactionSave,
} from "@/lib/chat.functions";
import {
  CAT_EMOJIS,
  CAT_LABELS,
  COMPOSER_EMOJIS,
  insertChatEmoji,
  type ChatSend,
  type ChatReaction,
} from "@/lib/chat-schema";

export function FamilyChat({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const status = useQuery({
    queryKey: ["chat-unread", userId],
    queryFn: () => chatUnread(),
    retry: false,
    refetchInterval: 15000,
  });
  const n = status.data?.unread ?? 0;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="app-bell"
        title="Családi chat"
        aria-label={n ? `Családi chat, ${n} olvasatlan` : "Családi chat"}
        onClick={() => setOpen(true)}
      >
        <MessageCircle size={19} />
        {n > 0 && <span className="app-bell-count">{n > 99 ? "99+" : n}</span>}
      </Button>
      <SheetContent className="family-chat" aria-describedby="chat-description">
        <SheetTitle className="chat-title">
          <Cat size={21} aria-hidden="true" />
          Családi chat
        </SheetTitle>
        <SheetDescription id="chat-description" className="sr-only">
          Közös családi beszélgetés
        </SheetDescription>
        {open && <ChatConversation key={userId} userId={userId} />}
      </SheetContent>
    </Sheet>
  );
}
function ChatConversation({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const sendFn = useServerFn(chatMessageSend),
    readFn = useServerFn(chatRead),
    reactFn = useServerFn(chatReactionSave);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiError, setEmojiError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const request = useRef<ChatSend | null>(null);
  const [cursor, setCursor] = useState<number | undefined>();
  const q = useQuery({
    queryKey: ["chat-messages", userId, cursor],
    queryFn: () => chatMessages({ data: { before: cursor } }),
    retry: false,
    refetchInterval: 10000,
  });
  const area = useRef<HTMLDivElement>(null);
  const scrolledThrough = useRef(0);
  const readThrough = useRef(0);
  const [readError, setReadError] = useState(false);
  const latest = q.data?.items.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!latest || q.isError || document.visibilityState !== "visible" || !document.hasFocus())
      return;
    if (latest !== scrolledThrough.current) {
      area.current?.scrollTo({ top: area.current.scrollHeight });
      scrolledThrough.current = latest;
    }
    if (latest <= readThrough.current) return;
    readThrough.current = latest;
    void readFn({ data: { through: latest } })
      .then(() => {
        setReadError(false);
        void qc.invalidateQueries({ queryKey: ["chat-unread", userId] });
      })
      .catch(() => {
        readThrough.current = 0;
        setReadError(true);
      });
  }, [latest, q.dataUpdatedAt, q.isError, qc, userId, readFn]);
  const send = useMutation({
    mutationFn: (data: ChatSend) => sendFn({ data }),
    onSuccess: () => {
      request.current = null;
      setText("");
      setCursor(undefined);
      void qc.invalidateQueries({ queryKey: ["chat-messages", userId] });
      void qc.invalidateQueries({ queryKey: ["chat-unread", userId] });
    },
  });
  const reaction = useMutation({
    mutationFn: (data: ChatReaction) => reactFn({ data }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["chat-messages", userId] });
    },
  });
  const rememberSelection = () => {
    const el = textarea.current;
    if (el) selection.current = { start: el.selectionStart, end: el.selectionEnd };
  };
  const insertEmoji = (emoji: string) => {
    const result = insertChatEmoji(text, selection.current.start, selection.current.end, emoji);
    if (result.text.length > 1000) {
      setEmojiError("Az üzenet legfeljebb 1000 karakter lehet.");
      return;
    }
    setText(result.text);
    send.reset();
    setEmojiError("");
    setEmojiOpen(false);
    selection.current = { start: result.cursor, end: result.cursor };
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(result.cursor, result.cursor);
    });
  };
  return (
    <>
      <div className="chat-messages" ref={area}>
        {q.isPending && <p role="status">Üzenetek betöltése…</p>}
        {q.isError ? (
          <div role="alert">
            <p>{q.error.message}</p>
            <Button variant="outline" onClick={() => void q.refetch()}>
              <RefreshCw size={16} />
              Újra
            </Button>
          </div>
        ) : (
          <>
            {cursor && (
              <Button variant="ghost" onClick={() => setCursor(undefined)}>
                Legújabb üzenetek
              </Button>
            )}
            {q.data?.olderCursor && (
              <Button variant="outline" onClick={() => setCursor(q.data?.olderCursor ?? undefined)}>
                Korábbi üzenetek
              </Button>
            )}
            {q.data?.items.length === 0 && (
              <div className="chat-empty">
                <span aria-hidden="true">🐾</span>
                <p>Még nincs üzenet.</p>
              </div>
            )}
            {q.data?.items.map((m) => (
              <article key={m.id} className={`chat-message ${m.mine ? "chat-mine" : ""}`}>
                <UserAvatar name={m.name} avatar={m.avatar} />
                <div>
                  <div className="chat-meta">
                    <strong>{m.name}</strong>
                    <time dateTime={new Date(m.createdAt).toISOString()}>
                      {new Date(m.createdAt).toLocaleString("hu-HU", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>{m.text}</p>
                  <div
                    className="chat-reactions"
                    role="group"
                    aria-label={`Reakciók: ${m.name}, ${m.id}. üzenet`}
                  >
                    {CAT_EMOJIS.map((emoji, i) => {
                      const votes = m.reactions.find((r) => r.emoji === emoji);
                      if (!q.data?.canSend && !votes) return null;
                      return (
                        <Button
                          key={emoji}
                          variant="ghost"
                          size="sm"
                          type="button"
                          aria-label={`${CAT_LABELS[i]} reakció, ${votes?.people.length ?? 0}`}
                          aria-pressed={m.myReaction === emoji}
                          title={
                            votes
                              ? `${CAT_LABELS[i]}: ${votes.people.map((p) => p.name).join(", ")}`
                              : CAT_LABELS[i]
                          }
                          disabled={reaction.isPending || !q.data?.canSend}
                          onClick={() =>
                            reaction.mutate({
                              messageId: m.id,
                              emoji: m.myReaction === emoji ? null : emoji,
                              version: m.reactionVersion,
                            })
                          }
                        >
                          <span aria-hidden="true">{emoji}</span>
                          {votes && <small>{votes.people.length}</small>}
                        </Button>
                      );
                    })}
                  </div>
                  {reaction.isError && reaction.variables?.messageId === m.id && (
                    <div className="chat-error" role="alert">
                      {reaction.error.message}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </>
        )}
      </div>
      {readError && (
        <p role="status" className="chat-error">
          Az olvasási jelzés nem mentődött; újrapróbáljuk.
        </p>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (send.isPending || !text.trim() || q.isError || !q.data?.canSend) return;
          if (!request.current || request.current.text !== text.trim())
            request.current = { text: text.trim(), clientRequestId: crypto.randomUUID() };
          send.mutate(request.current);
        }}
      >
        {send.isError && (
          <p role="alert" className="chat-error">
            {send.error.message} Az üzenet újraküldhető.
          </p>
        )}
        {q.data && !q.data.canSend && (
          <p className="chat-error">Gyermekfiókkal a chat egyelőre csak olvasható.</p>
        )}
        {emojiError && (
          <p role="alert" className="chat-error">
            {emojiError}
          </p>
        )}
        {emojiOpen && (
          <div
            id="chat-emojis"
            className="chat-emoji-picker"
            role="group"
            aria-label="Emojiválasztó"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setEmojiOpen(false);
                textarea.current?.focus();
              }
            }}
          >
            {COMPOSER_EMOJIS.map((emoji, i) => (
              <Button
                key={emoji}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Beszúrás: ${i < CAT_LABELS.length ? CAT_LABELS[i] : emoji}`}
                title={i < CAT_LABELS.length ? CAT_LABELS[i] : emoji}
                onClick={() => insertEmoji(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Emojiválasztó"
          title="Emojiválasztó"
          aria-expanded={emojiOpen}
          aria-controls="chat-emojis"
          disabled={send.isPending || q.isError || !q.data?.canSend}
          onPointerDown={rememberSelection}
          onClick={() => setEmojiOpen((v) => !v)}
        >
          <Smile size={21} />
        </Button>
        <label className="sr-only" htmlFor="chat-text">
          Üzenet
        </label>
        <textarea
          ref={textarea}
          id="chat-text"
          placeholder="Üzenet a családnak…"
          rows={2}
          maxLength={1000}
          value={text}
          onSelect={rememberSelection}
          onBlur={rememberSelection}
          disabled={send.isPending || q.isError || !q.data?.canSend}
          onChange={(e) => {
            setText(e.target.value);
            selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
            setEmojiError("");
            send.reset();
          }}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Üzenet küldése"
          title="Üzenet küldése"
          disabled={send.isPending || !text.trim() || q.isError || !q.data?.canSend}
        >
          <Send size={18} />
        </Button>
        {send.isPending && (
          <p className="chat-error" role="status">
            Küldés…
          </p>
        )}
      </form>
    </>
  );
}
