---
title: "Availability Checker — Git Exposure, Race Condition, and Unsafe Privilege Boundaries"
description: "Exposed version-control metadata and a custom-header development virtual host lead to an upload blocklist bypass and race condition for a web-service shell; a SUID Python 2 input() helper and a package-installer sudo rule reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - git
  - race-condition
  - suid
  - python
---

## Summary

This Linux lab hosts a website availability checker. Initial access chains exposed version-control metadata, a custom-header gate on a development virtual host, and an upload handler with an incomplete extension blocklist and a race condition in its cleanup logic. Post-exploitation, privilege escalation abuses a SUID helper wrapping unsafe Python 2 `input()` and an overly broad package-installer sudo rule.

All IPs shown are placeholders. Commands and output are sanitized representatives drawn from the lab notes.

## Context and Objective

The lab exposes SSH (port 22) and an Apache web server (port 80). The web application presents a basic availability checker. The objective is to achieve initial access, escalate to a user-level shell, and obtain root.

## Approach and Evidence

### Enumeration — Port Scan and Directory Discovery

A port scan identified OpenSSH 8.2p1 and Apache 2.4.41. The web page footer disclosed a lab domain, represented here as `<TARGET_DOMAIN>`, which was added to the local hosts file.

Directory brute-forcing revealed a development path and exposed version-control metadata:

```bash
feroxbuster --url http://<TARGET_DOMAIN>/ --wordlist /usr/share/seclists/Discovery/Web-Content/common.txt
```

```text
301  GET  http://<TARGET_DOMAIN>/<DEVELOPMENT_PATH>      => http://<TARGET_DOMAIN>/<DEVELOPMENT_PATH>/
301  GET  http://<TARGET_DOMAIN>/<DEVELOPMENT_PATH>/<VCS_METADATA> => http://<TARGET_DOMAIN>/<DEVELOPMENT_PATH>/<VCS_METADATA>/
```

The exposed metadata was recovered locally with a repository-dumping tool. The recovered configuration gated access behind a custom HTTP header:

```apache
SetEnvIfNoCase <DEVELOPMENT_HEADER> "<DEVELOPMENT_HEADER_VALUE>" Required-Header
Order Deny,Allow
Deny from All
Allow from env=Required-Header
```

This header gate is weak access control — anyone who recovers or guesses its values reaches the protected development application.

### Virtual Host Discovery

Virtual host enumeration identified a development virtual host, represented as `<DEVELOPMENT_VHOST>`, which returned 403 without the custom header and exposed the development upload interface with it:

```bash
curl -i -H '<DEVELOPMENT_HEADER>: <DEVELOPMENT_HEADER_VALUE>' http://<DEVELOPMENT_VHOST>/
```

Content discovery on the development vhost found a browsable upload directory.

### Source Code Analysis

The leaked PHP source revealed two critical weaknesses in the upload handler:

1. **Predictable upload path** — files land in `<UPLOAD_PATH>/<PREDICTABLE_DIRECTORY>/<FILENAME>`, making the directory guessable.
2. **Extension blocklist** — the filter blocks `.php`, `.phtml`, `.py`, `.pl`, and archive formats, but `.phar` is not blocked. PHP interprets `.phar` files, making them a valid payload vector.
3. **Delayed cleanup** — the uploaded file is deleted only after the URL checker finishes processing it, creating a race condition.

The exploitation plan:

- Upload a server-interpreted file type that bypasses the extension blocklist.
- Cause the checker to await a controlled external response so cleanup is delayed.
- Request the uploaded file before the application deletes it.

### Initial Access — Upload Race and proc_open Shell

A controlled endpoint was used to delay the checker's outbound request:

```bash
nc -lvnp <LISTENER_PORT>
```

The uploaded file used a language-specific parser-stop marker so trailing data was not interpreted as code. The executable content is omitted.

The file was uploaded through the development checker and the resulting path browsed:

```text
http://<DEVELOPMENT_VHOST>/<UPLOAD_PATH>/<PREDICTABLE_DIRECTORY>/<UPLOADED_FILE>
```

