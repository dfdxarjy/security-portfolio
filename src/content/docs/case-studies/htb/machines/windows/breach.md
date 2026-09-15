---
title: "Breach: Active Directory Delegation Exposure"
description: "A guest-readable logon script and excessive directory permissions lead through Kerberos delegation abuse to domain compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - kerberos
  - delegation
---

## Summary

This Hack The Box Active Directory lab began with a guest-readable logon script containing embedded authentication material. The notes report that directory permissions enabled service-principal abuse, followed by a delegation attack path to domain-level compromise. Identifiers, credentials, hashes, targets, and weaponized coercion details are omitted.

## Context and Objective

Recorded discovery identified standard Active Directory services, MSSQL, and RDP. Objective: review exposed domain resources, validate documented authorization relationships, and assess consequences of delegation privileges.

## Approach and Evidence

### Guest-readable logon script

Observation: a guest SMB enumeration identified a NETLOGON batch file containing a mapped-drive command with embedded credentials.

```bash
nxc smb <TARGET> -u Guest -p '' -M spider_plus
```

```text
NETLOGON
users.bat
net use <DRIVE>: \\<SERVER>\<SHARE> /user:<DOMAIN>\<ACCOUNT> <PASSWORD>
```

Action: recorded notes used the exposed account for domain enumeration. Technical significance: broadly readable operational scripts turn stored authentication material into an initial access path.

### Directory permission and service-ticket exposure

Observation: BloodHound analysis recorded `GenericWrite` from the recovered account to another user.

```bash
rusthound-ce -d <DOMAIN> -u <USER> -p <PASSWORD> -z
```

```text
<USER> --GenericWrite--> <TARGET_USER>
```

Action: notes report assigning a temporary SPN, requesting a service ticket, and recovering the target account's password offline. Technical significance: write permissions over an account can permit Kerberos abuse even without direct reset rights.

```bash
<DIRECTORY_TOOL> set object <TARGET_USER> servicePrincipalName -v <TEMPORARY_SPN>
<LDAP_TOOL> --kerberoasting <TICKET_OUTPUT>
```

```text
Service ticket captured for <TARGET_USER>
```

Result: notes report WinRM authentication as the target account.

### Delegation control path

Observation: source notes place the WinRM account in a delegation-administration group.

```bash
whoami /groups
```

```text
<DELEGATION_ADMIN_GROUP>
```

Action: notes report configuring a controlled machine account for unconstrained delegation and observing a domain controller ticket after an authentication-coercion event. Specific tooling, hostnames, and coercion payload are omitted because they would be attack-ready.

```text
Observed result: ticket for <DOMAIN_CONTROLLER_ACCOUNT>
```

Technical significance: unconstrained delegation can expose reusable service tickets when privileged systems authenticate to a delegated principal. The notes report this ticket enabled directory replication and administrative access.

## Outcome

The source supports a complete documented path from a readable logon script to domain-level access. It does not provide an independently preserved transcript for every intermediate action, so reported transitions are attributed to the notes.

## Lessons and Recommendations

- Remove credentials from logon scripts; use managed identities or access mechanisms that do not expose reusable passwords.
- Review and remove unconstrained delegation. Prefer constrained or resource-based constrained delegation where needed.
- Audit `GenericWrite` and other high-impact directory permissions on user and computer objects.
- Mitigate NTLM coercion routes on domain controllers and monitor privileged ticket activity.

## References

- Hack The Box, [Breach](https://app.hackthebox.com/machines/Breach) machine.
