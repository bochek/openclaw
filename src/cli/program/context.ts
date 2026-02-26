import { VERSION } from "../../version.js";
import { resolveCliChannelOptions } from "../channel-options.js";

export type ProgramContext = {
  programVersion: string;
  channelOptions: string[];
  messageChannelOptions: string;
  agentChannelOptions: string;
};

export function createProgramContext(): ProgramContext {
  // Defer resolveCliChannelOptions() until a command actually needs channel option strings.
  // This avoids the catalog discovery (discoverOpenClawPlugins) and module loading
  // during --help, --version, and other fast-path invocations.
  let _channelOptions: string[] | undefined;
  function getChannelOptions(): string[] {
    if (_channelOptions === undefined) {
      _channelOptions = resolveCliChannelOptions();
    }
    return _channelOptions;
  }

  return {
    programVersion: VERSION,
    get channelOptions() {
      return getChannelOptions();
    },
    get messageChannelOptions() {
      return getChannelOptions().join("|");
    },
    get agentChannelOptions() {
      return ["last", ...getChannelOptions()].join("|");
    },
  };
}
