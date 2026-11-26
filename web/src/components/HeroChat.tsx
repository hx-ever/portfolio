"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./HeroChat.module.css";

const MOODS = [
  {
    label: "I’m overwhelmed",
    replies: [
      "If today feels like too much, make the next step smaller. One email, one glass of water, one deep breath. Any of those counts.",
      "Give yourself a minute away from the thing that’s wearing you out. It’ll still be there when you get back, and you’ll have had a minute to yourself.",
      "If the whole list feels impossible, choose one thing to leave for tomorrow. That’s a decision you can make right now.",
    ],
  },
  {
    label: "I’m doubting myself",
    replies: [
      "Think of something you used to find hard that you can do now. You probably got there one awkward try at a time. This can be another one of those tries.",
      "One rough attempt tells you how that attempt went. Give yourself room to try again with what you learned.",
      "You can be nervous and still take the next step. Confidence often shows up after you’ve started.",
    ],
  },
  {
    label: "I could use a little cheer",
    replies: [
      "Here’s a tiny robot cheering for you. Imagine me giving you two very shiny thumbs up.",
      "I hope the next good thing today is something small and unexpected. The perfect song on shuffle would be a solid start.",
      "For your next five minutes, I vote for water, a stretch, or the song you always play twice. Pick whichever sounds nicest.",
    ],
  },
] as const;

export default function HeroChat() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const choices = useRef<HTMLHeadingElement>(null);
  const [selection, setSelection] = useState<{ mood: number; reply: number } | null>(null);
  const active = selection === null ? null : MOODS[selection.mood];

  function selectMood(mood: number) {
    setSelection({ mood, reply: 0 });
  }

  function nextReply() {
    setSelection((current) =>
      current && {
        ...current,
        reply: (current.reply + 1) % MOODS[current.mood].replies.length,
      }
    );
  }

  // Move focus only when the available buttons change. New replies are
  // announced by the live region while focus stays on "One more".
  const focusChoices = useCallback((element: HTMLHeadingElement | null) => {
    choices.current = element;
    if (element && dialog.current?.open) element.focus();
  }, []);

  const focusReplyActions = useCallback((element: HTMLDivElement | null) => {
    element?.querySelector("button")?.focus();
  }, []);

  return (
    <>
      <button
        ref={launcher}
        className={styles.launcher}
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          choices.current?.focus();
        }}
      >
        <span className={styles.indicator} aria-hidden="true" />
        Talk to m_7
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="m7-chat-title"
        onClose={() => {
          setSelection(null);
          launcher.current?.focus({ preventScroll: true });
        }}
      >
        <header className={styles.header}>
          <h2 id="m7-chat-title">m_7</h2>
          <button
            className={styles.close}
            type="button"
            aria-label="Close chat"
            onClick={() => dialog.current?.close()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className={styles.body}>
          {selection && active ? (
            <p className={styles.visitor}>{active.label}</p>
          ) : (
            <h3 ref={focusChoices} tabIndex={-1} className={styles.prompt}>
              Hey, I’m m_7. How’s your day going?
            </h3>
          )}
          <div role="status" aria-atomic="true">
            {selection && active && <p className={styles.reply}>{active.replies[selection.reply]}</p>}
          </div>
          {selection ? (
            <div ref={focusReplyActions} className={styles.actions}>
              <button type="button" onClick={nextReply}>One more</button>
              <button type="button" onClick={() => setSelection(null)}>Pick another mood</button>
            </div>
          ) : (
            <div className={styles.actions}>
              {MOODS.map(({ label }, index) => (
                <button key={label} type="button" onClick={() => selectMood(index)}>{label}</button>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
