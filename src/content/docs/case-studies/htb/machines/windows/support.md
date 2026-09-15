---
title: "Support — Credential Exposure and Delegation Risk"
description: "Guest-accessible tooling, reversible credential obfuscation, and excessive computer-object permissions form a path to privileged access."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - credential-management
  - access-control
---

## Summary

Support is a Hack The Box Windows Active Directory lab. The notes report that guest-accessible tooling, reversible credential obfuscation, sensitive directory attributes, and excessive computer-object permissions formed a path to privileged access. Target identifiers, account names, credentials, and artifacts are replaced with distinct placeholders. This draft records defensive lessons, not operational exploitation steps.

## Context and Objective

The notes describe a Windows Active Directory environment with guest-readable SMB content and standard directory services. Objective: assess how exposed application secrets, directory data, and delegated permissions could combine into material privilege risk within the lab.

## Approach and Evidence

### 1. Review Guest-Accessible Tooling

**Observation.** The notes report that a guest-readable SMB share contained a compressed .NET utility.

**Action.** Review share-access evidence and preserve the utility for offline security assessment; no executable was run.

**Significance.** Broadly readable internal tooling can expose implementation details and embedded secrets.

**Sanitized command-output.**

```text
$ smbclient -N -L //<TARGET_HOST>
        Sharename       Type      Comment
        ---------       ----      -------
        <TOOL_SHARE>    Disk

$ smbclient -N //<TARGET_HOST>/<TOOL_SHARE> -c 'ls'
  <UTILITY_ARCHIVE>
```

**Sourced result.** The notes report retrieval of a .NET utility for offline analysis.

### 2. Assess Embedded Credential Protection

**Observation.** The notes identify a .NET assembly containing an encoded credential and a reversible transformation routine.

**Action.** Review decompiled logic offline to determine whether the protection could resist inspection; credential material remains redacted.

**Significance.** A static algorithm and embedded key do not provide secure credential storage when users can inspect a client binary.

**Sanitized command-output.**

```text
$ ildasm <UTILITY_ASSEMBLY> /text
  .field private string encoded_value
  .field private string transform_key
  // reversible byte operation
```

**Sourced result.** The notes report recovery of an LDAP service credential; no credential value is included here.

### 3. Identify Sensitive Directory Attributes

**Observation.** The notes report that authenticated directory enumeration exposed a plaintext credential in a user `info` attribute.

**Action.** Review the recorded directory-query result and classify the attribute as sensitive-data exposure.

**Significance.** Readable directory attributes can disclose credentials to principals with ordinary authenticated access.

**Sanitized command-output.**

```text
$ ldapsearch -x -H ldap://<DIRECTORY_HOST> -D '<LAB_USER>' -w '<LAB_USER_PASSWORD>' -b '<BASE_DN>' '(objectClass=user)' info
dn: CN=<LAB_USER>,<BASE_DN>
info: <LAB_USER_PASSWORD>
```

**Sourced result.** The notes report that the exposed credential authenticated as a lab user with remote-management access.

### 4. Review Delegated Computer-Object Permissions

**Observation.** The notes report that the lab user belonged to a group with `GenericAll` rights over a domain-controller computer object.

**Action.** Review recorded Active Directory relationship data and the affected authorization attribute; no delegation change, ticket request, or remote-access procedure is included.

**Significance.** Write-level control over computer-object delegation settings can enable impersonation paths without a software vulnerability.

**Sanitized command-output.**

```text
$ dsacls '<DOMAIN_CONTROLLER_OBJECT>'
  Allow <LAB_GROUP>  GENERIC ALL
  Attribute: msDS-AllowedToActOnBehalfOfOtherIdentity
```

**Sourced result.** The notes report that this permission path was used to obtain privileged access in the lab; operational steps and access artifacts are omitted.

## Challenges and Decisions

The notes describe static analysis rather than execution of the utility. The embedded transformation logic was sufficient for the reported credential-recovery finding, avoiding a need to execute the binary.

## Outcome

The notes report privileged access through exposed tooling, reversible credential protection, sensitive directory data, and excessive delegation-related permissions. This draft establishes the documented risk chain and defensive implications; it does not reproduce credentials, flags, target details, or access procedures.

## Lessons and Recommendations

1. Do not embed service credentials in client binaries. Use protected secret storage or certificate-based service authentication.
2. Remove unnecessary `GenericAll` and other write permissions on computer objects, including access to `msDS-AllowedToActOnBehalfOfOtherIdentity`.
3. Do not store passwords, keys, or other secrets in broadly readable directory attributes such as `info`, `description`, or `comment`.
4. Review guest-accessible shares for internal utilities and restrict access to material not intended for unauthenticated users.

## References

- Hack The Box: [Support](https://app.hackthebox.com/machines/Support) machine lab.
