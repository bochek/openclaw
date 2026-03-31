import { vi } from "vitest";
import {
  createBlueBubblesAccountsMockModule,
  createBlueBubblesProbeMockModule,
} from "./test-harness.js";

vi.mock("./accounts.js", () => createBlueBubblesAccountsMockModule());

vi.mock("./probe.js", () => createBlueBubblesProbeMockModule());
