# Security Policy

poi stores personal notes behind Google sign-in, so we take reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report them privately through GitHub's
[private vulnerability reporting](https://github.com/naosuke884/poi/security/advisories/new)
("Report a vulnerability" on the Security tab). Include steps to reproduce and, if you can, the impact
(e.g. reading another user's board, bypassing sign-in, caching authenticated responses).

You should get an acknowledgement within a week. Once a fix is released, the report is disclosed
through a GitHub security advisory and you will be credited unless you prefer otherwise.

## Scope

This repository is the application source. Self-hosted deployments are configured by whoever runs them —
issues with a particular deployment's Cloudflare or Google OAuth settings are out of scope unless the
defaults in this repository caused them.

## Supported versions

Only the current `main` branch is supported; there are no versioned releases.
