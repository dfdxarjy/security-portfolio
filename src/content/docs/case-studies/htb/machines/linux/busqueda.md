---
title: "Busqueda: Searchor Injection and Relative-Path Sudo Abuse"
description: "Unsafe evaluation in a Searchor search request yields command execution; exposed Git credentials, container environment inspection through sudo, and relative-path execution in a root script extend access."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - flask
  - command-injection
  - gitea
  - sudo
---

## Summary

This Hack The Box Linux lab examined a Flask application using Searchor, where unsafe evaluation of a search request led to command execution as the application service account. The recorded chain continued through credentials exposed in a local Git configuration, Docker environment inspection through a restricted sudo command, and relative-path execution in a root-run script. Target identifiers, account names, credential values, and callback payloads are replaced with placeholders.

## Context and Objective

Recorded service enumeration identified SSH and HTTP on an Ubuntu host. The HTTP application presented a search-engine selector and query field; its footer identified Flask and Searchor. Objective: assess unsafe expression evaluation, exposed deployment credentials, and the privilege boundary created by the allowed maintenance script.

## Approach and Evidence

### Service discovery

Observation: the recorded scan found OpenSSH and Apache HTTP services.

```bash
rustscan -a <TARGET> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

```text
22/tcp open  ssh   OpenSSH 8.9p1 Ubuntu
80/tcp open  http  Apache httpd 2.4.52
```

Result: the notes identify the HTTP application as a Flask service using Searchor.

### Search request injection

Observation: the notes report that quote and slash characters in the `query` parameter changed the response, consistent with the parameter reaching a Python expression. The documented proof-of-concept broke out of the expected string context and invoked an operating-system command.

```http
POST /search HTTP/1.1
Host: <TARGET_HOST>
Content-Type: application/x-www-form-urlencoded

engine=Google&query=<PYTHON_EXPRESSION_INJECTION>
```

```text
<SERVICE_USER>@<TARGET>:<APPLICATION_DIRECTORY>$
```

Result: the recorded shell prompt establishes command execution as the application service account in the application directory. The original encoded callback payload is omitted.

### Git configuration credential exposure

Observation: the application directory contained a readable `.git` directory. Its remote URL included credentials for a Gitea repository.

```bash
cat <APPLICATION_DIRECTORY>/.git/config
```

```text
url = http://<GIT_USER>:<GIT_PASSWORD>@<GITEA_HOST>/<OWNER>/<REPOSITORY>.git
```

Result: the notes report that this password also authenticated the application service account locally. No independent authentication output is recorded.

### Restricted sudo Docker inspection

Observation: the application service account could run a maintenance script as root with arguments. The script exposed `docker-ps`, `docker-inspect`, and `full-checkup` actions.

```bash
sudo /usr/bin/python3 <MAINTENANCE_SCRIPT> docker-inspect '{{.Config.Env}}' <DATABASE_CONTAINER>
```

```text
MYSQL_USER=<DATABASE_USER>
MYSQL_PASSWORD=<DATABASE_PASSWORD>
MYSQL_DATABASE=<DATABASE_NAME>
```

Result: the recorded environment output exposed Gitea database credentials. The notes report that these credentials enabled Gitea Administrator access and access to the maintenance script source.

### Relative-path execution as root

Observation: the documented `full-checkup` branch invoked a script through a relative path, resolving the executable from the caller's current directory rather than a fixed trusted path.

```python
elif action == 'full-checkup':
    arg_list = ['./<CHECKUP_SCRIPT>']
    print(run_command(arg_list))
```

```bash
printf '%s\n' '<SANITIZED_CALLBACK_PAYLOAD>' > full-checkup.sh
chmod +x full-checkup.sh
sudo /usr/bin/python3 <MAINTENANCE_SCRIPT> full-checkup
```

```text
root@<TARGET>:<WORKING_DIRECTORY># whoami
root
```

Result: recorded output establishes root command execution. The callback payload, listener details, and root flag are omitted.

## Outcome

The notes establish a chain from Searchor expression injection to application service-account shell access, exposed Git credentials, inspection of container environment variables through sudo, and root execution through a relative-path script call. Service and root shell prompts support command-execution outcomes; local authentication and Gitea Administrator access are reported by the notes without separate supporting output.

## Lessons and Recommendations

- Avoid evaluating user-controlled input as Python expressions; use fixed query handling and allowlisted search-engine selection.
- Keep credentials out of Git remote URLs and rotate any credentials exposed through repository configuration.
- Do not expose secrets through container environment variables or broadly privileged inspection tooling.
- Bind root-run scripts to absolute, controlled executable paths and restrict their accepted actions and arguments.

## References

- Hack The Box, [Busqueda](https://app.hackthebox.com/machines/Busqueda) machine.
