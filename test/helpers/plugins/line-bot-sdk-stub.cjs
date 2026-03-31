"use strict";

let sdkStub;

sdkStub = new Proxy(
  function lineBotSdkStub() {
    return sdkStub;
  },
  {
    apply() {
      return sdkStub;
    },
    construct() {
      return sdkStub;
    },
    get(_target, prop) {
      if (prop === "__esModule") {
        return true;
      }
      if (prop === "default") {
        return sdkStub;
      }
      if (prop === "then") {
        return undefined;
      }
      if (prop === Symbol.toPrimitive) {
        return () => "";
      }
      if (prop === "toJSON") {
        return () => undefined;
      }
      if (prop === "toString") {
        return () => "";
      }
      if (prop === "valueOf") {
        return () => 0;
      }
      return sdkStub;
    },
    ownKeys(target) {
      return [...new Set([...Reflect.ownKeys(target), "__esModule", "default"])];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === "__esModule") {
        return {
          configurable: true,
          enumerable: false,
          value: true,
          writable: false,
        };
      }
      if (prop === "default") {
        return {
          configurable: true,
          enumerable: false,
          value: sdkStub,
          writable: false,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  },
);

module.exports = {
  __esModule: true,
  default: sdkStub,
  messagingApi: sdkStub,
  validateSignature: sdkStub,
};
