import Link from "next/link";
import { siteConfig, cityState } from "@/config/site";

export default function Footer() {
  return (
    <footer className="py-12 text-center text-zinc-600 text-xs border-t border-zinc-900 bg-black px-4">
      <p>
        &copy; {new Date().getFullYear()} {siteConfig.brand.legalName}. All Rights Reserved. {cityState}.
      </p>
      <p className="mt-2 text-[10px] text-zinc-700 max-w-xl mx-auto">
        Disclaimer: * Payment estimations are for illustrative purposes and do not represent guaranteed terms. Down
        payments, rates, and approval are subject to in-person verification, residency, and source of income criteria.
      </p>
      <p className="mt-3">
        <Link href="/admin" className="text-zinc-500 hover:text-primary hover:underline">
          Dealer Admin Portal (Secure Link)
        </Link>
        <span className="text-zinc-800 mx-2">|</span>
        <a href="/privacy.html" className="text-zinc-500 hover:text-primary hover:underline">
          Privacy Policy
        </a>
      </p>
    </footer>
  );
}
