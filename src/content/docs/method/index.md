---
title: Method
description: How evidence is handled and sanitised across the case studies.
---

## How evidence is handled

This page describes how evidence is handled across the case studies. Each case study keeps the technique visible and replaces the values that identify a specific environment.

## What is redacted

Environment-specific values are replaced with role-based placeholders written in angle brackets. A placeholder names a role rather than a value, so the same token can stand for different real values on different pages.

| Category | Example placeholder |
|---|---|
| Target and attacker addresses | `<TARGET_IP>`, `<ATTACKER_IP>` |
| Domains and hostnames | `<DOMAIN>`, `<TARGET_HOSTNAME>`, `<LAB_DOMAIN>` |
| Account names | `<LAB_USER>`, `<SERVICE_ACCOUNT>`, `<MSSQL_USER>` |
| Credentials and passwords | `<CRACKED_PASSWORD>`, `<ADMIN_PASSWORD>` |
| Hashes | `<NTLM_HASH>`, `<BCRYPT_HASH>` |
| Ports | `<LISTENER_PORT>`, `<SHELL_PORT>` |
| Private paths and filenames | `<PRIVATE_KEY_FILE>`, `<JENKINS_USER_DIR>` |
| Payloads, session and container IDs | `<PHP_EXPRESSION>`, `<SESSION_ID>`, `<CONTAINER_ID>` |

No flag value is published. Where a flag would otherwise appear, the case study omits it or replaces it.

## What is preserved

Technique is preserved; only values are replaced. Command syntax, including flags, is kept intact, as are tool invocations, vulnerability identifiers, protocol and service names, and tool and product versions. Redacted or truncated output excerpts are kept and labelled as such. The narrative technique and the ordering of the attack path stay intact around the redactions. This keeps each case study useful to a technical reader while removing anything that identifies or exposes a specific environment.

## How limits are stated

A case study states what the evidence supports and where it stops, using consistent wording: "the source records" a result, a "documented result" is given, a result is "not reproduced" from the write-up, or a "limitation" is noted. These notes appear in the closing evidence paragraph of a case study rather than as a separate heading.

## The standard statement

Each case study cites the same line:

> Target identifiers, credentials, and secret values are replaced with role-based placeholders; command syntax is preserved.

Where a case study departs from this handling, it calls that out on the page itself.
