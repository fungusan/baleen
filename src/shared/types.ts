// The shipped AI-girl roster. IDs are the storage/art keys; names are display-only.
export const CHARACTER_IDS = ['deepseek', 'deepseek-school'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];
// Decorative motions she can play; every one uses the same idle drawing.
export type Look = 'idle' | 'listen' | 'thinking' | 'speak' | 'happy' | 'sad' | 'rest';
/** Normalized viewport position (0..1) of the card's top-left corner. */
export interface Position {
  x: number;
  y: number;
}
// System follows the device; the other two pin a scheme regardless of it.
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
// The two DeepSeek chat models exposed in the UI: the fast default and the stronger one.
export const DEEPSEEK_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;
export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[number];
export const DEEPSEEK_MODEL_LABELS: Record<DeepSeekModel, string> = {
  'deepseek-flash': 'DeepSeek Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
};
export const DEFAULT_MODEL: DeepSeekModel = 'deepseek-flash';
export interface Settings {
  version: 7;
  theme: Theme;
  scale: number;
  hidden: boolean;
  animate: boolean;
  position: Position | null;
  model: DeepSeekModel;
  character: CharacterId;
}
export type SettingsPatch = Partial<
  Pick<Settings, 'theme' | 'scale' | 'hidden' | 'animate' | 'position' | 'model' | 'character'>
>;
export type AskAction = 'chat' | 'summarize' | 'keywords';
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface AskRequest {
  action: AskAction;
  model: DeepSeekModel;
  text: string;
  title: string;
  /** The typed question, for `chat` only. */
  prompt?: string;
  /** Alt text and captions of images in the selected section; DeepSeek cannot see pixels. */
  images?: string[];
  /** Earlier questions and answers in this inline chat. */
  history?: ChatTurn[];
  /** Ask DeepSeek to reason first; the chain of thought comes back in `reasoning`. */
  thinking?: boolean;
}
export interface AskResult {
  text: string;
  reasoning?: string;
  usage?: { input: number; output: number };
}
export type Message =
  | { type: 'fg:update'; patch: SettingsPatch }
  | { type: 'fg:ask'; request: AskRequest }
  | { type: 'fg:ensure' };
