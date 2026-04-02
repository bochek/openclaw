import Foundation
import UserNotifications

struct ExecApprovalNotificationAction: Sendable, Equatable {
    let approvalId: String
    let decision: String
}

struct ExecApprovalNotificationPrompt: Sendable, Equatable {
    let approvalId: String
    let commandText: String
    let allowedDecisions: [String]
    let host: String?
    let nodeId: String?
    let agentId: String?
    let expiresAtMs: Int?
}

enum ExecApprovalNotificationBridge {
    static let requestedKind = "exec.approval.requested"
    static let resolvedKind = "exec.approval.resolved"
    static let allowAlwaysCategoryIdentifier = "openclaw.exec-approval.allow-always"
    static let onceOnlyCategoryIdentifier = "openclaw.exec-approval.once-only"
    static let allowOnceActionIdentifier = "openclaw.exec-approval.allow-once"
    static let allowAlwaysActionIdentifier = "openclaw.exec-approval.allow-always"
    static let denyActionIdentifier = "openclaw.exec-approval.deny"

    private static let localRequestPrefix = "exec.approval."

    static func registerNotificationCategories(center: UNUserNotificationCenter = .current()) {
        center.getNotificationCategories { categories in
            var updated = categories
            updated.update(with: self.makeAllowAlwaysCategory())
            updated.update(with: self.makeOnceOnlyCategory())
            center.setNotificationCategories(updated)
        }
    }

    static func shouldPresentNotification(userInfo: [AnyHashable: Any]) -> Bool {
        self.payloadKind(userInfo: userInfo) == self.requestedKind
    }

    static func parseAction(
        actionIdentifier: String,
        userInfo: [AnyHashable: Any]
    ) -> ExecApprovalNotificationAction?
    {
        guard self.payloadKind(userInfo: userInfo) == self.requestedKind else { return nil }
        guard let approvalId = self.approvalID(from: userInfo) else { return nil }

        let decision: String
        switch actionIdentifier {
        case self.allowOnceActionIdentifier:
            decision = "allow-once"
        case self.allowAlwaysActionIdentifier:
            decision = "allow-always"
        case self.denyActionIdentifier:
            decision = "deny"
        default:
            return nil
        }

        return ExecApprovalNotificationAction(approvalId: approvalId, decision: decision)
    }

    static func parsePrompt(
        actionIdentifier: String,
        userInfo: [AnyHashable: Any]
    ) -> ExecApprovalNotificationPrompt?
    {
        guard actionIdentifier == UNNotificationDefaultActionIdentifier else { return nil }
        guard self.payloadKind(userInfo: userInfo) == self.requestedKind else { return nil }
        guard let approvalId = self.approvalID(from: userInfo) else { return nil }
        guard let payload = self.openClawPayload(userInfo: userInfo) else { return nil }

        let commandText =
            (payload["commandText"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !commandText.isEmpty else { return nil }

        return ExecApprovalNotificationPrompt(
            approvalId: approvalId,
            commandText: commandText,
            allowedDecisions: self.allowedDecisions(from: payload),
            host: self.trimmedPayloadString(payload["host"]),
            nodeId: self.trimmedPayloadString(payload["nodeId"]),
            agentId: self.trimmedPayloadString(payload["agentId"]),
            expiresAtMs: self.payloadInt(payload["expiresAtMs"]))
    }

    @MainActor
    static func handleResolvedPushIfNeeded(
        userInfo: [AnyHashable: Any],
        notificationCenter: NotificationCentering
    ) async -> Bool
    {
        guard self.payloadKind(userInfo: userInfo) == self.resolvedKind,
              let approvalId = self.approvalID(from: userInfo)
        else {
            return false
        }

        await self.removeNotifications(forApprovalID: approvalId, notificationCenter: notificationCenter)
        return true
    }

    @MainActor
    static func removeNotifications(
        forApprovalID approvalId: String,
        notificationCenter: NotificationCentering
    ) async {
        let normalizedID = approvalId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedID.isEmpty else { return }

        await notificationCenter.removePendingNotificationRequests(
            withIdentifiers: [self.localRequestIdentifier(for: normalizedID)])

        let delivered = await notificationCenter.deliveredNotifications()
        let identifiers = delivered.compactMap { snapshot -> String? in
            guard self.approvalID(from: snapshot.userInfo) == normalizedID else { return nil }
            return snapshot.identifier
        }
        await notificationCenter.removeDeliveredNotifications(withIdentifiers: identifiers)
    }

    static func approvalID(from userInfo: [AnyHashable: Any]) -> String? {
        let raw = self.openClawPayload(userInfo: userInfo)?["approvalId"] as? String
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func makeAllowAlwaysCategory() -> UNNotificationCategory {
        UNNotificationCategory(
            identifier: self.allowAlwaysCategoryIdentifier,
            actions: [
                self.makeAllowOnceAction(),
                self.makeAllowAlwaysAction(),
                self.makeDenyAction(),
            ],
            intentIdentifiers: [],
            options: [])
    }

    private static func makeOnceOnlyCategory() -> UNNotificationCategory {
        UNNotificationCategory(
            identifier: self.onceOnlyCategoryIdentifier,
            actions: [
                self.makeAllowOnceAction(),
                self.makeDenyAction(),
            ],
            intentIdentifiers: [],
            options: [])
    }

    private static func makeAllowOnceAction() -> UNNotificationAction {
        UNNotificationAction(
            identifier: self.allowOnceActionIdentifier,
            title: "Allow Once",
            options: [.authenticationRequired])
    }

    private static func makeAllowAlwaysAction() -> UNNotificationAction {
        UNNotificationAction(
            identifier: self.allowAlwaysActionIdentifier,
            title: "Allow Always",
            options: [.authenticationRequired])
    }

    private static func makeDenyAction() -> UNNotificationAction {
        UNNotificationAction(
            identifier: self.denyActionIdentifier,
            title: "Deny",
            options: [.authenticationRequired, .destructive])
    }

    private static func localRequestIdentifier(for approvalId: String) -> String {
        "\(self.localRequestPrefix)\(approvalId)"
    }

    private static func payloadKind(userInfo: [AnyHashable: Any]) -> String {
        let raw = self.openClawPayload(userInfo: userInfo)?["kind"] as? String
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "unknown" : trimmed
    }

    private static func openClawPayload(userInfo: [AnyHashable: Any]) -> [String: Any]? {
        if let payload = userInfo["openclaw"] as? [String: Any] {
            return payload
        }
        if let payload = userInfo["openclaw"] as? [AnyHashable: Any] {
            return payload.reduce(into: [String: Any]()) { partialResult, pair in
                guard let key = pair.key as? String else { return }
                partialResult[key] = pair.value
            }
        }
        return nil
    }

    private static func allowedDecisions(from payload: [String: Any]) -> [String] {
        guard let rawValues = payload["allowedDecisions"] as? [Any] else { return [] }
        return rawValues.compactMap { value -> String? in
            guard let value = value as? String else { return nil }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
    }

    private static func trimmedPayloadString(_ raw: Any?) -> String? {
        let trimmed = (raw as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func payloadInt(_ raw: Any?) -> Int? {
        if let raw = raw as? Int {
            return raw
        }
        if let raw = raw as? NSNumber {
            return raw.intValue
        }
        if let raw = raw as? String {
            return Int(raw.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return nil
    }
}