`phpinfo()` confirmed code execution but showed that common execution functions (`system`, `exec`, `shell_exec`, `popen`, `passthru`) are disabled via `disable_functions`. The function `proc_open` was not disabled, providing a viable alternative.

The remaining enabled process-creation primitive was used to obtain command execution; the reverse-shell payload is omitted.

After upload and race-condition trigger, a shell was received as the web-service account.

```text
uid=<WEB_SERVICE_UID>(<WEB_SERVICE_ACCOUNT>)
```

### Privilege Escalation — SUID Python 2 Helper

An application-user home directory contained a SUID binary (`<SUID_HELPER>`) executable by the web-service group, alongside its Python 2 source:

```python
import requests
url = input("Enter URL here:")
page = requests.get(url)
if page.status_code == 200:
    print "Website is up"
else:
    print "Website is down"
```

The `print "..."` syntax confirms Python 2. In Python 2, `input()` evaluates the provided string as Python code. In a SUID execution context (running as an application user), this becomes a privilege escalation primitive.

A Python expression was supplied as the "URL" input, causing the SUID helper to evaluate code. The privileged execution payload is omitted.

```bash
./<SUID_HELPER>
```

This yielded a shell with application-user privileges. A private access key was present, but was not retained or used in this account.

```text
uid=<APPLICATION_USER_UID>(<APPLICATION_USER>)
```

### Root Escalation — Package Installer Sudo

The application-user account had an unrestricted `NOPASSWD` sudo rule for a package installer:

```text
(ALL) NOPASSWD: <PACKAGE_INSTALLER_PATH>
```

The legacy Python package installer processes package setup logic. A package definition with privileged execution behavior was prepared; its executable content is omitted.

Executed via the allowed sudo command:

```bash
sudo <PACKAGE_INSTALLER_PATH> <LOCAL_PACKAGE_PATH>
```

This spawned a root shell.

```text
uid=0(root)
```

## Challenges and Decisions

- **Extension filtering bypass**: The blocklist approach missed `.phar`. An allowlist policy would have prevented this.
- **Race condition exploitation**: The file cleanup delay was essential. The checker had to be stalled by pointing it at an attacker-controlled listener, keeping the uploaded file accessible long enough to trigger it manually.
- **Restricted shell environment**: Common PHP execution functions were disabled. `proc_open` provided the necessary escape. Identifying available functions from `phpinfo()` output was a key diagnostic step.
- **Python 2 `input()`**: The SUID helper used Python 2's `input()`, which evaluates arbitrary code. This is a well-known vulnerability class; the combination with SUID made it directly exploitable.

## Outcome

The lab was fully compromised: initial access as the web-service account via the upload race condition, escalation to an application-user account via the SUID Python 2 helper, and root via the package-installer sudo rule. All three escalation stages relied on distinct misconfigurations — incomplete extension filtering, unsafe interpreter usage in a SUID context, and an overly broad sudo entry for a package manager.

## Lessons and Recommendations

- **Block access to `.git` directories and development paths.** Web servers must not serve version control metadata. Development virtual hosts should not be publicly accessible, and access control should not rely on static custom headers.
- **Use allowlist-based upload validation.** Only explicitly required extensions and MIME types should be accepted. Uploaded files should be stored outside the web root, renamed to server-generated names, and served through a download handler rather than being directly executable.
- **Avoid predictable upload paths.** `md5(time())` is guessable. Use cryptographically random directory names and prevent directory listing.
- **Do not use SUID wrappers around interpreters or scripts.** Python 2 `input()` evaluates user input and should never be used with untrusted data. Any privileged helper should be small, compiled, audited, and designed around fixed operations rather than arbitrary input.
- **Audit `NOPASSWD` sudo entries against GTFOBins.** Package managers and installer tools can execute attacker-controlled setup code. Restrict the exact package source and command arguments rather than allowing unrestricted execution.

## References

- Hack The Box Linux machine lab ([UpDown](https://app.hackthebox.com/machines/UpDown)); identity and internal identifier omitted.
