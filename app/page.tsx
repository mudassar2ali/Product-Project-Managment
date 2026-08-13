import type { Metadata } from "next";
import { CommandCenterShell } from "./command-center-shell";

export const metadata: Metadata = {
  title: "Command Center | Product Development",
  description: "Enterprise product and project portfolio command center.",
};

export default function Home() {
  return <CommandCenterShell />;
}
