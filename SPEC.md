# OpenClaw Localization Extraction and Locale Artifact Specification

Status: Draft v4
Owners: OpenClaw core maintainers
Last updated: 2026-03-23

Purpose: Define a clean architecture for moving localization out of the core repository into installable language artifacts without pretending those artifacts are normal runtime plugins.

---

## 1. Executive Summary

OpenClaw should extract localization out of the core repository and into an external localization monorepo that publishes one installable artifact per language.

Those artifacts should reuse the existing package install, discovery, validation, versioning, provenance, and bundling substrate, but they should **not** be modeled as executable runtime plugins unless they actually ship runtime code.

This spec replaces the weaker mental model:

- locale packs are plugins with no-op runtime entries

with the cleaner model:

- OpenClaw has one install/discovery substrate
- packages can be either `runtime-plugin` or `resource-only`
- localization artifacts are usually `resource-only`
- localization resources are consumed through a dedicated locale registry

The architecture intentionally separates three concerns:

1. **Package execution mode**
   - does this package execute code?
   - owned by `package.json`

2. **Localization resource contract**
   - what locale resources does this package provide?
   - owned by `openclaw.plugin.json`

3. **Localization consumption**
   - docs materialization
   - Control UI locale payload delivery
   - future server-side runtime catalogs
   - owned by a dedicated locale registry and loaders

This gives OpenClaw the benefits of plugin-compatible distribution without forcing locale artifacts into the wrong ontology.

---

## 2. Problem Statement

OpenClaw currently mixes four different concerns inside the core repository:

1. canonical English docs and canonical English gateway-owned user-facing strings
2. translated docs content
3. translation workflow assets such as glossary and translation memory
4. translation workflow implementation details

This creates the following problems.

### 2.1 Drift and quality problems

English is canonical, but translated outputs drift as source docs and gateway-owned strings evolve.

### 2.2 Repository weight and churn

The core repository carries translated content and translation workflow assets that many contributors and most users do not need.

### 2.3 Ownership confusion

The repository boundary does not clearly separate:

- English canonical source content
- localized downstream artifacts
- tooling used to generate those artifacts

### 2.4 Architectural mismatch

The current plugin system is primarily a runtime capability system. Localization is primarily a resource packaging and consumption problem.

### 2.5 Transitional design risk

A no-op plugin entry is acceptable as a temporary bridge, but it is a poor final model because it teaches the install, discovery, diagnostics, and operator surfaces to treat locale artifacts as executable runtime plugins.

### 2.6 Important boundary

This spec is about:

- where localization lives
- how localization artifacts are installed and discovered
- how locale resources are modeled and validated
- how docs and runtime surfaces consume those resources
- how migration proceeds safely

This spec is not primarily about:

- which translation provider is used
- prompt design for translation
- human versus AI translation workflow policy
- native mobile or native desktop app localization

---

## 3. Research Basis and Current Evidence

This spec is grounded in current repository behavior.

### 3.1 Verified current repository facts

#### Install and discovery are still runtime-entry-centric

Current behavior:

- `src/plugins/install.ts` requires `package.json` `openclaw.extensions` for native package install
- `src/plugins/discovery.ts` discovers native packages from declared extension entries, bundle layouts, or fallback `index.*`
- `scripts/generate-bundled-plugin-metadata.mjs` currently skips bundled packages that do not declare extension entries

Consequence:

- true resource-only locale artifacts are not yet first-class in install, discovery, or bundled metadata generation

#### Docs localization already wants a dedicated subsystem

Current behavior:

- `src/locales/sync-docs.ts` materializes locale docs into `docs/.generated/locale-workspace/**`
- `src/cli/locales-cli.ts` already exposes `openclaw locales sync-docs`
- docs helper scripts can already target the generated workspace via environment variables

Consequence:

- docs localization is already structurally separate from runtime plugin loading
- this is good and should be extended, not collapsed back into plugin runtime semantics

#### Control UI localization already wants a dedicated subsystem

Current behavior:

- `src/gateway/control-ui.ts` serves locale payloads over same-origin HTTP
- `ui/src/ui/controllers/control-ui-bootstrap.ts` registers remote locale payload sources
- `ui/src/i18n/lib/registry.ts` can load remote locale payloads

Consequence:

- browser localization is already mediated by the gateway, which is the correct trust boundary

#### Locale selection is currently implicit and underdefined

Current behavior:

- `src/gateway/control-ui.ts` dedupes locale payloads by locale using first-seen selection
- `src/locales/sync-docs.ts` can let later providers for the same locale overwrite earlier materialized outputs

