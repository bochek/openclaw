# Changelog

## 2026.2.5

### Changes

- Upgrade default outbound DM protocol to NIP-17, with `dmProtocol: "nip04"` fallback.
- Keep inbound compatibility by reading both NIP-04 (`kind:4`) and NIP-17 (`kind:1059`) DMs.
- Add NIP-42 AUTH signing support for auth-required relays.
- Add NIP-65 relay discovery with safer relay URL filtering and fallback behavior.
- Fix `npub` normalization to decode directly to hex pubkeys.
- Add regression/unit tests for NIP-42 auth signing, NIP-65 relay handling, and `npub` normalization.

## 2026.2.4

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.2.2

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.31

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.30

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.29

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.23

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.22

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.21

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.20

### Changes

- Version alignment with core OpenClaw release numbers.

## 2026.1.19-1

Initial release.

### Features

- NIP-04 encrypted DM support (kind:4 events)
- Key validation (hex and nsec formats)
- Multi-relay support with sequential fallback
- Event signature verification
- TTL-based deduplication (24h)
- Access control via dmPolicy (pairing, allowlist, open, disabled)
- Pubkey normalization (hex/npub)

### Protocol Support

- NIP-01: Basic event structure
- NIP-04: Encrypted direct messages

### Planned for v2

- NIP-17: Gift-wrapped DMs
- NIP-44: Versioned encryption
- Media attachments
