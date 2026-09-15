---
title: "Networked: CentOS Web Shell Upload and Command Injection Chain"
description: "A leaked backup exposes upload source with weak MIME and extension checks, enabling a double-extension PHP web shell; command injection through filenames in a cron script and input validation gaps in a sudo network script lead to privileged access."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - centos
  - web
  - command-injection
  - privilege-escalation
  - cron
  - sudo
---

## Summary

Networked is a retired Easy Linux (CentOS) machine featuring a vulnerable image upload workflow and a command-injection chain leading to privileged access. Source code leaked from `/backup` revealed weak MIME and extension checks, enabling a PHP web shell with a double extension. After gaining a shell as `<WEB_SERVICE_ACCOUNT>`, a cron-executed cleanup script owned by `<CRON_OWNER_ACCOUNT>` was vulnerable to command injection through malicious filenames. Privilege escalation to privileged access abused a sudo network configuration script whose input validation allowed spaces, causing injected commands to be executed when `ifup` sourced the generated interface file.

All target and attacker IPs have been replaced with `<TARGET_IP>` and `<ATTACKER_IP>` placeholders. Distinct placeholders are used for distinct credentials; no actual secrets are disclosed.

## Context and Objective

The engagement targeted a CentOS 7 host running Apache httpd 2.4.6 with PHP 5.4.16. The objective was to achieve privileged access by exploiting the web application's upload functionality and leveraging misconfigurations in cron jobs and sudo permissions. The source notes provide a complete walkthrough from initial enumeration to privileged access.

## Approach and Evidence

### Enumeration

A port scan revealed OpenSSH 7.4 and Apache httpd 2.4.6.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Networked-TCP
```

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 7.4
80/tcp open  http    Apache httpd 2.4.6 ((CentOS) PHP/5.4.16)
```

Directory brute‑forcing discovered `/backup` and `/uploads`. The backup archive contained web source (`index.php`, `lib.php`, `photos.php`, `upload.php`).

### Upload Source Review

The upload script called `check_file_type()` from `lib.php` and enforced a small set of extensions (`.jpg`, `.png`, `.gif`, `.jpeg`). The upload name was rebuilt using the client IP and everything after the first dot, allowing a filename like `shell.php.gif` to be stored as `<ATTACKER_IP>.php.gif`. If Apache executes PHP in files containing `.php` anywhere in the name, this becomes code execution.

### PHP Web Shell Upload

A GIF‑looking PHP payload was created and uploaded through `/upload.php`. The stored name was confirmed via `/photos.php`. Command execution was triggered with a sanitized representative command:

```bash
curl 'http://<TARGET_IP>/uploads/<ATTACKER_IP>.php.gif?cmd=id'
```

A reverse shell was established using a placeholder pattern:

```bash
nc -lvnp <PORT>
```

```bash
<REVERSE_SHELL_REQUEST_REDACTED>
```

The recorded output shows a shell as `<WEB_SERVICE_ACCOUNT>`.

### Privilege Escalation to `<CRON_OWNER_ACCOUNT>`

The target user's home directory contained a cron entry executing `<TARGET_USER_HOME>/check_attack.php` every three minutes. The script scanned the target upload directory and built shell commands using unsanitized filenames:

```php
exec("nohup /bin/rm -f $path$value > /dev/null 2>&1 &");
```

A malicious filename was created in the uploads directory:

```bash
cd <TARGET_UPLOAD_DIRECTORY>
touch -- '<MALICIOUS_FILENAME_PATTERN>'
```

A listener was started:

```bash
nc -lvnp 9002
```

When the cron job ran, a shell as `<CRON_OWNER_ACCOUNT>` was obtained.

### Privilege Escalation to `<PRIVILEGED_ACCOUNT>`

The `<CRON_OWNER_ACCOUNT>` user had sudo rights for `/usr/local/sbin/changename.sh`. The script wrote user‑controlled values to `/etc/sysconfig/network-scripts/ifcfg-<CRON_OWNER_ACCOUNT>` and then ran `ifup <CRON_OWNER_INTERFACE>`. The regex `^[a-zA-Z0-9_\ /-]+$` allowed spaces and slashes. Network scripts sourced the generated file, so values containing a command path could be interpreted as shell syntax.

A reverse shell script was created and executed via the sudo script with a `NAME` value of `<COMMAND_PATH_INJECTION_PATTERN>`. The remaining prompts were filled with safe filler values (`none`, `no`, `dhcp`). The notes report that the listener received a privileged shell, but include no recorded shell output.

```bash
nc -lvnp 9003
```

The notes report a shell as `<PRIVILEGED_ACCOUNT>`; the listener transcript is not included.

## Challenges and Decisions

- The upload validation checked only the file extension and MIME type, not the actual content. The source notes recommend testing with a double extension to bypass Apache's PHP handler.
- The cron script's command injection required creating a file with a malicious name; the source notes document this technique.
- The sudo script's regex allowed spaces, enabling command injection via the `NAME` field; the source notes explain this weakness.

## Outcome

The evidence establishes that the target host was fully compromised from the initial web shell upload to privileged access. The chain exploited three distinct weaknesses: insecure file upload, command injection in a cron script, and insufficient input validation in a sudo‑run network script.

## Lessons and Recommendations

- File upload validation must validate content, extension, storage location, and web‑server execution behavior together.
- Source backups are often enough to design a precise upload bypass without guessing.
- Filenames are attacker‑controlled input. Passing them into shell commands without escaping is command injection.
- Input regexes that allow spaces can be dangerous when the output is later sourced by shell‑based system tooling.

## References

- Hack The Box machine page (optional, verified): [Networked](https://app.hackthebox.com/machines/Networked)
