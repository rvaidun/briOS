import type { Metadata } from "next";
import Image from "next/image";

import { ArrowUpRight } from "@/components/icons/ArrowUpRight";
import { Mail } from "@/components/icons/Mail";
import { DoorDashIcon, GitHubIcon } from "@/components/icons/SocialIcons";
import {
  InlineLink,
  List,
  ListItem,
  ListItemLabel,
  ListItemSubLabel,
  Section,
  SectionHeading,
} from "@/components/shared/ListComponents";
import { TopBar } from "@/components/TopBar";
import { createMetadata, createPersonJsonLd } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Rahul Vaidun",
  description:
    "Rahul Vaidun is a software engineer living in San Francisco, currently working at DoorDash as a Software Engineer.",
  path: "/",
});

export default function Home() {
  const personJsonLd = createPersonJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <div className="flex flex-1 flex-col">
        <TopBar>
          <div className="flex-1 text-sm font-semibold">About</div>
        </TopBar>

        <div className="flex-1 overflow-y-auto">
          <div className="text-secondary mx-auto flex max-w-xl flex-1 flex-col gap-16 py-16 leading-[1.6]">
            <Section>
              <Image
                src="/img/avatar.jpg"
                alt="Rahul Vaidun"
                width={44}
                height={44}
                draggable={false}
                className="mb-8 rounded-full select-none"
              />
              <p>
                Hey, I&apos;m Rahul. I&apos;m a{" "}
                <InlineLink href="https://github.com/rvaidun">developer</InlineLink> and graduated
                from the{" "}
                <InlineLink href="https://ucsc.edu">
                  University of California at Santa Cruz
                </InlineLink>{" "}
                with a B.S. in Computer Science in June 2023. I&apos;m currently working at{" "}
                <InlineLink href="https://www.doordash.com/">DoorDash</InlineLink> as a Software
                Engineer. I am working on the Catalog build team to help onboard merchants in the
                New Verticals space onto the platform.
              </p>
              <p>
                I&apos;m also working at{" "}
                <InlineLink href="http://svfinancials.com/">S V Financials</InlineLink>, automating
                giving rate quotes for client scenarios.
              </p>

              <p>
                Before DoorDash, I was working at{" "}
                <InlineLink href="https://www.experian.com/">Experian</InlineLink> as a Software
                Engineer. I was working on a platform to help financial institutions deploy and
                manage their machine learning models in the cloud. I also worked on a product in the
                model risk management space which helped institutions meet compliance requirements
                for their models in various regions.
              </p>
              <p>
                Before Experian, I was working as a contractor at{" "}
                <InlineLink href="https://texts.com/">Texts</InlineLink> building a universal chat
                client to bring all of your messages in one inbox. I reverse engineered the
                Instagram DM API and integrated it into the Texts platform.
              </p>
              <p>
                Before Texts, I interned at{" "}
                <InlineLink href="https://www.mulesoft.com/">Mulesoft</InlineLink> as a Solutions
                Engineer where I developed solutions and APIs in Anypoint platform and created an
                enablement menu for the Channel Solution Engineer Team
              </p>
              <p>
                When I&apos;m not at the computer I enjoy hiking, skiing, running, and playing table
                tennis.
              </p>
            </Section>

            <Section>
              <SectionHeading>Online</SectionHeading>
              <List>
                {socials.map(({ name, href, icon: Icon }) => (
                  <ListItem key={name} href={href}>
                    <Icon className="text-primary select-none" />
                    <ListItemLabel>{name}</ListItemLabel>
                  </ListItem>
                ))}
              </List>
            </Section>

            <Section>
              <SectionHeading>Work</SectionHeading>
              <List>
                {work.map(({ name, href, role, period, icon }) => (
                  <ListItem key={name} href={href}>
                    {icon.type === "image" ? (
                      <Image
                        width={40}
                        height={40}
                        src={icon.src}
                        alt={icon.alt}
                        className="h-5 w-5 rounded-md select-none"
                        draggable={false}
                      />
                    ) : (
                      <icon.component className="text-primary" />
                    )}
                    <ListItemLabel>{name}</ListItemLabel>
                    <ListItemSubLabel className="flex-1">{role}</ListItemSubLabel>
                    <ListItemSubLabel className="font-mono opacity-80">{period}</ListItemSubLabel>
                  </ListItem>
                ))}
              </List>
            </Section>

            <Section>
              <SectionHeading>Projects</SectionHeading>
              <List>
                {projects.map(({ name, href, description, external }) => (
                  <ListItem
                    key={name}
                    href={href}
                    className="flex-col items-start gap-0 sm:flex-row sm:items-center sm:gap-2"
                  >
                    <ListItemLabel className="sm:line-clamp-1">{name}</ListItemLabel>
                    <div className="flex flex-1 items-center gap-2">
                      <ListItemSubLabel className="flex-1">{description}</ListItemSubLabel>
                      {external && (
                        <ListItemSubLabel className="shrink-0 font-mono opacity-80">
                          <ArrowUpRight />
                        </ListItemSubLabel>
                      )}
                    </div>
                  </ListItem>
                ))}
              </List>
            </Section>
            <footer className="text-secondary border-t border-white/10 pt-4 text-center text-xs">
              Heavily inspired by{" "}
              <InlineLink href="https://rahulvaidun.com/">Rahul Vaidun</InlineLink>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}

