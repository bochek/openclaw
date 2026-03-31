export interface LineQuickReplyItem {
  type: "action";
  action: {
    type: "message";
    label: string;
    text: string;
  };
}

export interface LineQuickReply {
  items: LineQuickReplyItem[];
}

export function createQuickReplyItems(labels: string[]): LineQuickReply {
  const items: LineQuickReplyItem[] = labels.slice(0, 13).map((label) => ({
    type: "action",
    action: {
      type: "message",
      label: label.slice(0, 20),
      text: label,
    },
  }));
  return { items };
}
