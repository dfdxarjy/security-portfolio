---
title: "Builder: Jenkins CLI File Read and Credential Exposure"
description: "Unauthenticated Jenkins CLI file read (CVE-2024-23897) exposes a password hash and Script Console access, and credential storage reveals a path to root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - jenkins
  - ci-cd
  - credential-management
---

## Summary

This Hack The Box Linux lab examined a Jenkins deployment affected by CVE-2024-23897. The notes show that unauthenticated Jenkins CLI argument expansion exposed files readable by Jenkins, leading to a password hash and authenticated Script Console access. Jenkins credential storage then exposed a path to root-level access. Target details, credentials, hashes, private keys, and payloads are omitted.

## Context and Objective

Enumeration identified SSH and a Jenkins service over HTTP. The recorded Jenkins version was 2.441. Objective: assess the impact of exposed Jenkins CLI behavior, privileged administrative features, and stored deployment credentials.

## Approach and Evidence

### Jenkins service discovery

Observation: recorded service scanning identified Jenkins on its HTTP service and OpenSSH on the host.

```bash
nmap -sC -sV -p- -oA <SCAN_OUTPUT> <TARGET>
```

```text
22/tcp   open  ssh   OpenSSH
8080/tcp open  http  Jetty
|_http-title: Dashboard [Jenkins]
```

Result: the notes identify Jenkins 2.441 from HTTP response material and the login page.

### Unauthenticated CLI file read

Observation: Jenkins versions through 2.441 were affected by CVE-2024-23897. The notes describe CLI arguments beginning with `@` as file reads processed before command handling; error output can disclose file contents available to the Jenkins process.

```bash
java -jar <JENKINS_CLI_JAR> -s <JENKINS_URL> help "@<JENKINS_USERS_INDEX>" 2>&1
```

```text
Recorded output included a Jenkins user-directory identifier.
```

Action: the notes report using that identifier to request the corresponding user configuration and recover a bcrypt password hash. The hash and account-specific path are omitted.

```bash
java -jar <JENKINS_CLI_JAR> -s <JENKINS_URL> help "@<JENKINS_USER_CONFIG>" 2>&1
```

```text
<passwordHash><BCRYPT_PASSWORD_HASH></passwordHash>
```

Result: the source reports that offline password recovery enabled Jenkins authentication. It does not provide independent authentication output.

### Script Console execution

Observation: Jenkins Script Console executes Groovy with Jenkins process permissions. The notes report authenticated access to this administrative feature after password recovery.

```groovy
println "id".execute().text
```

```text
uid=<JENKINS_UID>(jenkins) gid=<JENKINS_GID>(jenkins)
```

Result: recorded output establishes operating-system command execution as the Jenkins service account. The original download-and-execute and reverse-shell material is omitted.

### Credential-store privilege boundary

Observation: the Jenkins home directory contained `credentials.xml`, including an encrypted SSH private key for root. The notes state that Jenkins' `hudson.util.Secret` API can decrypt values protected by its own credential mechanism.

```groovy
println(hudson.util.Secret.decrypt("<ENCRYPTED_JENKINS_SECRET>"))
```

```text
Recorded result: a root SSH private key was decrypted.
```

Action: the notes report using the recovered key for direct root SSH access. The encrypted value, plaintext key, connection details, and authentication command are omitted because they would expose credentials and an attack-ready access path.

## Outcome

The source establishes a documented chain from Jenkins CLI file disclosure to a recovered password hash, Jenkins administrative code execution, and root credential recovery. Service-account execution has supporting output; later authentication and root-access outcomes are reported by the notes rather than independently shown.

## Lessons and Recommendations

- Update Jenkins to a release that addresses CVE-2024-23897 and disable the CLI when it is not required.
- Restrict Script Console access to dedicated administrators, audit its use, and alert on unexpected executions.
- Keep privileged infrastructure credentials out of CI/CD stores; use narrowly scoped, time-limited deployment identities instead.
- Limit Jenkins process access to files and credentials not required for its workload.

## References

- Hack The Box, [Builder](https://app.hackthebox.com/machines/Builder) machine.
- Jenkins security advisory for CVE-2024-23897.
