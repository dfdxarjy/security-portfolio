---
title: Method
description: How evidence is handled and sanitised across the case studies.
---

## How evidence is handled

Each case study keeps the technique visible and replaces the values that identify a specific environment.

## What is redacted

Each case study replaces environment-specific values with role-based placeholders written in angle brackets. A placeholder names a role, so the same token can stand for different real values on different pages.

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

The site publishes no flag value. Where a flag would otherwise appear, the case study omits it or replaces it.

## What is preserved

Each case study preserves technique and replaces only values. It keeps command syntax, including flags, intact, along with tool invocations, vulnerability identifiers, protocol and service names, and tool and product versions. It keeps redacted or truncated output excerpts and labels them as such. The narrative technique and the ordering of the attack path stay intact around the redactions. This keeps each case study useful to a technical reader while removing anything that identifies or exposes a specific environment.

## How limits are stated

A case study states what the evidence supports and where it stops. It uses consistent wording: "the source records" a result, a "documented result" is given, a result is "not reproduced" from the write-up, or a "limitation" is noted. These notes appear in the closing evidence paragraph of a case study rather than as a separate heading.

## What the notes do not preserve

These case studies come from notes taken while the work was in progress. They document the path that worked. The notes generally did not record abandoned approaches, dead ends, or wrong assumptions at the time, so most studies do not describe them. Where a study does describe an obstacle or a change of approach, the notes recorded it.

## The standard statement

Each case study cites the same line:

> Target identifiers, credentials, and secret values are replaced with role-based placeholders; command syntax is preserved.

Where a case study departs from this handling, it calls that out on the page itself.

## Disclaimer

The site publishes a case study only after its machine has retired from the active rotation on Hack The Box, in accordance with the platform's terms of service. All material on this site is shared for educational purposes only.
