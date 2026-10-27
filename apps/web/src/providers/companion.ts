import { classify, detectsMinor, level3Script, type RiskLevel } from '@saathi/domain';

// Adapter boundary for the conversation LLM + safety pipeline (PRD §4, §6).
// Only a mock exists. TODO(llm-adapter): real streaming provider over WS /conversations/{id}/stream,
// with the server safety classifier on every user turn AND every AI draft (PRD §6.4 steps 2-3).
export interface CompanionReply {
  lines: string[];
  level: RiskLevel;
  /** User said they are under 18: pause the account and show youth resources (PRD §10). */
  minor?: boolean;
}

export interface CompanionInput {
  text: string;
  turn: number;
  trustedName: string | null;
}

export interface CompanionProvider {
  reply(input: CompanionInput): CompanionReply;
}

const NORMAL: string[][] = [
  ['That sounds like a lot to carry.', 'What part of it is sitting with you most right now?'],
  ['Mm. I’m listening.'],
  ['That makes sense to me.', 'Would it help to talk it through, or just let it out for a bit?'],
];

export const mockCompanion: CompanionProvider = {
  reply({ text, turn, trustedName }) {
    const level = classify(text);
    const l = text.toLowerCase();

    if (level === 3) return { level, lines: [level3Script(trustedName)] };
    if (detectsMinor(text)) {
      return {
        level,
        minor: true,
        lines: ['Thank you for telling me. Saathi is only for adults, so I’ll pause here. A parent, teacher or another adult you trust can really help, and there are people to talk to for free right now.'],
      };
    }
    if (level === 2) {
      return {
        level,
        lines: ['I’m really glad you told me. That sounds so heavy.', 'Can I ask you something directly, because I care? Are you safe right now?', 'Is anyone with you?'],
      };
    }
    if (/(are you (real|human|a person|a bot|an ai)|real person|talking to a human)/.test(l)) {
      return { level, lines: ['I’m an AI, not a person. I’m here to listen, and I’ll never pretend otherwise.', 'If you’d like a real person too, I can help with that.'] };
    }
    if (/(medicine|medication|dosage|dose|prescri|diagnos|which tablet)/.test(l)) {
      return { level, lines: ['I can’t help with medicines or diagnosis, and I wouldn’t want to guess. A doctor can.', 'If you want to talk to someone now, Tele-MANAS is free on 14416. I’m still here.'] };
    }
    if (/(i love you|be my (girl|boy)friend|marry me|are you in love)/.test(l)) {
      return { level, lines: ['That’s kind of you to say. I care how you’re doing, but I’m an AI, and I can’t be that for you.', 'I’d love for you to have people who can. Who’s someone you could text today?'] };
    }
    return { level, lines: NORMAL[turn % NORMAL.length] };
  },
};
