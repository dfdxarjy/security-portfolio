---
title: "Hack The Box Pro Labs: Zephyr"
description: "Completion of Hack The Box Pro Labs: Zephyr, with the issued certificate."
---

After finishing Dante, I immediately moved on to Zephyr the next day.

The difference was noticeable almost immediately.

Dante introduced me to working through a larger network, but Zephyr pushed much harder on **Active Directory**. Instead of jumping between unrelated exploitation techniques, the environment required me to pay much more attention to identities, permissions, relationships between systems and the structure of the domain itself.

For me, Zephyr felt like the point where Active Directory stopped being just another topic to study and started becoming an environment I had to properly understand.

## Active Directory enumeration

One of the biggest lessons from Zephyr was that enumeration becomes much more important as the environment becomes more interconnected.

Finding another user, group membership, credential or permission can completely change what is reachable.

That meant slowing down and paying attention to relationships rather than immediately looking for another exploit.

I had to become more comfortable with thinking about:

- Users and groups
- Domain relationships
- Permissions
- Credential reuse
- Service accounts
- Lateral movement
- Trust relationships
- Privilege escalation paths

Zephyr also reinforced something Dante had already started teaching me: compromising one system does not necessarily mean you have finished with it.

A machine can contain credentials, access or information that becomes useful much later in the engagement.

## A step up from Dante

Zephyr felt like a clear step up from Dante.

Dante exposed me to many different techniques across Linux, Windows and web applications. Zephyr felt considerably more focused.

The central problem became:

**What does my current access allow me to reach next?**

That makes the lab much more dependent on understanding Active Directory rather than simply identifying vulnerable software.

It also made tools that visualise relationships and permissions much more useful, because the attack path is often hidden in the structure of the environment rather than sitting inside an obvious vulnerability.

## What I learned

Zephyr gave me more hands-on experience with:

- Active Directory enumeration
- Active Directory exploitation
- Lateral movement
- Privilege escalation
- Credential and permission analysis
- Trust relationships
- Pivoting
- Windows-focused post-exploitation
- SQL-related attack paths
- Building attack paths through an enterprise environment

## Conclusion

Zephyr was exactly the type of lab I wanted after Dante.

Dante taught me how to move through a network.

Zephyr taught me to pay much more attention to **why I was able to move through it**.

Understanding permissions, credentials and relationships became much more important than simply finding another vulnerable service.

It gave me a much better foundation in Active Directory attacks and made the transition into larger environments such as Offshore feel much more natural.

## Credential

This page records my completion of **Hack The Box Pro Labs: Zephyr**, issued by
Hack The Box.

## Certificate

<iframe
  class="credential-certificate"
  src="/assets/training/zephyr/Zephyr.pdf"
  title="Hack The Box Pro Labs: Zephyr certificate PDF (embedded viewer)"
  loading="lazy"
></iframe>

Fallback link if the embedded viewer does not render:
[Hack The Box Pro Labs: Zephyr certificate](/assets/training/zephyr/Zephyr.pdf).

## References

- [Hack The Box](https://www.hackthebox.com/) — the platform that issues this credential.
