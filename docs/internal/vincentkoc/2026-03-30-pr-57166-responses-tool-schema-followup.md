---
title: "PR 57166 responses tool schema follow-up"
summary: "Maintainer follow-up for the Responses API flat-tool schema PR to cover missed HTTP boundary tests before merge."
author: "Vincent Koc"
github_username: "vincentkoc"
created: "2026-03-30T00:08:11Z"
---

PR `#57166` was substantively correct but not merge-ready.

Main follow-up:

- update `src/gateway/openresponses-http.test.ts` so the real `/v1/responses` HTTP boundary tests use flat Responses API tool definitions instead of the old wrapped Chat Completions shape
- assert that `strict` survives `extractClientTools` normalization

Why:

- the parity test file had already been updated on the PR branch
- the HTTP test lane still posted wrapped tools and would fail once the schema change landed

Decision:

- keep the flat external API shape
- keep the wrapped internal `ClientToolDefinition` shape
- cover the boundary translation explicitly in HTTP tests before merge
