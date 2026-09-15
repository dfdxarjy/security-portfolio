---
title: "Reaper: Correlating an NTLM Relay Investigation"
description: "Correlating a packet capture with Windows Security event logs to investigate a suspected NTLM relay and authenticated SMB share activity."
type: case-study
platform: Hack The Box
content_type: sherlock
status: published-ready
addedAt: "2026-09-14"
tags:
  - dfir
  - windows
  - ntlm
  - smb
---

## Summary

This sanitized Hack The Box Sherlock case study examines a suspected NTLM relay using a packet capture and Windows Security event log. Target names, addresses, account names, share names, session identifiers, and ports are replaced with role-based placeholders. The notes report that correlation of network and host evidence established an NTLM-authenticated network logon followed by SMB share activity.

## Context and Objective

The provided evidence comprised a network capture and a Security event log from the surrounding timeframe. The objective was to investigate an alert for a mismatch between a claimed source workstation and its network address, then determine whether the artifacts supported compromise. The notes report no persistence or privilege-escalation activity within examined scope.

## Approach and Evidence

### Establish workstation-to-address context

**Observation.** The notes report NetBIOS Name Service refreshes for two workstations in the capture.

**Action.** I reviewed `nbns` traffic to associate the recorded workstation labels with sanitized network addresses.

```text
Wireshark display filter: nbns

Refresh NB <WORKSTATION_A><00>  <WORKSTATION_A_IP>
Refresh NB <WORKSTATION_B><20>  <WORKSTATION_B_IP>
```

**Significance.** This context made later comparison of the claimed workstation and observed source address possible.

**Result.** The notes report that `<WORKSTATION_B>` was associated with `<WORKSTATION_B_IP>`, distinct from `<RELAY_SOURCE_IP>` seen during authentication.

### Correlate NTLM authentication with the Windows logon

**Observation.** The notes report an SMB session-setup request containing NTLM authentication for `<COMPROMISED_ACCOUNT>`, followed by Security event ID 4624.

**Action.** I reviewed `ntlmssp` traffic and filtered the event log for successful logons associated with the account.

```text
Wireshark display filter: ntlmssp
SMB2 Session Setup Request, NTLMSSP_AUTH, User: <COMPROMISED_ACCOUNT>

chainsaw search -t 'Event.System.EventID: =4624' Security.evtx --skip-errors | grep -i '<COMPROMISED_ACCOUNT>' -A 30 -B 30
TargetUserName: <COMPROMISED_ACCOUNT>
LogonType: 3
AuthenticationPackageName: NTLM
WorkstationName: <WORKSTATION_B>
IpAddress: <RELAY_SOURCE_IP>
```

**Significance.** A network logon that claims `<WORKSTATION_B>` while originating from `<RELAY_SOURCE_IP>` is consistent with the alert condition and provides a cross-artifact pivot.

**Result.** The notes report that the authentication and event record identified an NTLM relay scenario involving `<COMPROMISED_ACCOUNT>`; the event-log result is reported rather than independently reproduced here.

### Link SMB navigation and share-access evidence

**Observation.** The notes report an SMB tree-connect request in the capture and an event ID 5140 network-share access record.

**Action.** I reviewed `smb2` traffic and filtered the event log for share-access records associated with the account.

```text
Wireshark display filter: smb2
Tree Connect Request, Tree: <TARGET_SHARE>

chainsaw search -t 'Event.System.EventID: =5140' Security.evtx --skip-errors | grep -i '<COMPROMISED_ACCOUNT>' -A 30 -B 30
SubjectUserName: <COMPROMISED_ACCOUNT>
IpAddress: <RELAY_SOURCE_IP>
ShareName: <AUTHENTICATION_SHARE>
```

**Significance.** The notes report that shared session attributes connected the suspicious logon to both the authentication-process share access and the captured tree-connect activity.

**Result.** The notes report authenticated SMB share activity after the suspicious NTLM logon. They do not establish file reads, writes, or activity beyond recorded share touches.

## Challenges and Decisions

The evidence sources use different scopes: capture offsets are capture-relative, while Security events provide absolute UTC timestamps. The notes report that session attributes, rather than direct timestamp equality, were used to correlate the logon and share-access records. The capture identified navigation toward `<TARGET_SHARE>`; the event log identified `<AUTHENTICATION_SHARE>`, so the two were treated as different observed share contexts rather than interchangeable evidence.

## Outcome

The notes report a confirmed compromise classification based on NTLM relay indicators, a workstation/address mismatch, and authenticated SMB share activity. Evidence supports one observed relay session and recorded share touches. It does not establish broader victim scope, file-level actions on the navigated share, or persistence on the relay system.

## Lessons and Recommendations

- Detection should correlate Security event 4624 network logons using NTLM with claimed-workstation and source-address mismatches.
- Detection should correlate suspicious 4624 activity with event 5140 share access using available session attributes.
- **Recommendation:** preserve packet and event-log evidence before containment, review activity in the relevant session window, and reset or revoke access for affected identities according to incident-response procedures.
- **Recommendation:** reduce NTLM relay exposure by enforcing SMB signing and disabling NBT-NS/LLMNR where operationally feasible.

## References

- Hack The Box Sherlock: [Reaper](https://app.hackthebox.com/sherlocks/Reaper)
