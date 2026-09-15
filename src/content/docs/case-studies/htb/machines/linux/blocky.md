---
title: "Blocky: Plugin Source Exposure to Privileged Access"
description: "Web enumeration exposes a custom Java plugin; decompilation reveals hardcoded credentials for SSH access, and an unrestricted sudo policy yields root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web-enumeration
  - credential-management
  - sudo
---

## Summary

This Hack The Box lab followed a web-to-host path: web enumeration exposed a custom Java plugin, plugin analysis exposed an application credential, and the notes report that credential enabled SSH access. All target identifiers and credential material are replaced with placeholders. The recorded `sudo` policy then established unrestricted administrative execution.

## Context and Objective

The Linux lab exposed FTP, SSH, HTTP, and a Minecraft service. Its HTTP response identified a WordPress deployment, while content discovery identified administrative and plugin-related paths. Objective: validate documented attack path and determine privilege boundary after authenticated access.

## Approach and Evidence

### Service and content discovery

Observation: recorded service discovery showed SSH, HTTP, and Minecraft, and web enumeration returned `/wp-admin`, `/phpmyadmin`, and `/plugins`.

```bash
nmap -Pn -sC -sV -oN <SCAN_OUTPUT> <TARGET>
```

```text
22/tcp    open  ssh
80/tcp    open  http
25565/tcp open  minecraft
```

Action: enumerated HTTP content and reviewed exposed plugin artifacts. Technical significance: plugin archives can expose application implementation details not visible in browser-rendered content.

```bash
feroxbuster --url http://<TARGET> --wordlist <WORDLIST> -n
```

```text
/wp-admin
/phpmyadmin
/plugins
```

Result: `/plugins` contained a custom `BlockyCore.jar` artifact in recorded output.

### Plugin analysis and authenticated access

Observation: decompilation of custom plugin code showed hard-coded database authentication material.

```bash
jadx <PLUGIN_ARCHIVE>
```

```java
this.sqlUser = "<DATABASE_USER>";
this.sqlPass = "<DATABASE_PASSWORD>";
```

Action: notes report using this application credential with phpMyAdmin, where a WordPress account name was identified, then using documented credential reuse to authenticate over SSH. Technical significance: embedded credentials can bridge application-layer source exposure and operating-system access when credential separation is absent.

```bash
ssh <LAB_USER>@<TARGET>
```

```text
<LAB_USER>@<HOST>:~$
```

Result: recorded output shows an authenticated shell; the notes do not include an independent login transcript beyond the prompt.

### Privilege boundary review

Observation: the authenticated account's sudo policy allowed all commands as all users.

```bash
sudo -l
```

```text
User <LAB_USER> may run the following commands:
    (ALL : ALL) ALL
```

Action: used the documented unrestricted sudo capability to obtain an administrative shell.

```bash
sudo su -
whoami
```

```text
root
```

Result: recorded output establishes administrative context.

## Outcome

The notes establish a chain from exposed custom plugin code to an authenticated SSH session and unrestricted sudo access. Credential values, target details, database contents, and flag locations are intentionally omitted.

## Lessons and Recommendations

- Do not publish plugin archives containing embedded credentials; use managed secrets and rotate any exposed values.
- Segregate application, database, and operating-system credentials to prevent a single disclosure from crossing trust boundaries.
- Restrict sudo rules to minimum required commands and identities; `(ALL : ALL) ALL` removes meaningful privilege separation.
- Treat exposed development artifacts as sensitive deployment content and test web roots for unintended archive disclosure.

## References

- Hack The Box, [Blocky](https://app.hackthebox.com/machines/Blocky) machine.
