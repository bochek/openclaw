import Foundation

enum ExecSystemRunCommandValidator {
    struct ResolvedCommand {
        let displayCommand: String
        let evaluationRawCommand: String?
    }

    enum ValidationResult {
        case ok(ResolvedCommand)
        case invalid(message: String)
    }

    private static let posixOrPowerShellInlineWrapperNames = Set([
        "ash",
        "bash",
        "dash",
        "fish",
        "ksh",
        "powershell",
        "pwsh",
        "sh",
        "zsh",
    ])

    static func resolve(command: [String], rawCommand: String?) -> ValidationResult {
        let normalizedRaw = self.normalizeRaw(rawCommand)
        let shell = ExecShellWrapperParser.extract(command: command, rawCommand: nil)
        let shellCommand = shell.isWrapper ? self.trimmedNonEmpty(shell.command) : nil

        let envManipulationBeforeShellWrapper = self.hasEnvManipulationBeforeShellWrapper(command)
        let shellWrapperPositionalArgv = self.hasTrailingPositionalArgvAfterInlineCommand(command)
        let mustBindDisplayToFullArgv = envManipulationBeforeShellWrapper || shellWrapperPositionalArgv
        let formattedArgv = ExecCommandFormatter.displayString(for: command)
        let previewCommand: String? = if let shellCommand, !mustBindDisplayToFullArgv {
            shellCommand
        } else {
            nil
        }

        if let raw = normalizedRaw, raw != formattedArgv, raw != previewCommand {
            return .invalid(message: "INVALID_REQUEST: rawCommand does not match command")
        }

        return .ok(ResolvedCommand(
            displayCommand: formattedArgv,
            evaluationRawCommand: self.allowlistEvaluationRawCommand(
                normalizedRaw: normalizedRaw,
                shellIsWrapper: shell.isWrapper,
                previewCommand: previewCommand)))
    }

    static func allowlistEvaluationRawCommand(command: [String], rawCommand: String?) -> String? {
        let normalizedRaw = self.normalizeRaw(rawCommand)
        let shell = ExecShellWrapperParser.extract(command: command, rawCommand: nil)
        let shellCommand = shell.isWrapper ? self.trimmedNonEmpty(shell.command) : nil

        let envManipulationBeforeShellWrapper = self.hasEnvManipulationBeforeShellWrapper(command)
        let shellWrapperPositionalArgv = self.hasTrailingPositionalArgvAfterInlineCommand(command)
        let mustBindDisplayToFullArgv = envManipulationBeforeShellWrapper || shellWrapperPositionalArgv
        let previewCommand: String? = if let shellCommand, !mustBindDisplayToFullArgv {
            shellCommand
        } else {
            nil
        }

        return self.allowlistEvaluationRawCommand(
            normalizedRaw: normalizedRaw,
            shellIsWrapper: shell.isWrapper,
            previewCommand: previewCommand)
    }

    private static func normalizeRaw(_ rawCommand: String?) -> String? {
        let trimmed = rawCommand?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func trimmedNonEmpty(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func allowlistEvaluationRawCommand(
        normalizedRaw: String?,
        shellIsWrapper: Bool,
        previewCommand: String?) -> String?
    {
        guard shellIsWrapper else {
            return normalizedRaw
        }
        guard let normalizedRaw else {
            return nil
        }
        return normalizedRaw == previewCommand ? normalizedRaw : nil
    }

    private static func hasEnvManipulationBeforeShellWrapper(
        _ argv: [String],
        depth: Int = 0,
        envManipulationSeen: Bool = false) -> Bool
    {
        _ = depth
        _ = envManipulationSeen
        return ExecWrapperResolution.hasEnvManipulationBeforeShellWrapper(argv)
    }

    private static func hasTrailingPositionalArgvAfterInlineCommand(_ argv: [String]) -> Bool {
        let wrapperArgv = self.unwrapShellWrapperArgv(argv)
        guard let token0 = self.trimmedNonEmpty(wrapperArgv.first) else {
            return false
        }
        let wrapper = ExecWrapperResolution.normalizeExecutableToken(token0)
        guard self.posixOrPowerShellInlineWrapperNames.contains(wrapper) else {
            return false
        }

        let inlineCommandIndex = ExecWrapperResolution.resolveInlineCommandValueTokenIndex(
            wrapperArgv,
            normalizedWrapper: wrapper)
        guard let inlineCommandIndex else {
            return false
        }
        let start = inlineCommandIndex + 1
        guard start < wrapperArgv.count else {
            return false
        }
        return wrapperArgv[start...].contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private static func unwrapShellWrapperArgv(_ argv: [String]) -> [String] {
        ExecWrapperResolution.unwrapShellInspectionArgv(argv)
    }
}
