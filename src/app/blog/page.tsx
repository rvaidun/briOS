import type { Metadata } from "next";
import Link from "next/link";

import { HeartButton } from "@/components/blog/HeartButton";
import { List, Section, SectionHeading } from "@/components/shared/ListComponents";
import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";
import { getAllWritingPosts } from "@/lib/writing";

export const metadata: Metadata = createMetadata({
  title: "Blog",
  description:
    "Thoughts on design, engineering, and building products. Essays and reflections from Rahul Vaidun.",
  path: "/blog",
});

export default async function WritingPage() {
  const posts = await getAllWritingPosts();

  // Group posts by year
  const postsByYear: Record<string, typeof posts> = {};
  posts.forEach((post) => {
    const publishedDate = post.published || post.createdTime;
    const year = new Date(publishedDate).getFullYear().toString();
    if (!postsByYear[year]) {
      postsByYear[year] = [];
    }
    postsByYear[year].push(post);
  });

  // Sort years in descending order
  const sortedYears = Object.keys(postsByYear).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <>
      <TopBar>
        <div className="flex-1 text-sm font-medium">Writing</div>
      </TopBar>
      <div data-scrollable className="flex-1 overflow-y-auto pt-11 md:pt-0">
        <div className="text-secondary mx-auto flex max-w-xl flex-1 flex-col gap-16 py-16 leading-[1.6]">
          {sortedYears.map((year) => (
            <Section key={year}>
              <SectionHeading>{year}</SectionHeading>
              <List>
                {postsByYear[year]
                  .filter((post) => post.slug)
                  .map((post) => (
                    <li key={post.id} className="flex items-center gap-3">
                      <Link href={`/blog/${post.slug}`} className="group/list-item min-w-0 flex-1">
                        <span className="text-primary leading-[1.6] font-medium underline-offset-1 group-hover/list-item:underline">
                          {post.title}
                        </span>
                      </Link>
                      <HeartButton slug={post.slug as string} size="sm" />
                    </li>
                  ))}
              </List>
            </Section>
          ))}
        </div>
      </div>
    </>
  );
}