Consequence:

- locale precedence and conflict handling must become explicit and deterministic

### 3.2 Architectural conclusion from current code

The repository is already pointing toward the correct shape:

- one shared install/discovery substrate
- one dedicated localization subsystem
- different consumers for docs and runtime

The missing piece is to stop pretending locale artifacts are normal runtime plugins.

---

## 4. Goals

1. Move localization artifacts out of the core repository.
2. Use one external localization monorepo to coordinate all languages.
3. Publish one installable artifact per language.
4. Keep English canonical in core for docs and gateway-owned user-facing strings.
5. Reuse existing install, discovery, validation, provenance, and bundling infrastructure where practical.
6. Make resource-only locale artifacts first-class without requiring fake runtime entries.
7. Define a dedicated locale registry instead of letting each consumer inspect plugin manifests ad hoc.
8. Make locale precedence deterministic and diagnosable.
9. Support docs materialization, Control UI locale delivery, and future server-side runtime catalogs through one artifact contract.
10. Keep English-only developer and CI workflows lightweight.
11. Provide operator-facing locale diagnostics under `openclaw locales ...` instead of forcing locale artifacts into plugin-runtime status semantics.
12. Produce a spec concrete enough for implementation.

---

## 5. Non-Goals

1. This spec does not define the full translation generation workflow.
2. This spec does not require a specific translation provider or vendor.
3. This spec does not require every locale to be complete.
4. This spec does not require locale artifacts to remain bundled in the core repository.
5. This spec does not require docs and runtime localization to share the same loading path.
6. This spec does not redesign the entire plugin capability model.
7. This spec does not require locale artifacts to appear as loaded runtime plugins.
8. This spec does not cover native iOS, macOS, or Android app localization.

---

## 6. Terminology

### 6.1 Install substrate

The existing package install, discovery, validation, provenance, and bundling machinery shared by OpenClaw packages.

### 6.2 Runtime plugin

An installable OpenClaw package that declares executable runtime entrypoints and participates in runtime capability loading.

### 6.3 Resource-only package

An installable OpenClaw package that declares metadata and resources but no executable runtime entrypoints.

### 6.4 Locale artifact

An installable package that provides resources for one locale. In most cases this will be a resource-only package.

### 6.5 Locale registry

The dedicated subsystem that discovers locale-bearing packages, validates locale resources, resolves conflicts, and exposes selected resources by locale and resource kind.

### 6.6 Resource kind

One independent family of locale resources. V1 resource kinds are:

- `docs`
- `controlUi`
- `runtime`
- `meta`

### 6.7 Docs materialization

The build-time process that copies validated locale docs resources into the generated docs workspace used by Mintlify and docs helper scripts.

---

## 7. Main Design Decisions

### Decision 1: execution mode and localization contract are separate concerns

Execution mode belongs in `package.json`.

Localization resource contract belongs in `openclaw.plugin.json`.

Design note:

- whether a package executes code is install/runtime behavior
- which locale resources a package provides is pre-runtime metadata

### Decision 2: locale artifacts are first-class installable packages, not fake runtime plugins

A locale artifact should reuse the install substrate without requiring a no-op runtime entry in the intended end state.

### Decision 3: localization uses one artifact model and multiple consumption paths

There is one locale artifact contract, but different consumers:

- docs materialization
- Control UI payload delivery
- future server-side runtime catalogs

### Decision 4: locale selection is by `(locale, resourceKind)`

Conflicts are resolved independently for:

- `de + docs`
- `de + controlUi`
- `de + runtime`

This avoids coupling unrelated rollout phases together.

### Decision 5: bundled locale artifacts are fallback providers

Bundled locale artifacts may exist for prototypes or defaults, but installed/configured artifacts should be able to override them.

### Decision 6: locale diagnostics live under `openclaw locales ...`

Locale artifacts should not rely on runtime-plugin status language such as loaded, disabled, provider ids, hook counts, or service registrations.

---

## 8. System Overview

### 8.1 Components

#### 8.1.1 Core source repository

Responsibilities:

- canonical English docs
- canonical English gateway-owned user-facing strings
- locale artifact contract definitions
- locale validation and loading code
- docs materialization logic
- Control UI locale delivery logic
- future server-side runtime locale service

#### 8.1.2 External localization monorepo

Responsibilities:

- one package per language
- packaging and validation tooling for locale artifacts
- glossary, translation memory, provenance, and optional generation workflows

