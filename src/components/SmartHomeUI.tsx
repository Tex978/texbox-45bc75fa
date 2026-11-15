import type { ReactNode } from "react";
import { Battery, Blinds, Droplets, Fan, Lightbulb, LockKeyhole, Snowflake, Thermometer, WashingMachine, type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

const sectionIcons: Record<string, LucideIcon> = {
  "Gree klímák": Snowflake,
  "Hőmérők (Xiaomi)": Thermometer, "Légtisztító": Fan, "Okoszár": LockKeyhole,
  "Tuya eszközök": Lightbulb, "Tuya / Smart Life eszközök": Lightbulb,
  "Bosch háztartási gépek": WashingMachine, "Redőnyök": Blinds,
};
const sectionNames: Record<string, string> = { "Hőmérők (Xiaomi)": "Hőmérséklet és páratartalom", "Bosch háztartási gépek": "Háztartási gépek", "Tuya / Smart Life eszközök": "Tuya · Smart Life", "Tuya eszközök": "Tuya · Smart Life" };
const subtitles: Record<string, string> = { "Hőmérők (Xiaomi)": "Xiaomi", "Légtisztító": "Xiaomi", "Okoszár": "Xiaomi", "Bosch háztartási gépek": "Bosch · Home Connect", "Redőnyök": "Connector" };

export function SmartSection({ title = "", children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  const Icon = sectionIcons[title] ?? Lightbulb;
  return <section className={`smart-section ${className}`}>
    <header className="smart-section-heading">
      <span className="smart-icon"><Icon size={21} strokeWidth={1.7} /></span>
      <div><h2>{sectionNames[title] ?? title}</h2>{subtitles[title] && <p>{subtitles[title]}</p>}</div>
    </header>
    {children}
  </section>;
}

export function IconButton({ icon: Icon, label, ...props }: ButtonProps & { icon: LucideIcon; label: string }) {
  return <Button variant="outline" size="icon" aria-label={label} title={label} {...props}><Icon size={17} /></Button>;
}

export function SensorDetails({ humidity, battery, online }: { humidity?: number | null; battery?: number | null; online: boolean }) {
  return <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
    {humidity != null && <span className="inline-flex items-center gap-1.5"><Droplets size={14} className="text-home-water" />{humidity}%</span>}
    {battery != null && <span className="inline-flex items-center gap-1.5"><Battery size={15} />{battery}%</span>}
    <span className="ml-auto inline-flex items-center gap-1.5"><span className={`status-dot ${online ? "bg-home-success" : "bg-muted-foreground"}`} />{online ? "Elérhető" : "Offline"}</span>
  </div>;
}