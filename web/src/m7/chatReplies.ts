export const REPLIES = {
  overwhelmed: [
    "That sounds like a lot. If you could make the next step a little smaller, what would it be?",
    "You can leave some things unfinished today. Taking a minute to yourself counts, too.",
    "If your list is endless, try picking one thing to leave for tomorrow. That's one decision you can make right now.",
  ],
  doubt: [
    "Think of something that used to feel hard and comes a little easier now. You probably got there one awkward try at a time.",
    "One rough attempt tells you how that attempt went. You get to try again with what you learned.",
    "You can feel unsure and still take the next step. Confidence often shows up after you've started.",
  ],
  low: [
    "I hope today gets a little lighter. Is there something small you could do just for yourself?",
    "A rough day can take a lot out of you. It's okay to give yourself a quiet moment.",
    "For the next five minutes, I vote for a stretch, a glass of water, or a song you always play twice. Whatever sounds nicest.",
  ],
  good: [
    "I'm glad there was a bright spot. What made today a good one?",
    "That's worth taking a minute to enjoy. Tiny robot high five from me.",
  ],
  thanks: [
    "You're welcome. Sending one tiny robot thumbs-up your way.",
    "Anytime. I hope there's something good waiting for you in the rest of your day.",
  ],
  hello: [
    "Hey! What's been on your mind today?",
    "Hi again. Pull up a chair if you want to stay a minute.",
  ],
  general: [
    "Here's a little encouragement from me. Whatever pace you're going today, there's room for a pause.",
    "I hope something small makes you smile today. The perfect song on shuffle would be a good start.",
    "If you could do one kind thing for your future self today, what would it be?",
  ],
};

export type ReplyTopic = keyof typeof REPLIES;

export function replyTopic(message: string, previous: ReplyTopic): ReplyTopic {
  const text = message.toLowerCase().replaceAll("’", "'");

  if (/^(?:hi|hey|hello)[!?.\s]*$/.test(text)) return "hello";
  if (/^(?:thanks(?: a lot)?|thank you|ty)[!?.\s]*$/.test(text)) return "thanks";
  if (/\b(?:one more|another one|keep going|tell me more|more please)\b/.test(text)) return previous;
  if (/\b(?:overwhelmed|stress(?:ed|ful)?|too much|burn(?:ed|t) out|busy|a lot to do)\b/.test(text)) return "overwhelmed";
  if (/\b(?:doubt(?:ing)?|confiden(?:t|ce)|nervous|insecure|fail(?:ed|ing|ure)?|not good enough)\b/.test(text)) return "doubt";
  if (/\b(?:sad|rough|lonely|tired|exhausted|upset|bad|down|not (?:good|great|okay|happy))\b/.test(text)) return "low";
  if (/\b(?:good|great|happy|excited|proud|better)\b/.test(text)) return "good";
  return "general";
}