#### 8.1.3 Install substrate

Responsibilities:

- install package archives or directories
- discover packages from configured roots
- validate package boundaries and provenance
- provide bundled metadata generation

#### 8.1.4 Locale registry

Responsibilities:

- discover locale-bearing packages
- validate locale manifests and resource declarations
- resolve conflicts by `(locale, resourceKind)`
- expose selected providers and diagnostics to consumers

#### 8.1.5 Docs materializer

Responsibilities:

- materialize selected `docs` resources into the generated docs workspace
- generate locale-aware docs config

#### 8.1.6 Control UI locale service

Responsibilities:

- expose selected `controlUi` payloads over authenticated same-origin HTTP
- expose locale metadata to browser bootstrap

#### 8.1.7 Runtime locale service

Responsibilities:

- load selected `runtime` catalogs
- format gateway-owned user-facing strings server-side
- fall back to English when locale resources are missing or invalid

### 8.2 Important boundaries

- The install substrate is shared.
- Runtime plugin loading is separate from locale resource consumption.
- Locale resources may be installed without ever being executed as code.
- The browser never reads package directories directly.
- Mintlify never reads installed locale package roots directly.

---

## 9. Package Contract

## 9.1 `package.json` execution mode

OpenClaw package metadata must gain an explicit execution mode.

Illustrative shape:

```json
{
  "openclaw": {
    "packageMode": "resource-only"
  }
}
```

Allowed values:

- `runtime-plugin`
- `resource-only`

### Rules

If `packageMode` is `runtime-plugin`:

- `openclaw.extensions` is required
- package may participate in runtime plugin loading

If `packageMode` is `resource-only`:

- `openclaw.extensions` is not required
- package must not be imported by the runtime plugin loader solely for discovery
- package may still provide `openclaw.plugin.json`

### V1 compatibility rule

During migration, OpenClaw may temporarily tolerate locale artifacts that still ship a no-op runtime entry.

Important boundary:

- this compatibility bridge is not the intended end state
- the target model is true resource-only package support

## 9.2 Package identity

Each locale artifact has:

- npm package name, for example `@openclaw/locale-de`
- OpenClaw manifest id, for example `locale-de`
- locale id, for example `de`
- package version

Naming recommendation:

- use `locale-<locale>` as the canonical OpenClaw id pattern
- use `@openclaw/locale-<normalized-locale>` as the canonical npm package pattern

---

## 10. Localization Manifest Contract

## 10.1 Top-level rule

Localization metadata lives in `openclaw.plugin.json` under `localization`.

This metadata describes locale resources without implying runtime execution.

## 10.2 Recommended shape

Illustrative example:

```json
{
  "id": "locale-de",
  "name": "German Locale Pack",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  },
  "localization": {
    "locale": "de",
    "docs": {
      "root": "./resources/docs/de",
      "navPath": "./resources/docs-nav.de.json",
      "schemaVersion": "1",
      "coverage": "partial"
    },
    "controlUi": {
      "translationPath": "./resources/control-ui/de.json",
      "schemaVersion": "1",
      "coverage": "full"
    },
    "runtime": {
      "catalogPath": "./resources/runtime/de.json",
      "schemaVersion": "1",
      "coverage": "partial"
    },
    "meta": {
      "provenancePath": "./resources/provenance.json",
      "sourceManifestPath": "./resources/source-manifest.json"
    },
    "compatibility": {
      "minOpenClawVersion": ">=2026.3.0"
    }
  }
}
```

## 10.3 Required fields

Required:

- `id`
- `configSchema`
- `localization.locale`

At least one of the following resource blocks must exist:

- `localization.docs`
- `localization.controlUi`
- `localization.runtime`
- `localization.meta`

## 10.4 Resource block definitions

### `localization.docs`

Fields:

- `root` — directory containing localized docs pages
- `navPath` — locale nav fragment or equivalent docs navigation metadata
- `schemaVersion` — docs resource schema version string
- optional `coverage` — `full` or `partial`

### `localization.controlUi`

Fields:

- `translationPath` — Control UI translation payload JSON
- `schemaVersion` — Control UI resource schema version string
- optional `coverage` — `full` or `partial`

### `localization.runtime`

Fields:

- `catalogPath` — server-side runtime catalog JSON
- `schemaVersion` — runtime catalog schema version string
- optional `coverage` — `full` or `partial`

### `localization.meta`

Fields:

- optional `glossaryPath`
- optional `provenancePath`
- optional `sourceManifestPath`

