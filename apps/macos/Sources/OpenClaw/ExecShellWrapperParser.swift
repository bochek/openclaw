import Foundation

enum ExecShellWrapperParser {
    struct ParsedShellWrapper {
        let isWrapper: Bool
        let command: String?

        static let notWrapper = ParsedShellWrapper(isWrapper: false, command: nil)
    }

    static func extract(command: [String], rawCommand: String?) -> ParsedShellWrapper {
        let extracted = ExecWrapperResolution.extractShellWrapperCommand(command, rawCommand: rawCommand)
        return ParsedShellWrapper(isWrapper: extracted.isWrapper, command: extracted.command)
    }
}
