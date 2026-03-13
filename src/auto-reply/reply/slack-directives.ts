import { parseSlackBlocksInput } from "../../slack/blocks-input.js";
import type { ReplyPayload } from "../types.js";

const SLACK_BUTTONS_DIRECTIVE_RE = /\[\[slack_buttons:\s*([^\]]+)\]\]/gi;
const SLACK_SELECT_DIRECTIVE_RE = /\[\[slack_select:\s*([^\]]+)\]\]/gi;
const SLACK_REPLY_BUTTON_ACTION_ID = "openclaw:reply_button";
const SLACK_REPLY_SELECT_ACTION_ID = "openclaw:reply_select";
const SLACK_BUTTON_MAX_ITEMS = 5;
const SLACK_SELECT_MAX_ITEMS = 100;

type SlackBlock = Record<string, unknown>;
type SlackChannelData = {
  blocks?: unknown;
};

type SlackChoice = {
  label: string;
  value: string;
};

function parseChoice(raw: string): SlackChoice | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const delimiter = trimmed.indexOf(":");
  if (delimiter === -1) {
    return {
      label: trimmed,
      value: trimmed,
    };
  }
  const label = trimmed.slice(0, delimiter).trim();
  const value = trimmed.slice(delimiter + 1).trim();
  if (!label || !value) {
    return null;
  }
  return { label, value };
}

function parseChoices(raw: string, maxItems: number): SlackChoice[] {
  return raw
    .split(",")
    .map((entry) => parseChoice(entry))
    .filter((entry): entry is SlackChoice => Boolean(entry))
    .slice(0, maxItems);
}

function buildSectionBlock(text: string): SlackBlock | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: trimmed,
    },
  };
}

function buildButtonsBlock(raw: string, index: number): SlackBlock | null {
  const choices = parseChoices(raw, SLACK_BUTTON_MAX_ITEMS);
  if (choices.length === 0) {
    return null;
  }
  return {
    type: "actions",
    block_id: `openclaw_reply_buttons_${index}`,
    elements: choices.map((choice) => ({
      type: "button",
      action_id: SLACK_REPLY_BUTTON_ACTION_ID,
      text: {
        type: "plain_text",
        text: choice.label,
        emoji: true,
      },
      value: choice.value,
    })),
  };
}

function buildSelectBlock(raw: string, index: number): SlackBlock | null {
  const parts = raw
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const [first, second] = parts;
  const placeholder = parts.length >= 2 ? first : "Choose an option";
  const choices = parseChoices(parts.length >= 2 ? second : first, SLACK_SELECT_MAX_ITEMS);
  if (choices.length === 0) {
    return null;
  }
  return {
    type: "actions",
    block_id: `openclaw_reply_select_${index}`,
    elements: [
      {
        type: "static_select",
        action_id: SLACK_REPLY_SELECT_ACTION_ID,
        placeholder: {
          type: "plain_text",
          text: placeholder,
          emoji: true,
        },
        options: choices.map((choice) => ({
          text: {
            type: "plain_text",
            text: choice.label,
            emoji: true,
          },
          value: choice.value,
        })),
      },
    ],
  };
}

function readExistingSlackBlocks(payload: ReplyPayload): SlackBlock[] {
  const slackData = payload.channelData?.slack as SlackChannelData | undefined;
  const blocks = parseSlackBlocksInput(slackData?.blocks) as SlackBlock[] | undefined;
  return blocks ?? [];
}

export function hasSlackDirectives(text: string): boolean {
  SLACK_BUTTONS_DIRECTIVE_RE.lastIndex = 0;
  SLACK_SELECT_DIRECTIVE_RE.lastIndex = 0;
  return SLACK_BUTTONS_DIRECTIVE_RE.test(text) || SLACK_SELECT_DIRECTIVE_RE.test(text);
}

export function parseSlackDirectives(payload: ReplyPayload): ReplyPayload {
  const text = payload.text;
  if (!text) {
    return payload;
  }

  const generatedBlocks: SlackBlock[] = [];
  let buttonIndex = 0;
  let selectIndex = 0;

  let cleanedText = text.replace(SLACK_BUTTONS_DIRECTIVE_RE, (_match, body: string) => {
    buttonIndex += 1;
    const block = buildButtonsBlock(body, buttonIndex);
    if (block) {
      generatedBlocks.push(block);
    }
    return "";
  });

  cleanedText = cleanedText.replace(SLACK_SELECT_DIRECTIVE_RE, (_match, body: string) => {
    selectIndex += 1;
    const block = buildSelectBlock(body, selectIndex);
    if (block) {
      generatedBlocks.push(block);
    }
    return "";
  });

  if (generatedBlocks.length === 0) {
    return payload;
  }

  const existingBlocks = readExistingSlackBlocks(payload);
  const nextBlocks = [...existingBlocks];
  if (existingBlocks.length === 0) {
    const section = buildSectionBlock(cleanedText);
    if (section) {
      nextBlocks.push(section);
    }
  }
  nextBlocks.push(...generatedBlocks);

  return {
    ...payload,
    text: cleanedText.trim() || undefined,
    channelData: {
      ...payload.channelData,
      slack: {
        ...(payload.channelData?.slack as Record<string, unknown> | undefined),
        blocks: nextBlocks,
      },
    },
  };
}
