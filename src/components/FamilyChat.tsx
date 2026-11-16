import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, RefreshCw, Cat, Smile, Paperclip, X } from "lucide-react";
import { ChatAttachments } from "./ChatAttachments";
import { CHAT_ACCEPT, checkFileInfo, type ChatFile } from "@/lib/chat-files";
import { uploadChatFileBrowser } from "@/lib/chat-upload";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { UserAvatar } from "./Avatar";
import {
  chatMessages,
  chatMessageSend,
  chatRead,
  chatUnread,
  chatReactionSave,
  chatDraftFiles,
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<ChatFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const uploadController = useRef<AbortController | null>(null);
  const drafts = useQuery({
    queryKey: ["chat-drafts", userId],
    queryFn: () => chatDraftFiles(),
    retry: false,
  });
  useEffect(() => () => uploadController.current?.abort(), []);
  const allDrafts = [...(drafts.data ?? []), ...uploads].filter(
    (f, i, a) => a.findIndex((x) => x.id === f.id) === i,
  );
  const uploadFiles = async (files: File[]) => {
    if (uploading) return;
    setUploadError("");
    try {
      if (files.length + allDrafts.length > 5)
        throw new Error("Egy üzenethez legfeljebb 5 fájl csatolható.");
      for (const f of files) checkFileInfo({ name: f.name, size: f.size, mime: f.type });
    } catch (e) {
      setUploadError((e as Error).message);
      return;
    }
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    const finished: ChatFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f) continue;
        const result = await uploadChatFileBrowser(
          f,
          (p) => setProgress(Math.round(((i + p / 100) / files.length) * 100)),
          controller.signal,
        );
        finished.push(result);
      }
      setUploads((v) => [...v, ...finished]);
    } catch (e) {
      for (const f of finished)
        await fetch(`/api/chat/file/${f.id}`, { method: "DELETE" }).catch(() => undefined);
      setUploadError((e as Error).message);
      void qc.invalidateQueries({ queryKey: ["chat-drafts", userId] });
    } finally {
      setUploading(false);
      setProgress(0);
      uploadController.current = null;
    }
  };
  const deleteFile = async (id: string) => {
    try {
      const r = await fetch(`/api/chat/file/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || "A fájl nem törölhető.");
      }
      setUploads((v) => v.filter((f) => f.id !== id));
      void qc.invalidateQueries({ queryKey: ["chat-drafts", userId] });
      void qc.invalidateQueries({ queryKey: ["chat-messages", userId] });
    } catch (e) {
      setUploadError((e as Error).message);
    }
  };
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
      setUploads([]);
      void qc.invalidateQueries({ queryKey: ["chat-drafts", userId] });
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
                  {m.text && <p>{m.text}</p>}
                  <ChatAttachments
                    files={m.attachments}
                    onDelete={m.mine && q.data?.canSend ? (id) => void deleteFile(id) : undefined}
                  />
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
          if (
            send.isPending ||
            uploading ||
            (!text.trim() && !allDrafts.length) ||
            allDrafts.some((f) => f.missing || f.deleted) ||
            q.isError ||
            !q.data?.canSend
          )
            return;
          const attachmentIds = allDrafts.map((f) => f.id);
          if (
            !request.current ||
            request.current.text !== text.trim() ||
            JSON.stringify(request.current.attachmentIds ?? []) !== JSON.stringify(attachmentIds)
          )
            request.current = {
              text: text.trim(),
              clientRequestId: crypto.randomUUID(),
              attachmentIds,
            };
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
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          tabIndex={-1}
          multiple
          accept={CHAT_ACCEPT}
          aria-label="Chat csatolmányok"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void uploadFiles(files);
          }}
        />
        {!!allDrafts.length && (
          <div className="chat-drafts">
            <ChatAttachments files={allDrafts} onDelete={(id) => void deleteFile(id)} />
            {allDrafts
              .filter((f) => f.missing)
              .map((f) => (
                <Button
                  key={f.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteFile(f.id)}
                >
                  Hiányos piszkozat törlése: {f.name}
                </Button>
              ))}
          </div>
        )}
        {uploadError && (
          <p className="chat-error" role="alert">
            {uploadError}
          </p>
        )}
        {uploading && (
          <div className="chat-upload-progress" role="status">
            <progress max={100} value={progress} />
            <span>Feltöltés {progress}%</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Feltöltés megszakítása"
              onClick={() => uploadController.current?.abort()}
            >
              <X size={18} />
            </Button>
          </div>
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
        <div className="chat-composer-tools">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fájl csatolása"
            title="Fájl csatolása"
            disabled={uploading || send.isPending || !q.data?.canSend}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={20} />
          </Button>
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
        </div>
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
          disabled={
            send.isPending ||
            uploading ||
            (!text.trim() && !allDrafts.length) ||
            allDrafts.some((f) => f.missing) ||
            q.isError ||
            !q.data?.canSend
          }
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
