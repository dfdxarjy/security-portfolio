---
title: "Hack The Box Mini Pro Labs: Puppet"
description: "Completion of Hack The Box Mini Pro Labs: Puppet, with the issued certificate."
---

After spending time with Mythic C2, I also wanted experience with another C2 framework rather than becoming dependent on a single platform.

Puppet gave me exactly that opportunity.

The lab is built around **Sliver C2** and, like Mythical, begins from an assumed-breach scenario.

There is already a foothold inside the environment.

The challenge is figuring out how to operate from it.

This makes Puppet quite different from the normal workflow of scanning an external machine, finding an exposed service, exploiting it and obtaining the first shell.

Initial access has effectively already happened.

Your job starts afterwards.

## Learning Sliver

The main reason I wanted to work through Puppet was Sliver.

By this point I had already spent time operating Mythic, so using another C2 framework was useful because it forced me to separate my understanding of **C2 concepts** from my understanding of one particular tool.

The terminology and workflow are different, but the underlying problems remain familiar:

- How do I interact with the compromised host?
- What can the current user access?
- How do I execute tooling?
- How do I pivot through the environment?
- How do I manage sessions?
- How do I move to another machine without losing track of what I already control?

Working through those problems using Sliver helped make C2 operation feel less tool-specific.

I was no longer learning only **how Mythic works**.

I was learning more generally **how to operate through a C2 framework**.

## Beacons, sessions and post-exploitation

One part I particularly liked about Puppet was having to work through an existing beacon rather than immediately receiving a traditional interactive shell.

It forces a slightly different mentality.

A beacon is not just a prettier reverse shell.

Communication, tasking and interaction behave differently, and switching between asynchronous beacon-style operation and more interactive sessions helped me better understand why C2 frameworks distinguish between them.

It also made me think more carefully about what I was executing and when.

Instead of throwing commands at a terminal until something worked, the workflow felt much more deliberate.

## Windows, Linux and DevOps infrastructure

Puppet also mixes Windows and Linux systems, which made the attack path more interesting.

The lab combines Active Directory with infrastructure that would normally be considered part of system administration or DevOps.

That was particularly interesting because it demonstrates an important lesson:

**Enterprise infrastructure can become part of an attack path even when it was never designed as a security-sensitive system.**

Configuration-management platforms have legitimate reasons to execute commands and distribute configuration across machines.

If that infrastructure becomes compromised or misconfigured, those same capabilities can become extremely powerful for lateral movement.

This was one of the aspects of Puppet I found most interesting.

Rather than focusing entirely on another traditional Windows vulnerability, the environment forced me to think about how administrative infrastructure itself could be abused.

## C2-assisted pivoting

Puppet also gave me more practice using the C2 itself as part of my network access.

Earlier in my learning, pivoting usually meant configuring another external tunneling tool and then routing my normal tooling through it.

With Sliver, I spent more time thinking about tunneling and forwarding as part of the C2 operation itself.

That helped connect two skills I had previously treated somewhat separately:

**pivoting** and **C2 operations**.

Dante taught me why pivoting matters.

Offshore showed me why managing multiple compromised systems through a C2 is useful.

Puppet brought those ideas together in a much smaller and more focused environment.

## What I learned

Puppet gave me practical experience with:

- Sliver C2
- Beacon and session management
- C2-based post-exploitation
- Active Directory enumeration
- Lateral movement
- Windows privilege escalation
- Linux privilege escalation
- Credential discovery
- Pivoting through a C2
- DevOps/configuration-management abuse
- Operating from an assumed-breach position

## Mythic vs Sliver

One of the most valuable parts of completing Puppet after working with Mythic was being able to compare the two workflows.

I do not think the important lesson was deciding which framework was "better."

The useful part was becoming comfortable enough with the concepts that changing frameworks did not completely change how I approached an engagement.

The interface changes.

The commands change.

The way certain functionality is implemented changes.

But the methodology underneath it remains largely the same:

**understand the foothold → enumerate → escalate → pivot → move laterally → maintain awareness of the environment**

That was a useful step toward becoming less dependent on particular tools.

## Conclusion

Puppet was one of the more focused labs I worked through.

Instead of spending most of the time looking for initial access, it starts where many red-team operations become interesting:

**you already have execution inside the environment—now what?**

Learning Sliver gave me experience with another C2 framework, while the combination of Active Directory, Linux, Windows and configuration-management infrastructure made the attack path feel different from the labs I had completed before it.

More importantly, Puppet helped reinforce a change that had been happening since Offshore:

I was gradually moving away from thinking purely in terms of individual shells and compromised machines.

I was starting to think more in terms of **access, sessions, infrastructure and operations**.

## Credential

This page records my completion of **Hack The Box Mini Pro Labs: Puppet**, issued by
Hack The Box.

## Certificate

<iframe
  class="credential-certificate"
  src="/assets/training/puppet/puppet.pdf"
  title="Hack The Box Mini Pro Labs: Puppet certificate PDF (embedded viewer)"
  loading="lazy"
></iframe>

Fallback link if the embedded viewer does not render:
[Hack The Box Mini Pro Labs: Puppet certificate](/assets/training/puppet/puppet.pdf).

## References

- [Hack The Box](https://www.hackthebox.com/) — the platform that issues this credential.
