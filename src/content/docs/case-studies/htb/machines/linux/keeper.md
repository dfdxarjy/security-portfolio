---
title: "Keeper — Default Credentials to KeePass Memory Disclosure"
description: "Default Request Tracker credentials and a password stored in a comment field provide user access; KeePass master-password recovery from a crash dump (CVE-2023-32784) unlocks an unencrypted root SSH key."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - default-credentials
  - keepass
  - cve-2023-32784
  - memory-disclosure
objective: "Default Request Tracker credentials and KeePass CVE-2023-32784 to a root SSH key"
tools:
  - nmap
  - curl
  - ssh
  - scp
  - keepass_dump.py
  - kpcli
  - puttygen
skill: "Default-credential chaining and memory-dump master-password recovery"
outcome: "Root SSH access"
---

## Summary

Keeper is an Easy-rated Hack The Box Linux lab that chains a default credential vulnerability in Request Tracker with a critical memory disclosure flaw in KeePass (CVE-2023-32784). The recorded chain authenticates to the helpdesk system using publicly documented default credentials, extracts a user password stored in an administrative comment field, recovers a KeePass master password from a crash dump via the CVE, then uses a PuTTY-format SSH key found inside the database to authenticate as root. Operator, target, credential, and archive-specific values are replaced with role-based placeholders below.

## Context and Objective

- **Target:** Ubuntu 22.04 Linux host running Request Tracker 4.4.4 and nginx
- **Services exposed:** SSH (port 22), HTTP (port 80)
- **Objective:** Achieve full compromise through the attack surface presented by the exposed services
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: two open TCP services. HTTP serves a minimal page with a hyperlink to a helpdesk ticketing application. SSH is standard OpenSSH.

Action: full TCP scan, then targeted version/script scan of ports 22 and 80.

```bash
nmap -p- --min-rate 10000 -oA <OUT_PREFIX> <TARGET_IP>
nmap -p 22,80 -sCV -oA <OUT_PREFIX> <TARGET_IP>
```

Representative excerpt (truncated):

```text
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.3
80/tcp open  http    nginx 1.18.0 (Ubuntu)
```

Technical significance: port 80 redirects to a helpdesk application hosted on a virtual host, suggesting further attack surface behind the web layer.

Result: the recorded output shows SSH and nginx with a helpdesk redirect on port 80.

### 2. Request Tracker Default Credentials

Observation: the helpdesk application is Request Tracker (RT) 4.4.4, disclosed in the login page footer. Default administrative credentials are publicly documented for this version.

Action: authenticate with default credentials, then enumerate the admin interface.

```bash
curl -s -c <COOKIE_FILE> -X POST http://<TARGET_HOST>/rt/NoAuth/Login.html \
  -d 'user=<ADMIN_USER>&pass=<ADMIN_DEFAULT_PASSWORD>' -L | grep -i "logged in\|logout\|dashboard"
```

Representative excerpt (identity generalized):

```text
RT 4.4.4+dfsg-2ubuntu1 (Debian)
<login success indicators>
```

Technical significance: default credentials on a production helpdesk system expose user records, ticket content, and attached files to any attacker who tries the documented defaults. Admin access also reveals a user profile with an initial password stored in a comment field.

Result: the recorded output confirms admin-level authentication to the ticketing system.

### 3. User Enumeration — Credential Recovery from Comment Field

Observation: the admin interface exposes user accounts. One user's profile contains an initial password in the Comments field. A ticket in the Recently Viewed section references a KeePass crash dump stored in that user's home directory.

Action: navigate Admin → Users, inspect the user profile and associated tickets.

Representative excerpt (identities generalized):

```text
Username: <LAB_USER>
Comments: New user. Initial password set to <LAB_USER_PASSWORD>
```

```text
Subject: Issue with Keepass Client on Windows
Attached to this ticket is a crash dump of the keepass program...
I have saved the file to my home directory and removed the attachment...
```

