import { ChevronDown, Globe, Menu, Settings } from "lucide-react"
import { Logo } from "./logo"

const LINKS = ["Trade", "Markets", "Portfolio", "Rewards", "Leaderboard"]

const icon =
  "grid size-8 place-items-center rounded-[3px] border border-line text-muted-foreground hover:text-foreground"

export function Nav() {
  return (
    <nav className="flex h-[50px] shrink-0 items-center gap-6 px-3">
      <button type="button" aria-label="Menu" className={`${icon} lg:hidden`}>
        <Menu className="size-4" />
      </button>
      <Logo wordmark={false} className="lg:hidden" />
      <Logo className="hidden lg:flex" />
      <ul className="hidden items-center gap-5 text-[13px] text-muted-foreground lg:flex">
        {LINKS.map((link, index) => (
          <li key={link} className={index === 0 ? "text-foreground" : "hover:text-foreground"}>
            {link}
          </li>
        ))}
        <li className="flex items-center gap-1 hover:text-foreground">
          More <ChevronDown className="size-3.5" />
        </li>
      </ul>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="h-8 rounded-[3px] bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          Connect
        </button>
        <button type="button" aria-label="Language" className={icon}>
          <Globe className="size-4" />
        </button>
        <button type="button" aria-label="Settings" className={icon}>
          <Settings className="size-4" />
        </button>
      </div>
    </nav>
  )
}