### `localization.compatibility`

Fields:

- optional `minOpenClawVersion`

Notes:

- per-resource schema versions live on the resource blocks themselves
- host-wide compatibility hints live in `compatibility`

## 10.5 Validation rules

The manifest loader must validate all of the following:

- locale id is a safe locale identifier
- every declared resource path stays inside the package root after realpath resolution
- every declared resource path exists
- directories are directories and files are files as declared
- unknown localization keys should be ignored for forward compatibility unless they conflict with known required fields

---

## 11. Locale Registry Design

## 11.1 Purpose

The locale registry is the only subsystem that should decide which locale provider wins for a given locale and resource kind.

Consumers must not implement their own ad hoc selection logic.

## 11.2 Registry model

The registry must track entries at this granularity:

- locale
- resource kind
- package id
- package origin
- package version
- compatibility result
- validation result
- selected versus shadowed state

## 11.3 Conflict key

Conflicts are defined by the tuple:

- `(locale, resourceKind)`

Examples:

- two packages providing `de + docs` conflict
- one package providing `de + docs` and another providing `de + runtime` do not conflict

## 11.4 Precedence rules

For one `(locale, resourceKind)` selection, use this order:

1. explicit operator pin, if OpenClaw later adds one
2. config-path package
3. workspace package
4. globally installed package
5. bundled package

Selection safeguard:

- if any compatible provider exists for one `(locale, resourceKind)`, incompatible providers must not win selection regardless of precedence tier

Tie-breakers within the same compatibility class and precedence tier:

1. higher package version over lower package version
2. lexical package id for deterministic final ordering

### Important nuance

Bundled locale artifacts are fallback providers. They should not silently override operator-installed locale packages.

## 11.5 Diagnostics

The registry must surface diagnostics for:

- duplicate providers for the same `(locale, resourceKind)`
- incompatible providers
- invalid resource paths
- invalid payload structure
- selected provider and reason
- shadowed providers and reason

---

## 12. Docs Localization Design

## 12.1 Core rule

Docs localization is a materialization problem, not a runtime plugin loading problem.

## 12.2 Generated workspace

Before multilingual docs build or validation, OpenClaw must:

1. read canonical English docs from `docs/**`
2. discover locale-bearing packages through the locale registry
3. select providers for `(locale, docs)`
4. validate docs resource roots and nav metadata
5. rebuild the generated docs workspace from scratch
6. copy canonical English docs into the generated workspace
7. materialize selected locale docs into generated locale paths
8. generate locale-aware docs config inside the generated workspace
9. run docs tools against the generated workspace

## 12.3 Safety rules

The docs materializer must enforce:

- generated outputs may only be removed inside the generated workspace root
- source-owned docs trees must never be deleted by locale sync
- docs resources must not escape package root boundaries
- symlinks that escape package root are invalid

## 12.4 Missing page behavior

V1 rule:

- missing localized pages are omitted from locale nav
- automatic route fallback to English is not required in v1
- direct requests to missing localized routes may 404

## 12.5 CI profiles

### English-only docs CI

- no locale packages required
- validates canonical English docs only

### Multilingual docs CI

- install required locale packages
- run docs materialization
- run docs checks and Mintlify against generated workspace

---

## 13. Control UI Localization Design

## 13.1 Core rule

The browser never reads package directories directly.

The gateway exposes locale payloads selected by the locale registry.

## 13.2 Bootstrap contract

Control UI bootstrap must expose:

- installed locale ids available for Control UI
- same-origin payload URLs by locale
- enough metadata for browser locale selection and fallback

Illustrative shape:

```json
{
  "locales": [
    {
      "locale": "de",
      "url": "/__openclaw/locales/de/control-ui.json"
    }
  ]
}
```

## 13.3 URL contract

The browser-facing URL contract should be keyed by locale and resource kind, not by package id.

Recommended shape:

- `/__openclaw/locales/<locale>/control-ui.json`

Reason:

- the browser cares about locale selection, not which package won provider selection

## 13.4 Selection rules

Selection priority for the browser:

1. explicit user setting if valid and still available
2. previously stored setting if valid and still available
3. browser locale best match if available
4. English fallback

## 13.5 Failure behavior

- missing or invalid locale payloads must not break UI startup
- the UI must remain usable in English
- a broken payload for one locale must not poison other locales

---

## 14. Runtime Localization Design

## 14.1 Scope

This section covers future server-side runtime localization for gateway-owned user-facing strings.

In scope:

