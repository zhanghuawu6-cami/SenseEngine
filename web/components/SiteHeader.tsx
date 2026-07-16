"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";

const links = [
  { href: "/technology", label: "技术" },
  { href: "/products", label: "产品" },
  { href: "/insights", label: "洞察" },
  { href: "/about", label: "关于" },
  { href: "/experience", label: "体验" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <Link href="/" className="site-logo">
          <BrandMark />
        </Link>
        <nav className="desktop-nav" aria-label="主要导航">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isCurrent(link.href) ? "is-active" : ""}
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/contact"
          className="header-contact"
          aria-current={isCurrent("/contact") ? "page" : undefined}
        >
          建立合作 <ArrowUpRight size={15} strokeWidth={1.8} />
        </Link>
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "关闭导航" : "打开导航"}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <div className={`mobile-nav ${open ? "is-open" : ""}`}>
        <nav aria-label="移动端导航">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}<span>0{links.indexOf(link) + 1}</span>
            </Link>
          ))}
          <Link
            href="/contact"
            aria-current={isCurrent("/contact") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            建立合作<span>06</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
