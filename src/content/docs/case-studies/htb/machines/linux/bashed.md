---
title: "Bashed: Web Shell to Scheduled-Task Privilege Escalation"
description: "Web enumeration exposes an accessible PHP web shell for command execution, followed by a constrained sudo identity transition and a writable root-executed script to reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web-enumeration
  - privilege-escalation
---

## Summary

This Hack The Box Linux lab demonstrates how web enumeration exposed an accessible PHP web shell, providing command execution as a low-privilege web account. The recorded path then used a constrained sudo rule and a writable script apparently executed by root. Target, operator, account, and credential-specific values are replaced with role-based placeholders.

## Context and Objective

The notes describe an Easy Linux machine with HTTP as the only exposed service. The objective was to move from exposed web functionality to a low-privilege shell, enumerate local authorization, and establish whether a root-executed scheduled script could be modified by a less-privileged account.

## Approach and Evidence

### Identify the web entry point

**Observation.** The recorded service scan showed Apache HTTP on port 80, and directory enumeration identified a development directory containing PHP shell files.

**Action.** The notes used web content enumeration, then opened the identified PHP shell.

```bash
feroxbuster --url http://<TARGET_HOST> --wordlist <WEB_CONTENT_WORDLIST>
```

```text
/dev
phpbash.php
```

**Significance.** An interactive shell exposed in a web-accessible development location turns an application discovery finding into command execution.

**Supported result.** The recorded shell identified the execution context as the web-service account:

```text
<WEB_SERVICE_USER>@<TARGET_HOST>:<WEB_ROOT>/dev$ whoami
<WEB_SERVICE_USER>
```

### Enumerate delegated sudo access

**Observation.** Local sudo enumeration showed that the web-service account could run commands as a separate script-management account without a password.

**Action.** The notes switched to that permitted account.

```bash
sudo -u <SCRIPT_MANAGER_USER> /bin/bash
```

```text
(<SCRIPT_MANAGER_USER> : <SCRIPT_MANAGER_USER>) NOPASSWD: ALL
```

**Significance.** A narrowly scoped identity transition can expose writable operational files unavailable to the web-service account.

**Supported result.** The notes report an interactive shell as the script-management account after the sudo transition.

### Assess writable scheduled-task material

**Observation.** The notes showed a Python script writable by the script-management account alongside an output file owned by root. The output file was reported to be rewritten repeatedly.

**Action.** The recorded approach replaced the writable script with sanitized callback logic and waited for scheduled execution.

```bash
cat > /scripts/test.py <<'PY'
# <SANITIZED_ROOT_CONTEXT_CALLBACK_LOGIC>
PY
```

```text
-rw-r--r-- 1 <SCRIPT_MANAGER_USER> <SCRIPT_MANAGER_USER> test.py
-rw-r--r-- 1 root                  root                  test.txt
```

**Significance.** Writable code executed by root is a privilege-boundary failure; file ownership and repeated root-owned output provided recorded basis for investigating scheduled execution.

**Supported result.** The notes report that, after scheduled task ran, callback context was root:

```text
# whoami
root
```

## Challenges and Decisions

The notes report that direct reverse-shell one-liners from web shell were unreliable. They instead used a small hosted script executed from a temporary location. Operational specifics are omitted because they are not required to explain access path.

## Outcome

Recorded evidence establishes command execution through an exposed development web shell, passwordless transition to a script-management account, and a root context after modifying a script associated with recurring root-owned output. Notes do not include independent scheduler configuration or a complete callback transcript, so scheduled root execution is reported as documented interpretation of those observations.

## Lessons and Recommendations

- Remove development shells and administrative tooling from web-accessible directories before deployment.
- Restrict sudo rules to specific required commands and avoid unrestricted command execution under other accounts.
- Ensure scripts executed by privileged schedulers are writable only by privileged owner and monitor changes to scheduled-task directories.
- Recommendations derive from recorded access path; notes do not document remediation testing.

## References

- Hack The Box [Bashed](https://app.hackthebox.com/machines/Bashed) machine, based on independently curated lab notes.
