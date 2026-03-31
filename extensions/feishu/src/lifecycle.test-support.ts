import { vi } from "vitest";
import {
  ensureConfiguredBindingRouteReady,
  resolveConfiguredBindingRoute,
} from "openclaw/plugin-sdk/conversation-runtime";
import { __testing as botTesting } from "./bot.js";
import { __testing as cardUxLauncherTesting } from "./card-ux-launcher.js";
import { __testing as cardActionTesting } from "./card-action.js";
import { __testing as monitorAccountTesting } from "./monitor.account.js";

type BoundConversation = {
  bindingId: string;
  targetSessionKey: string;
};

const feishuLifecycleTestMocks = vi.hoisted(() => ({
  createEventDispatcherMock: vi.fn(),
  monitorWebSocketMock: vi.fn(async () => {}),
  monitorWebhookMock: vi.fn(async () => {}),
  createFeishuThreadBindingManagerMock: vi.fn(() => ({ stop: vi.fn() })),
  createFeishuReplyDispatcherMock: vi.fn(),
  resolveBoundConversationMock: vi.fn<() => BoundConversation | null>(() => null),
  touchBindingMock: vi.fn(),
  resolveAgentRouteMock: vi.fn(),
  resolveConfiguredBindingRouteMock: vi.fn(),
  ensureConfiguredBindingRouteReadyMock: vi.fn(),
  dispatchReplyFromConfigMock: vi.fn(),
  withReplyDispatcherMock: vi.fn(),
  finalizeInboundContextMock: vi.fn((ctx) => ctx),
  getMessageFeishuMock: vi.fn(async () => null),
  listFeishuThreadMessagesMock: vi.fn(async () => []),
  sendMessageFeishuMock: vi.fn(async () => ({ messageId: "om_sent", chatId: "chat_default" })),
  sendCardFeishuMock: vi.fn(async () => ({ messageId: "om_card", chatId: "chat_default" })),
}));

export function getFeishuLifecycleTestMocks() {
  return feishuLifecycleTestMocks;
}

const {
  createEventDispatcherMock,
  monitorWebSocketMock,
  monitorWebhookMock,
  createFeishuThreadBindingManagerMock,
  createFeishuReplyDispatcherMock,
  resolveBoundConversationMock,
  touchBindingMock,
  resolveAgentRouteMock,
  resolveConfiguredBindingRouteMock,
  ensureConfiguredBindingRouteReadyMock,
  dispatchReplyFromConfigMock,
  withReplyDispatcherMock,
  finalizeInboundContextMock,
  getMessageFeishuMock,
  listFeishuThreadMessagesMock,
  sendMessageFeishuMock,
  sendCardFeishuMock,
} = feishuLifecycleTestMocks;

export function installFeishuLifecycleTestDeps(): void {
  monitorAccountTesting.setDepsForTest({
    createEventDispatcher: ((...args) =>
      createEventDispatcherMock(...args)) as typeof import("./client.js").createEventDispatcher,
    monitorWebSocket: ((...args) =>
      monitorWebSocketMock(...args)) as typeof import("./monitor.transport.js").monitorWebSocket,
    monitorWebhook: ((...args) =>
      monitorWebhookMock(...args)) as typeof import("./monitor.transport.js").monitorWebhook,
    getMessageFeishu: ((...args) =>
      getMessageFeishuMock(...args)) as typeof import("./send.js").getMessageFeishu,
    createFeishuThreadBindingManager: ((...args) =>
      createFeishuThreadBindingManagerMock(
        ...args
      )) as typeof import("./thread-bindings.js").createFeishuThreadBindingManager,
  });
  botTesting.setDepsForTest({
    createFeishuReplyDispatcher: ((...args) =>
      createFeishuReplyDispatcherMock(
        ...args
      )) as typeof import("./reply-dispatcher.js").createFeishuReplyDispatcher,
    getMessageFeishu: ((...args) =>
      getMessageFeishuMock(...args)) as typeof import("./send.js").getMessageFeishu,
    listFeishuThreadMessages: ((...args) =>
      listFeishuThreadMessagesMock(
        ...args
      )) as typeof import("./send.js").listFeishuThreadMessages,
    sendMessageFeishu: ((...args) =>
      sendMessageFeishuMock(...args)) as typeof import("./send.js").sendMessageFeishu,
    resolveConfiguredBindingRoute: ((...args) =>
      resolveConfiguredBindingRouteMock.getMockImplementation()
        ? resolveConfiguredBindingRouteMock(...args)
        : resolveConfiguredBindingRoute(
            ...args
          )) as typeof import("openclaw/plugin-sdk/conversation-runtime").resolveConfiguredBindingRoute,
    ensureConfiguredBindingRouteReady: ((...args) =>
      ensureConfiguredBindingRouteReadyMock.getMockImplementation()
        ? ensureConfiguredBindingRouteReadyMock(...args)
        : ensureConfiguredBindingRouteReady(
            ...args
          )) as typeof import("openclaw/plugin-sdk/conversation-runtime").ensureConfiguredBindingRouteReady,
    getSessionBindingService: (() => ({
      resolveByConversation: resolveBoundConversationMock,
      touch: touchBindingMock,
    })) as typeof import("openclaw/plugin-sdk/conversation-runtime").getSessionBindingService,
  });
  cardActionTesting.setDepsForTest({
    sendMessageFeishu: ((...args) =>
      sendMessageFeishuMock(...args)) as typeof import("./send.js").sendMessageFeishu,
    sendCardFeishu: ((...args) =>
      sendCardFeishuMock(...args)) as typeof import("./send.js").sendCardFeishu,
  });
  cardUxLauncherTesting.setDepsForTest({
    sendCardFeishu: ((...args) =>
      sendCardFeishuMock(...args)) as typeof import("./send.js").sendCardFeishu,
  });
}

installFeishuLifecycleTestDeps();
