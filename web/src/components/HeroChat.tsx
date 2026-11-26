"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { SIGNATURE } from "@/lib/palette";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import { MASCOT_NAME } from "@/m7/config";
import { REPLIES, replyTopic, type ReplyTopic } from "@/m7/chatReplies";
import styles from "./HeroChat.module.css";

type Message = { author: "bot" | "visitor"; text: string };

const GREETING: Message = {
  author: "bot",
  text: `Hey, I’m ${MASCOT_NAME}. How’s your day going?`,
};
const MAX_MESSAGE_LENGTH = 400;

export default function HeroChat() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const timer = useRef<number | null>(null);
  const previousTopic = useRef<ReplyTopic>("general");
  const replyCounts = useRef<Partial<Record<ReplyTopic, number>>>({});
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  useEffect(() => {
    const log = transcript.current;
    if (log && followLatest.current) log.scrollTop = log.scrollHeight;
  }, [messages, isReplying]);

  useEffect(() => {
    const panel = dialog.current;
    const viewport = window.visualViewport;
    if (!panel || !viewport) return;

    const syncViewport = () => {
      if (!panel.open) return;
      const keyboardInset = viewport.scale === 1
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      panel.style.setProperty("--chat-keyboard-inset", `${keyboardInset}px`);
      panel.style.setProperty("--chat-viewport-height", keyboardInset ? `${viewport.height}px` : "100dvh");

      const log = transcript.current;
      if (log && followLatest.current) log.scrollTop = log.scrollHeight;
    };
    viewport.addEventListener("resize", syncViewport);
    viewport.addEventListener("scroll", syncViewport);
    return () => {
      viewport.removeEventListener("resize", syncViewport);
      viewport.removeEventListener("scroll", syncViewport);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function resetChat() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    followLatest.current = true;
    dialog.current?.style.removeProperty("--chat-keyboard-inset");
    dialog.current?.style.removeProperty("--chat-viewport-height");
    previousTopic.current = "general";
    replyCounts.current = {};
    setIsReplying(false);
    setMessages([GREETING]);
    setDraft("");
    launcher.current?.focus({ preventScroll: true });
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || timer.current !== null) return;

    const topic = replyTopic(text, previousTopic.current);
    const replies = REPLIES[topic];
    const turn = replyCounts.current[topic] ?? 0;
    const reply = replies[turn % replies.length];
    replyCounts.current[topic] = turn + 1;
    if (topic !== "hello" && topic !== "thanks") previousTopic.current = topic;

    followLatest.current = true;
    setMessages((current) => [...current, { author: "visitor", text }]);
    setDraft("");
    input.current?.focus({ preventScroll: true });

    if (prefersReducedMotion()) {
      setMessages((current) => [...current, { author: "bot", text: reply }]);
      return;
    }

    setIsReplying(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setMessages((current) => [...current, { author: "bot", text: reply }]);
      setIsReplying(false);
    }, 560);
  }

  return (
    <>
      <button
        ref={launcher}
        className={styles.launcher}
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          title.current?.focus({ preventScroll: true });
        }}
      >
        <span className={styles.indicator} aria-hidden="true" />
        Talk to {MASCOT_NAME}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="hxever-chat-title"
        onClose={resetChat}
      >
        <header className={styles.header}>
          <h2 ref={title} id="hxever-chat-title" tabIndex={-1}>{MASCOT_NAME}</h2>
          <button
            className={styles.close}
            type="button"
            aria-label="Close chat"
            onClick={() => dialog.current?.close()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div
          ref={transcript}
          className={styles.transcript}
          role="log"
          aria-label="Conversation"
          onScroll={({ currentTarget: log }) => {
            followLatest.current = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
          }}
        >
          {messages.map(({ author, text }, index) => (
            <p key={index} className={author === "bot" ? styles.reply : styles.visitor}>
              <span className={styles.srOnly}>{author === "bot" ? MASCOT_NAME : "You"}: </span>
              {text}
            </p>
          ))}
          {isReplying && (
            <div className={styles.thinking}>
              <ThinkingOrb
                state="working"
                size={32}
                theme="dark"
                color={SIGNATURE}
                aria-label={`${MASCOT_NAME} is thinking`}
              />
            </div>
          )}
        </div>
        <form className={styles.composer} onSubmit={sendMessage}>
          <label className={styles.srOnly} htmlFor="hxever-message">Your message</label>
          <input
            ref={input}
            id="hxever-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="Say something…"
          />
          <button type="submit" disabled={!draft.trim() || isReplying}>Send</button>
        </form>
      </dialog>
    </>
  );
}
