---
title: "LogJammer: Windows Event Log Incident Reconstruction"
description: "HTB Sherlock case study reconstructing a single-host Windows event-log timeline with Chainsaw: interactive logon, discovery-tool detection, audit-policy tampering, scheduled-task persistence, and Firewall log clearing."
type: case-study
platform: Hack The Box
content_type: sherlock
status: published-ready
addedAt: "2026-09-14"
tags:
  - dfir
  - windows-event-logs
  - incident-response
---

## Summary

This Hack The Box Sherlock used Windows Security, System, Firewall, Defender, and PowerShell event logs to reconstruct a single-host malicious-activity timeline. Target identities, account names, paths, ports, task names, and credential-bearing arguments are replaced with role-based placeholders. The notes report interactive access, security-control changes, scheduled-task persistence, discovery-tool detection, and firewall-log clearing; available events support timeline correlation, not conclusions beyond recorded artifacts.

## Context and Objective

Provided Windows event-log artifacts were examined with Chainsaw and text filtering. Objective: identify initial access, persistence, post-compromise activity, defense evasion, and relevant response actions. Timestamps in recorded event output use UTC.

## Approach and Evidence

### Establish initial access

**Observation.** Security event ID 4624 records successful logons. The first matching record has an interactive logon type and a local-console logon process.

**Action.** Filtered Security events for successful logons associated with the account placeholder.

```bash
chainsaw search -t 'Event.System.EventID: =4624' <SECURITY_LOG> --skip-errors | grep -i '<ACCOUNT>' -A 20 -B 20
```

```text
SystemTime: <UTC_TIMESTAMP>
TargetUserName: <ACCOUNT>
LogonType: 2
LogonProcessName: 'User32 '
```

**Significance.** Logon type 2 identifies an interactive session and provides an anchor for correlating later activity.

**Result.** The notes report this as first successful interactive logon; two logon times were present, with duplicate records for each event.

### Correlate discovery-tool detection and firewall modification

**Observation.** Defender detection and remediation events identify a discovery tool, while a firewall event records an outbound rule modification made through a management process.

**Action.** Queried Defender detection/remediation events and firewall rule-creation events within the incident window.

```bash
chainsaw search -t 'Event.System.EventID: =1117' <DEFENDER_LOG> --skip-errors -q | grep -E 'SystemTime:|Threat Name:|Action Name:'
```

```text
SystemTime: <UTC_TIMESTAMP>
Threat Name: <DETECTED_DISCOVERY_TOOL>
Action Name: Quarantine
```

```bash
chainsaw search -t 'Event.System.EventID: =2004' <FIREWALL_LOG> --skip-errors | grep '<REMOTE_PORT>' -A 20 -B 20
```

```text
SystemTime: <UTC_TIMESTAMP>
RuleName: <FIREWALL_RULE>
RemotePorts: '<REMOTE_PORT>'
Direction: 2
ModifyingApplication: <MANAGEMENT_PROCESS>
```

**Significance.** The Defender 1116/1117 sequence distinguishes detection from quarantine. Direction value 2 indicates outbound traffic in recorded event semantics; the rule modification is relevant to command-and-control investigation.

**Result.** The notes report Defender quarantined the detected discovery tooling shortly after detection and an outbound firewall rule was added during the same activity window.

### Identify audit-policy tampering and scheduled-task persistence

**Observation.** Security event ID 4719 records an audit-policy change, followed by event ID 4698 for scheduled-task creation.

**Action.** Searched all supplied event logs for those event IDs and reviewed task-content fields from the creation event.

```bash
chainsaw search -t 'Event.System.EventID: =4719' <EVENT_LOG_DIRECTORY> --skip-errors
```

```text
EventID: 4719
SystemTime: <UTC_TIMESTAMP>
SubcategoryId: '<AUDIT_SUBCATEGORY_ID>'
AuditPolicyChanges: '<AUDIT_CHANGE_VALUE>'
```

```bash
chainsaw search -t 'Event.System.EventID: =4698' <EVENT_LOG_DIRECTORY> --skip-errors
```

```text
EventID: 4698
SystemTime: <UTC_TIMESTAMP>
SubjectUserName: <ACCOUNT>
TaskName: <SCHEDULED_TASK>
Command: <SCRIPT_PATH>
Arguments: <REDACTED_ARGUMENTS>
```

**Significance.** The audit subcategory maps to Other Object Access Events in Microsoft documentation. Scheduled-task creation is a persistence-relevant artifact and should be reviewed with its referenced script and task definition.

**Result.** The notes report an audit-policy change followed by creation of a scheduled task that invoked a PowerShell script; no claim is made about script behavior beyond recorded task content.

### Confirm subsequent PowerShell activity and log clearing

**Observation.** PowerShell script-block logging records a file-hash command against the scheduled-task script. A System event ID 104 identifies clearing of the Firewall log channel.

**Action.** Filtered script-block events for the activity window and searched the System log for channel-clear events.

```bash
chainsaw search -t 'Event.System.EventID: =4104' <POWERSHELL_LOG> --skip-errors -q | grep -E 'SystemTime:|ScriptBlockText:'
```

```text
SystemTime: <UTC_TIMESTAMP>
ScriptBlockText: Get-FileHash -Algorithm <HASH_ALGORITHM> <SCRIPT_PATH>
```

```bash
chainsaw search -t 'Event.System.EventID: =104' <SYSTEM_LOG> --skip-errors -q | grep -E 'SystemTime:|Channel:|SubjectUserName'
```

```text
SystemTime: <UTC_TIMESTAMP>
SubjectUserName: <ACCOUNT>
Channel: <FIREWALL_LOG_CHANNEL>
```

**Significance.** Script-block logging supplies execution context. Event ID 104 is a generic channel-clear event, so channel field review is necessary before assigning the affected log.

**Result.** The notes report a hash-check command against the scheduled-task script and later clearing of the Firewall log channel.

## Challenges and Decisions

Module-generated PowerShell script blocks created noise. The notes report excluding known module noise before reviewing the relevant time window. Defender event ID 1116 was treated as detection only; the separate ID 1117 event supplied the recorded quarantine action. A Security log-clear event preceding initial access was not included in the incident chain.

## Outcome

The notes report a correlated single-host sequence: interactive logon, discovery-tool detection, outbound firewall modification, audit-policy change, scheduled-task creation, PowerShell activity, and Firewall log clearing. This establishes a high-priority investigation sequence from supplied artifacts. It does not establish effects of the scheduled script, data access, exfiltration, or activity outside available logs.

## Lessons and Recommendations

- Correlate event IDs 4624, 1116, 1117, 2004, 4719, 4698, 4104, and 104 by UTC time rather than treating individual alerts as independent.
- Treat Firewall event direction and cleared-channel fields as required context before inferring traffic direction or log scope.
- **Recommendation:** preserve the complete event-log set and scheduled-task XML before containment actions.
- **Recommendation:** review outbound firewall-rule changes, restore approved audit policy, investigate the referenced task and script, and recover cleared Firewall telemetry from centralized logging or backups where available.
- **Recommendation:** validate Defender quarantine coverage for all related artifacts and review identity and directory activity for follow-on discovery.

## References

- Hack The Box, [*LogJammer*](https://app.hackthebox.com/sherlocks/LogJammer) Sherlock.
- Microsoft, [Group Policy: Audit Configuration Protocol](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-gpac/77878370-0712-47cd-997d-b07053429f6d).
