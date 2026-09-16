---
title: "Hack The Box Pro Labs: Offshore"
description: "Completion of Hack The Box Pro Labs: Offshore, with the issued certificate."
---

After Dante and Zephyr, I wanted to move into something larger and closer to the type of environment where managing the engagement itself becomes part of the challenge.

That led me to Offshore.

Offshore immediately felt different.

There were more systems to keep track of, more Active Directory relationships to understand, more pivots, and considerably more information to manage.

By this point, I was becoming comfortable with the traditional workflow of Linux tooling, tunnels and reverse shells. Instead of continuing to approach every compromised machine that way, I decided to use Offshore as an opportunity to learn something I had wanted to explore for a while:

**C2-based operations.**

## Learning Mythic C2

For Offshore, I started learning and operating **Mythic** as my command-and-control framework.

This ended up being one of my favourite parts of the lab.

Until then, most of my workflow revolved around getting a shell, setting up whatever tunnel I needed, running my tools and repeating the process on the next host.

That works, but once the number of compromised systems starts increasing, managing everything manually becomes increasingly awkward.

Using Mythic changed how I thought about the engagement.

Instead of seeing each compromised machine as another terminal window, I started thinking about compromised hosts as part of an operation.

I had to become more comfortable with:

- Managing multiple active sessions
- Keeping track of compromised systems
- Operating through a C2 framework
- Maintaining access
- Organising information collected from multiple machines
- Working through pivots
- Separating infrastructure management from individual exploitation

Learning Mythic while working through Offshore made the C2 workflow much easier to understand because I had a real environment in which to use it.

Rather than installing a C2 framework and testing it against one disposable VM, I actually had a reason to manage several systems and think about how the framework fitted into the rest of my methodology.

## Enterprise Active Directory

Offshore also expanded heavily on the Active Directory knowledge I developed during Zephyr.

The environment required much more attention to enumeration, lateral movement and relationships between different parts of the infrastructure.

One of the biggest differences was the amount of information that had to be kept organised.

Credentials that appeared unimportant at one point could become relevant later. A host that initially looked uninteresting could provide another route into the network. Trust relationships and access between different parts of the environment became increasingly important.

It reinforced the idea that enumeration is continuous.

You do not enumerate once at the beginning of an engagement.

You enumerate again every time your position changes.

## What I learned

Offshore gave me practical experience with:

- Advanced Active Directory enumeration
- Active Directory exploitation
- Lateral movement
- Crossing trust boundaries
- Windows privilege escalation
- Pivoting through larger networks
- Web application attack paths
- Endpoint protection considerations
- Credential management
- C2 infrastructure and operations
- Mythic C2
- Managing multiple compromised hosts
- Session management
- Building and maintaining a network map
- Working methodically through a large environment

## From shells to operations

The biggest personal takeaway from Offshore was not a particular exploit or vulnerability.

It was the change in workflow.

Earlier in my learning, compromising a machine usually meant getting a reverse shell and working directly from it.

Offshore was where I deliberately started moving away from that mindset.

Using Mythic forced me to think more about **operations** rather than individual shells.

That included how access is maintained, how multiple hosts are organised, how information is collected, and how one compromised system fits into the larger network.

I still used the same underlying penetration-testing knowledge, but the way I managed the engagement changed significantly.

## Conclusion

Offshore was one of the most valuable environments I worked through after Dante and Zephyr.

Dante taught me how to pivot through a network.

Zephyr significantly improved my understanding of Active Directory attack paths.

Offshore brought those skills together inside a much larger environment and gave me the opportunity to start learning C2-based operations with Mythic.

That progression was exactly what I wanted from the Pro Labs.

Each environment required less focus on simply compromising another machine and more focus on understanding and operating inside the network as a whole.

## Credential

This page records my completion of **Hack The Box Pro Labs: Offshore**, issued by
Hack The Box.

## Certificate

<iframe
  class="credential-certificate"
  src="/assets/training/offshore/Offshore.pdf"
  title="Hack The Box Pro Labs: Offshore certificate PDF (embedded viewer)"
  loading="lazy"
></iframe>

Fallback link if the embedded viewer does not render:
[Hack The Box Pro Labs: Offshore certificate](/assets/training/offshore/Offshore.pdf).

## References

- [Hack The Box](https://www.hackthebox.com/) — the platform that issues this credential.