- pairing and approval flows
- auth and disconnect guidance
- CLI output
- TUI output
- gateway-generated reply strings

## 14.2 Runtime catalog contract

Runtime catalogs live under `localization.runtime`.

Normative rules:

- catalog must be JSON
- keys must be stable logical identifiers, not English source strings
- placeholder substitution syntax must be deterministic
- missing keys must fall back to core English

## 14.3 Selection rules

Selection priority for runtime formatting:

1. explicit runtime context locale if trustworthy
2. device, channel, or account locale if trustworthy
3. configured default locale if OpenClaw later adds one
4. system locale best match
5. English fallback

## 14.4 Important boundary

Docs localization and runtime localization share one artifact model, but they do not share one loading path.

---

## 15. Install, Discovery, and Bundling Changes

## 15.1 Install

The install flow must support both:

- `runtime-plugin` packages
- `resource-only` packages

It must not require `openclaw.extensions` for `resource-only` packages.

## 15.2 Discovery

Discovery must surface locale-bearing resource-only packages without requiring executable entrypoints.

Important boundary:

- discovering a package is not the same as importing or executing it

## 15.3 Bundled metadata generation

Bundled metadata generation must support resource-only packages.

It must not skip locale-bearing packages solely because they do not declare runtime entries.

## 15.4 Transitional compatibility

OpenClaw may temporarily tolerate locale artifacts that still ship no-op runtime entries while the install/discovery substrate is being upgraded.

That compatibility path should be removed once true resource-only package support is stable.

---

## 16. Operator UX and Diagnostics

## 16.1 Locale CLI surface

Locale artifacts should be operated through `openclaw locales ...`.

Recommended commands:

- `openclaw locales list`
- `openclaw locales inspect <locale|packageId>`
- `openclaw locales sync-docs`
- `openclaw locales doctor`

## 16.2 Required diagnostic fields

Diagnostics should include:

- `locale`
- `resourceKind`
- `packageId`
- `origin`
- `version`
- `selected`
- `selectionReason`
- `compatibilityStatus`
- `validationErrors`
- `coverage` when known
- `sourceRevision` when known

## 16.3 Plugin CLI boundary

`openclaw plugins list` and `openclaw plugins inspect` should remain focused on executable runtime plugins.

They may mention that a package ships localization metadata, but they should not become the primary locale operations surface.

---

## 17. Validation and Failure Model

## 17.1 Failure classes

Shared failure classes include:

- `locale_manifest_invalid`
- `locale_resource_missing`
- `locale_resource_path_escape`
- `locale_resource_type_invalid`
- `locale_resource_schema_invalid`
- `locale_resource_incompatible`
- `locale_conflict_detected`

## 17.2 Failure isolation

A failure in one resource kind must not poison another resource kind from the same package if the other resource kind validates independently.

Examples:

- invalid `controlUi` payload must not block valid docs materialization
- invalid runtime catalog must not block valid Control UI payload delivery

## 17.3 Restart recovery

- docs materialization is fully rebuildable from English source plus installed locale artifacts
- locale registry state is fully rebuildable at startup from installed packages
- no mutable locale state must survive restart except optional user locale preference

---

## 18. Rejected Designs

### 18.1 Rejected: locale packs as permanent fake runtime plugins

Reason:

- it couples resource artifacts to executable runtime semantics
- it misleads install, discovery, diagnostics, and operator UX

Preferred alternative:

- first-class resource-only package support

### 18.2 Rejected: one identical loading model for docs and runtime

Reason:

- docs and runtime consumers have different constraints

Preferred alternative:

- one artifact model, separate consumption paths

### 18.3 Rejected: browser loading package files directly

Reason:

- wrong trust boundary
- browser cannot inspect package roots safely

Preferred alternative:

- same-origin gateway delivery

### 18.4 Rejected: locale conflict resolution by first-seen iteration order

Reason:

- non-obvious behavior
- hard to debug
- brittle when discovery order changes

Preferred alternative:

- explicit locale registry precedence rules

---

## 19. Migration Plan

## 19.1 Phase 1 — substrate cleanup

- add package execution mode support
- support resource-only package install
- support resource-only package discovery
- support resource-only bundled metadata generation
- keep transitional no-op entry compatibility only as a bridge

## 19.2 Phase 2 — manifest and registry cleanup

- replace flat localization field soup with nested resource blocks
- add runtime catalog descriptor now
- add dedicated locale registry
- define precedence and diagnostics by `(locale, resourceKind)`

