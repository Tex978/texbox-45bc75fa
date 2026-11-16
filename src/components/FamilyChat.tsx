import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { UserAvatar } from "./Avatar";
import { chatMessages, chatMessageSend, chatRead, chatUnread } from "@/lib/chat.functions";
import type { ChatSend } from "@/lib/chat-schema";

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
        <SheetTitle className="chat-title">Családi chat</SheetTitle>
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
    readFn = useServerFn(chatRead);
  const [text, setText] = useState("");
  const request = useRef<ChatSend | null>(null);
  const [cursor, setCursor] = useState<number | undefined>();
  const q = useQuery({
    queryKey: ["chat-messages", userId, cursor],
    queryFn: () => chatMessages({ data: { before: cursor } }),
    retry: false,
    refetchInterval: 10000,
  });
  const area = useRef<HTMLDivElement>(null);
  const readThrough = useRef(0);
  const [readError, setReadError] = useState(false);
  const latest = q.data?.items.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!latest || q.isError || document.visibilityState !== "visible" || !document.hasFocus())
      return;
    area.current?.scrollTo({ top: area.current.scrollHeight });
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
              <p className="text-muted-foreground">Még nincs üzenet.</p>
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
        <label className="sr-only" htmlFor="chat-text">
          Üzenet
        </label>
        <textarea
          id="chat-text"
          placeholder="Üzenet a családnak…"
          rows={2}
          maxLength={1000}
          value={text}
          disabled={send.isPending || q.isError || !q.data?.canSend}
          onChange={(e) => {
            setText(e.target.value);
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
