import type { Metadata } from "next";
import { SupportInbox } from "./SupportInbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support Inbox | DrNote Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminSupportPage() {
  return <SupportInbox />;
}