// Data arrays
const socials = [
  {
    name: "Email",
    href: "mailto:rahul.vaidun@gmail.com",
    icon: Mail,
  },
  {
    name: "GitHub",
    href: "https://github.com/rvaidun",
    icon: GitHubIcon,
  },
];

const projects = [
  {
    name: "Email Automater",
    href: "https://github.com/rvaidun/email-automater/",
    description: "Automate your recruiter emails",
    external: true,
  },
  {
    name: "Data Visualization and Analysis for Animal Testing",
    href: "https://staff.design",
    description: "Data analysis and visualization project",
    external: true,
  },
  {
    name: "Population Density Visualization",
    href: "https://rahulvaidun.com/CSE-163-HW7-Maryland-Population-Density/",
    description: "A visualization of population density in Maryland",
    external: true,
  },
  {
    name: "BeFake",
    href: "https://github.com/rvaidun/befake",
    description: "A BeReal web app",
    external: true,
  },
  {
    name: "Document Generator",
    href: "https://github.com/rvaidun/Document-Generator",
    description: "Generate fake school like documents",
    external: true,
  },
];

type WorkIcon =
  | { type: "image"; src: string; alt: string }
  | { type: "svg"; component: React.ComponentType<{ className?: string }> };

interface WorkItem {
  name: string;
  href: string;
  role: string;
  period: string;
  icon: WorkIcon;
}

const work: WorkItem[] = [
  {
    name: "DoorDash",
    href: "https://doordash.com",
    role: "Software Engineer",
    period: "Current",
    icon: {
      type: "svg",
      component: DoorDashIcon,
    },
  },
  {
    name: "Experian",
    href: "https://experian.com",
    role: "Software Engineer",
    period: "2024-25",
    icon: {
      type: "image",
      src: "/img/experian.png",
      alt: "Experian",
    },
  },
  {
    name: "Texts",
    href: "https://texts.com",
    role: "Software Engineer (Contractor)",
    period: "2023",
    icon: {
      type: "image",
      src: "/img/texts.png",
      alt: "Texts",
    },
  },
  {
    name: "Mulesoft",
    href: "https://mulesoft.com",
    role: "Solutions Engineer Intern",
    period: "Summer 2022",
    icon: {
      type: "image",
      src: "/img/mulesoft.png",
      alt: "Mulesoft",
    },
  },
  {
    name: "SkyGeni",
    href: "https://skygeni.com",
    role: "Software Engineer Intern",
    period: "2020-21",
    icon: {
      type: "image",
      src: "/img/skygeni.png",
      alt: "SkyGeni",
    },
  },
  {
    name: "S V Financials",
    href: "https://svfinancials.com",
    role: "Software Engineer/Accountant",
    period: "2020 - Current",
    icon: {
      type: "image",
      src: "/img/svf.png",
      alt: "S V Financials",
    },
  },
];
