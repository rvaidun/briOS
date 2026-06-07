"use client";

import { type ReactNode, useState } from "react";

import { Check } from "@/components/icons/Check";
import { Link as LinkIcon } from "@/components/icons/Link";
import { cn } from "@/lib/utils";

type HeadingLevel = 1 | 2 | 3;

interface HeadingAnchorProps {
  level: HeadingLevel;
  id: string;
  className?: string;
  children: ReactNode;
}

export function HeadingAnchor({ level, id, className, children }: HeadingAnchorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      window.history.replaceState(null, "", `#${id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy heading link", e);
    }
  };

  const sharedClassName = cn("group flex scroll-mt-24 items-center gap-2", className);
  const button = (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Link copied" : "Copy link to this section"}
      className="text-quaternary hover:text-primary focus-visible:text-primary cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
    >
      {copied ? <Check size={18} /> : <LinkIcon size={18} />}
    </button>
  );

  if (level === 1) {
    return (
      <h1 id={id} className={sharedClassName}>
        <span>{children}</span>
        {button}
      </h1>
    );
  }
  if (level === 2) {
    return (
      <h2 id={id} className={sharedClassName}>
        <span>{children}</span>
        {button}
      </h2>
    );
  }
  return (
    <h3 id={id} className={sharedClassName}>
      <span>{children}</span>
      {button}
    </h3>
  );
}