Technical significance: initial passwords must never be stored in ticketing system comment fields — they are visible to all administrative users and may be logged, backed up, or indexed. The ticket disclosure of a home-directory crash dump directly points to the privilege escalation vector.

Result: the recorded output shows a recoverable password and a disclosed crash dump path.

### 4. SSH Access as Low-Privilege User

Observation: the recovered password grants SSH access to the low-privilege account.

Action: authenticate over SSH using the recovered credential.

```bash
ssh <LAB_USER>@<TARGET_HOST>
# password: <LAB_USER_PASSWORD>
```

Representative excerpt:

```text
Welcome to Ubuntu 22.04.3 LTS
<LAB_USER>@<TARGET_HOST>:~$
```

Technical significance: the password stored in the comment field works directly for SSH, confirming credential reuse from the ticketing system to the operating system.

Result: the notes report a user-level shell and user flag in the home directory (flag content omitted).

### 5. Home Directory Enumeration — KeePass Crash Dump

Observation: the home directory contains an archive with a KeePass crash dump and a database file.

Action: extract the archive.

```bash
ls -la
unzip <ARCHIVE_FILE>
```

Representative excerpt:

```text
KeePassDumpFull.dmp   (process memory dump, ~242 MB)
passcodes.kdbx         (KeePass 2.x encrypted database)
```

Technical significance: a memory dump alongside a KeePass database immediately suggests CVE-2023-32784, which allows master password recovery from process memory.

Result: the recorded output shows both files extracted.

### 6. CVE-2023-32784 — KeePass Master Password Recovery from Memory

**Vulnerability overview:**

KeePass 2.x before version 2.54 stores the master password in process memory in a way that makes it recoverable from a memory dump. The root cause is how KeePass processes each character as it is typed: for each keystroke, a new managed string is allocated containing all characters typed so far (e.g., `p`, `pa`, `pas`, `pass`...). These intermediate strings are not securely zeroed and remain in the heap until garbage collection. A memory dump captures all partial strings, allowing the complete password to be reconstructed — with the exception of the first character, which never appears in a multi-character intermediate string.

Action: transfer the dump and database to the attack machine, then run a PoC recovery tool.

```bash
# On attack machine
scp <LAB_USER>@<TARGET_HOST>:<DUMP_PATH> .
scp <LAB_USER>@<TARGET_HOST>:<DATABASE_PATH> .
python3 keepass_dump.py -f <DUMP_FILE>
```

Representative excerpt (tool output, values generalized):

```text
Possible password: ●,<PASSWORD_FRAGMENT_1>
Possible password: ●<PASSWORD_FRAGMENT_1>
Possible password: ●`<PASSWORD_FRAGMENT_1>
```

Technical significance: the first character is unknown (shown as `●`), and some characters show multiple candidates. The pattern suggests a phrase — the attacker must resolve the correct combination through context or testing. The CVE is particularly severe because the dump can be taken at any point after the master password was entered, including hours later from a swap file or hibernation image.

Result: the recorded output shows partial password candidates from the memory dump.

### 7. KeePass Database Access — SSH Key Recovery

Observation: the recovered master password unlocks the KeePass database. The database contains a PuTTY-format SSH private key for the root user in the Notes field of a network credential entry.

Action: open the database with `kpcli`, navigate to the Network group, and extract the key.

```bash
kpcli:> open <DATABASE_FILE>
# Provide the master password when prompted
kpcli:/passcodes> cd Network/
kpcli:/passcodes/Network> show -f 0
```

Representative excerpt (credentials redacted):

```text
Title: <TARGET_HOST> (Ticketing Server)
Username: <ROOT_ACCOUNT>
Password: <ROOT_PASSWORD>
Notes: PuTTY-User-Key-File-3: ssh-rsa
       Encryption: none
       Comment: rsa-key-<KEY_DATE>
       Public-Lines: 6
       <PUBLIC_KEY_MATERIAL_REDACTED>
       Private-Lines: 14
       <PRIVATE_KEY_MATERIAL_REDACTED>