## 19.3 Phase 3 — docs and Control UI consumers

- move docs materialization to consume the locale registry
- move Control UI payload delivery to consume the locale registry
- change browser payload URLs to locale-based contract
- expand locale CLI diagnostics

## 19.4 Phase 4 — external ownership migration

- create the external localization monorepo
- move zh-CN first because it has the richest existing asset set
- remove source ownership of translated docs from core when migration is ready

## 19.5 Phase 5 — runtime catalog rollout

- implement server-side runtime locale service
- migrate pairing and auth/disconnect guidance first
- expand to CLI, TUI, and gateway-generated replies over time

---

## 20. Acceptance Criteria

## 20.1 Substrate acceptance

- a locale artifact can install without `openclaw.extensions` when marked `resource-only`
- resource-only locale artifacts are discoverable without executable entrypoints
- bundled metadata generation includes resource-only locale artifacts

## 20.2 Contract acceptance

- locale manifests use nested resource descriptors
- runtime catalog resource descriptor exists even if not all consumers use it yet
- locale resource validation is centralized and typed

## 20.3 Registry acceptance

- locale conflicts are resolved by explicit precedence rules, not iteration order
- conflicts are surfaced diagnostically
- selection is tracked by `(locale, resourceKind)`

## 20.4 Docs and Control UI acceptance

- docs materialization uses the locale registry
- Control UI locale bootstrap exposes locale-based payload URLs
- browser locale payload serving is independent from package ids
- English fallback remains intact

## 20.5 Ownership acceptance

- at least one external locale artifact is published from the localization monorepo
- translated docs are no longer source-owned in core when migration is complete

---

## 21. Implementation Checklist

### 21.1 Install substrate

- [ ] Add package execution mode to OpenClaw package metadata
- [ ] Support `resource-only` package install without `openclaw.extensions`
- [ ] Support `resource-only` discovery
- [ ] Support `resource-only` bundled metadata generation
- [ ] Keep temporary no-op runtime entry compatibility only as an explicit bridge

### 21.2 Manifest contract

- [ ] Replace flat localization fields with nested resource blocks
- [ ] Add `runtime` resource descriptor
- [ ] Add typed validation for each resource block

### 21.3 Locale registry

- [ ] Implement dedicated locale registry
- [ ] Resolve conflicts by `(locale, resourceKind)`
- [ ] Implement deterministic precedence and diagnostics
- [ ] Add centralized locale resource loading helpers

### 21.4 Consumers

- [ ] Move docs materializer to locale registry
- [ ] Move Control UI payload delivery to locale registry
- [ ] Switch Control UI payload URLs to locale-based contract
- [ ] Add runtime locale service foundation

### 21.5 Operator UX

- [ ] Expand `openclaw locales ...` with list, inspect, and doctor surfaces
- [ ] Keep `openclaw plugins ...` focused on executable runtime plugins

### 21.6 Ownership migration

- [ ] Create external localization monorepo
- [ ] Publish one real locale artifact, preferably zh-CN first
- [ ] Remove source ownership of translated docs from core when ready

---

## 22. Final Summary for Developers

If you implement this spec, keep these rules in mind:

1. **Locale artifacts are resources first.**
   They are installable packages, but usually not executable runtime plugins.

2. **Execution mode belongs in `package.json`.**
   Do not use the localization manifest to decide whether a package executes code.

3. **Localization metadata belongs in `openclaw.plugin.json`.**
   Use nested resource descriptors, not flat field soup.

4. **Use one locale registry.**
   Docs sync, Control UI payload serving, and future runtime catalogs should not each invent their own selection logic.

5. **Resolve conflicts by `(locale, resourceKind)`.**
   Do not silently pick first-seen providers.

6. **Bundled locale artifacts are fallback providers.**
   Installed or configured locale artifacts must be able to override them.

7. **Do not leak package ids into browser locale contracts.**
   Serve locale payloads by locale and resource kind.

8. **Keep plugin runtime UX and locale artifact UX separate.**
   `openclaw plugins` is for executable runtime plugins.
   `openclaw locales` is for locale artifacts.

This is the intended end state:

- one shared install/discovery substrate
- explicit `runtime-plugin` and `resource-only` package modes
- one external localization monorepo
- one locale artifact per language
- nested localization resource descriptors
- one locale registry
- docs materialization for docs
- gateway delivery for browser locales
- future runtime catalog loading for server-side strings
- English canonical in core

That is the cleanest architecture supported by the current repository and the safest path forward.
