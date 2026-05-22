/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { buildChatChannels } from "@/lib/chat-links";
import { cn } from "@/lib/utils";

type ChatChannelCardsProps = Readonly<{
  buttonLabel: string;
  className?: string;
  planId: string;
  qrAlt: string;
}>;

export function ChatChannelCards({
  buttonLabel,
  className,
  planId,
  qrAlt
}: ChatChannelCardsProps) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-3", className)}>
      {buildChatChannels(planId).map((channel) => {
        const qrUrl = `/api/qr?data=${encodeURIComponent(channel.url)}`;

        return (
          <article
            key={channel.id}
            className="rounded-lg border border-foreground/10 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <Image
                alt={`${channel.name} logo`}
                height={32}
                src={channel.iconUrl}
                width={32}
                className="size-8"
              />
              <h3 className="text-base font-semibold text-[var(--mn-ink)]">
                {channel.name}
              </h3>
            </div>
            <div
              className={cn(
                "mt-4 flex justify-center rounded-md p-4 ring-1",
                channel.qrPanelClasses
              )}
            >
              <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-foreground/10">
                <img
                  alt={`${qrAlt}: ${channel.name}`}
                  className="size-36"
                  height={144}
                  src={qrUrl}
                  width={144}
                />
              </div>
            </div>
            <a
              className={cn(
                "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] transition focus:outline-none focus:ring-2 focus:ring-offset-2",
                channel.buttonClasses
              )}
              data-bpm-event="chat_channel_clicked"
              data-bpm-label={channel.name}
              data-bpm-target={channel.url}
              data-bpm-type="chat"
              href={channel.url}
              rel="noreferrer"
              target="_blank"
            >
              {buttonLabel}
              <ArrowTopRightOnSquareIcon
                aria-hidden={true}
                className="size-4"
              />
            </a>
          </article>
        );
      })}
    </div>
  );
}