```

Technical significance: the root user's private key is stored unencrypted in a KeePass Notes field — a critical credential-management failure. The key is in PuTTY v3 format, which is not directly compatible with OpenSSH and requires conversion.

Result: the recorded output shows the key extracted from the database.

### 8. PuTTY Key Conversion and Root Access

Observation: PuTTY uses its own `.ppk` key format. Version 3 keys use a different encoding and MAC computation than OpenSSH keys; `ssh-keygen -i` handles only version 2 and fails on v3 keys. The `puttygen` utility handles version 3 correctly.

Action: save the extracted key as a protected file, convert it with `puttygen`, then SSH as root.

```bash
cp <EXTRACTED_PPK_FILE> <KEY_FILE>
sudo apt install putty-tools
puttygen <KEY_FILE> -O private-openssh -o <OPENSSH_KEY>
chmod 600 <OPENSSH_KEY>
ssh -i <OPENSSH_KEY> <ROOT_ACCOUNT>@<TARGET_HOST>
```

Representative excerpt:

```text
Welcome to Ubuntu 22.04.3 LTS
root@<TARGET_HOST>:~# id
uid=0(root) gid=0(root) groups=0(root)
```

Technical significance: the PuTTY v3 → OpenSSH conversion is required; attempting it with `ssh-keygen` produces a parse error. `puttygen` produces a standard PEM-format key usable by any SSH client. Direct root login via SSH key with no additional escalation step confirms the key was stored unencrypted in the database.

Result: the notes report a root shell and root flag (flag content omitted).

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| KeePass master password has unknown first character | Resolved by context — Danish phrase pattern | CVE-2023-32784 recovers all characters except the first; the pattern combined with user context identifies the full password |
| PuTTY v3 key incompatibility with standard conversion | Used `puttygen` instead of `ssh-keygen -i` | `ssh-keygen` only handles PuTTY version 2 format; v3 keys fail with parse error |

## Outcome

The evidence establishes: user-level access via a default credential vulnerability in Request Tracker combined with a password stored in a comment field; root access via CVE-2023-32784 memory disclosure recovering a KeePass master password, unlocking a database containing an unencrypted root SSH key. Every escalation step abused a distinct credential-management failure — default credentials, plaintext password in comments, unencrypted memory dump, and unencrypted private key in a password manager.

## Lessons and Recommendations

1. **Change default credentials before production deployment.** Request Tracker's default `root:password` is documented in the official installation guide. Any application deployed to production must have default credentials changed as the very first post-installation step. (Lesson grounded in this chain.)
2. **Never store credentials in ticketing system comment fields.** Initial passwords, SSH keys, and any authentication material must not be stored in comments, notes, or description fields. These fields are accessible to all administrative users and may be logged or indexed. Secrets should be delivered via a dedicated secrets manager with audit logging. (Lesson grounded in this chain.)
3. **Update KeePass to version 2.54 or later.** CVE-2023-32784 is patched in KeePass 2.54, which uses a different API for master password handling that prevents intermediate string accumulation. Rotate all stored credentials if previously using an unpatched version, since any captured memory dump can be exploited offline. (Recommendation.)
4. **Never store unencrypted private keys in password managers.** A KeePass database is designed to hold secrets, but storing a root SSH key in the Notes field of an entry undermines the entire trust chain. Private keys should be stored in hardware security modules or encrypted with strong, unique passphrases separate from the database. (Lesson grounded in this chain.)
5. **Audit memory handling for sensitive applications.** Process memory dumps, swap files, and hibernation images can contain secrets long after the application closes. Applications handling credentials must use secure memory allocation and explicit zeroing. (Recommendation.)

## References

- Hack The Box machine **[Keeper](https://app.hackthebox.com/machines/Keeper)** (retired lab; no active-instance detail)
- CVE-2023-32784: KeePass 2.x master password memory disclosure
- KeePass 2.54 security update notes
- Best Practical Request Tracker default credentials documentation
