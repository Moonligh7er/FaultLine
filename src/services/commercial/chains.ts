// ============================================================
// Corporate Chain Registry
//
// Chain-identifier database — maps corporate brand names (and aliases) to
// franchisor compliance contacts where publicly available.
//
// Seed covers ~40 of the highest-volume US commercial chains across retail,
// restaurant, banking, hotel, gym, pharmacy, telecom, and gas station
// categories. Manually expanded as pilot cities engage or as reporters
// submit unrecognized brand names.
//
// Every entry starts `pending-review` — compliance contacts change and need
// per-annual re-verification. Same chain of custody as statute + routing
// datasets.
// ============================================================

export type ChainVerificationStatus = 'verified' | 'pending-review' | 'stale' | 'draft';

export interface ChainRecord {
  chainId: string;              // Canonical identifier used in report submissions
  brandName: string;            // Display name
  aliases: string[];            // Alternative names / DBAs residents might use
  franchisorComplianceEmail?: string;
  franchisorComplianceUrl?: string;
  franchisorMailingAddress?: string;
  notes?: string;               // e.g., "Franchisee-owned locations may not be corporate-responsible; verify per location"
  verificationStatus: ChainVerificationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  nextReviewAt: string | null;
}

// Seed dataset. All records start pending-review; franchisor contacts are
// public-record starting points that need per-entry human verification
// before being flagged `verified`.
const CHAIN_RECORDS: ChainRecord[] = [
  // ── Retail / big-box ──
  { chainId: 'walmart', brandName: 'Walmart', aliases: ['Walmart Supercenter', 'Walmart Neighborhood Market'], franchisorComplianceUrl: 'https://corporate.walmart.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'target', brandName: 'Target', aliases: ['Target Corporation'], franchisorComplianceUrl: 'https://corporate.target.com/getting-in-touch', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'costco', brandName: 'Costco Wholesale', aliases: ['Costco'], franchisorComplianceUrl: 'https://customerservice.costco.com/', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'home-depot', brandName: 'The Home Depot', aliases: ['Home Depot'], franchisorComplianceUrl: 'https://corporate.homedepot.com/investors/investor-contact', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'lowes', brandName: "Lowe's", aliases: ['Lowes', "Lowe's Home Improvement"], franchisorComplianceUrl: 'https://corporate.lowes.com/contact', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'best-buy', brandName: 'Best Buy', aliases: [], franchisorComplianceUrl: 'https://corporate.bestbuy.com/contact-us/', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Pharmacy ──
  { chainId: 'cvs', brandName: 'CVS Pharmacy', aliases: ['CVS', 'CVS Health'], franchisorComplianceUrl: 'https://www.cvshealth.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'walgreens', brandName: 'Walgreens', aliases: ['Walgreens Boots Alliance'], franchisorComplianceUrl: 'https://www.walgreens.com/topic/help/generalhelp/contactus.jsp', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'rite-aid', brandName: 'Rite Aid', aliases: [], franchisorComplianceUrl: 'https://www.riteaid.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Fast food / QSR ──
  { chainId: 'mcdonalds', brandName: "McDonald's", aliases: ['Mcdonalds'], franchisorComplianceUrl: 'https://www.mcdonalds.com/us/en-us/contact-us.html', notes: 'Franchisee-owned locations may not be corporate-responsible; corporate may forward to the franchisee.', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'starbucks', brandName: 'Starbucks', aliases: ['Starbucks Coffee'], franchisorComplianceUrl: 'https://customerservice.starbucks.com/', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'chipotle', brandName: 'Chipotle', aliases: ['Chipotle Mexican Grill'], franchisorComplianceUrl: 'https://www.chipotle.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'subway', brandName: 'Subway', aliases: [], franchisorComplianceUrl: 'https://www.subway.com/en-US/ContactUs', notes: 'Franchisee-owned network; corporate escalation typically routes to the franchisee.', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'wendys', brandName: "Wendy's", aliases: [], franchisorComplianceUrl: 'https://www.wendys.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'burger-king', brandName: 'Burger King', aliases: ['BK'], franchisorComplianceUrl: 'https://www.bk.com/contact-us', notes: 'Restaurant Brands International parent; heavily franchised.', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'dunkin', brandName: "Dunkin'", aliases: ['Dunkin Donuts', 'Dunkin Donuts', "Dunkin' Donuts"], franchisorComplianceUrl: 'https://www.dunkindonuts.com/en/customer-support', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'taco-bell', brandName: 'Taco Bell', aliases: [], franchisorComplianceUrl: 'https://www.tacobell.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'kfc', brandName: 'KFC', aliases: ['Kentucky Fried Chicken'], franchisorComplianceUrl: 'https://www.kfc.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'pizza-hut', brandName: 'Pizza Hut', aliases: [], franchisorComplianceUrl: 'https://www.pizzahut.com/help/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'dominos', brandName: "Domino's", aliases: ['Dominos', "Domino's Pizza"], franchisorComplianceUrl: 'https://www.dominos.com/en/pages/customer-service/', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Casual / sit-down restaurants ──
  { chainId: 'applebees', brandName: "Applebee's", aliases: ['Applebees'], franchisorComplianceUrl: 'https://www.applebees.com/en/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'chilis', brandName: "Chili's Grill & Bar", aliases: ['Chilis', "Chili's"], franchisorComplianceUrl: 'https://www.chilis.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'olive-garden', brandName: 'Olive Garden', aliases: [], franchisorComplianceUrl: 'https://www.olivegarden.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Banking ──
  { chainId: 'bank-of-america', brandName: 'Bank of America', aliases: ['BofA', 'BOA'], franchisorComplianceUrl: 'https://about.bankofamerica.com/en/making-an-impact/consumer-support', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'wells-fargo', brandName: 'Wells Fargo', aliases: [], franchisorComplianceUrl: 'https://www.wellsfargo.com/about/corporate/contact/', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'chase', brandName: 'Chase', aliases: ['JPMorgan Chase', 'Chase Bank'], franchisorComplianceUrl: 'https://www.chase.com/digital/customer-service', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'citibank', brandName: 'Citibank', aliases: ['Citi'], franchisorComplianceUrl: 'https://online.citi.com/US/JRS/pands/detail.do?ID=Contact', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'us-bank', brandName: 'U.S. Bank', aliases: ['USBank', 'US Bank'], franchisorComplianceUrl: 'https://www.usbank.com/customer-service.html', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'td-bank', brandName: 'TD Bank', aliases: [], franchisorComplianceUrl: 'https://www.td.com/us/en/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Hotels ──
  { chainId: 'marriott', brandName: 'Marriott', aliases: ['Marriott International'], franchisorComplianceUrl: 'https://www.marriott.com/help/contact-us.mi', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'hilton', brandName: 'Hilton', aliases: ['Hilton Worldwide'], franchisorComplianceUrl: 'https://www.hilton.com/en/contact-us/', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'hyatt', brandName: 'Hyatt', aliases: [], franchisorComplianceUrl: 'https://www.hyatt.com/help/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'best-western', brandName: 'Best Western', aliases: [], franchisorComplianceUrl: 'https://www.bestwestern.com/en_US/contact-us.html', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Gyms ──
  { chainId: 'planet-fitness', brandName: 'Planet Fitness', aliases: [], franchisorComplianceUrl: 'https://www.planetfitness.com/contact', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'la-fitness', brandName: 'LA Fitness', aliases: [], franchisorComplianceUrl: 'https://www.lafitness.com/Pages/contactus.aspx', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Gas stations / convenience ──
  { chainId: 'shell', brandName: 'Shell', aliases: [], franchisorComplianceUrl: 'https://www.shell.us/motorists/contact-us.html', notes: 'Locations may be franchise or independent; verify per location.', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'exxon-mobil', brandName: 'ExxonMobil', aliases: ['Exxon', 'Mobil'], franchisorComplianceUrl: 'https://www.exxon.com/en/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'chevron', brandName: 'Chevron', aliases: [], franchisorComplianceUrl: 'https://www.chevronwithtechron.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'seven-eleven', brandName: '7-Eleven', aliases: ['7 Eleven', 'Seven Eleven'], franchisorComplianceUrl: 'https://www.7-eleven.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'wawa', brandName: 'Wawa', aliases: [], franchisorComplianceUrl: 'https://www.wawa.com/contact-us', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },

  // ── Grocery ──
  { chainId: 'whole-foods', brandName: 'Whole Foods Market', aliases: ['Whole Foods'], franchisorComplianceUrl: 'https://www.wholefoodsmarket.com/customer-service', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'stop-and-shop', brandName: 'Stop & Shop', aliases: ['Stop and Shop'], franchisorComplianceUrl: 'https://stopandshop.com/pages/contact-us', notes: 'Common in Fault Line pilot region (MA / RI / NH).', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'shaws', brandName: "Shaw's", aliases: ['Shaws', "Shaw's Supermarkets"], franchisorComplianceUrl: 'https://www.shaws.com/contact-us.html', notes: 'Common in New England pilot region.', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
  { chainId: 'market-basket', brandName: 'Market Basket', aliases: ['DeMoulas Market Basket'], franchisorComplianceUrl: 'https://www.shopmarketbasket.com/contact-us', notes: 'MA / NH / ME grocery chain. Common in Fault Line pilot region.', verificationStatus: 'pending-review', verifiedBy: null, verifiedAt: null, nextReviewAt: null },
];

// ── Public accessors ──────────────────────────────────────────────────────

export function findChain(brandNameOrAlias: string): ChainRecord | null {
  const needle = brandNameOrAlias.trim().toLowerCase();
  const match = CHAIN_RECORDS.find(
    (c) =>
      c.brandName.toLowerCase() === needle ||
      c.chainId === needle ||
      c.aliases.some((a) => a.toLowerCase() === needle),
  );
  return match ?? null;
}

export function allChains(): ChainRecord[] {
  return CHAIN_RECORDS.filter((c) => c.verificationStatus !== 'draft');
}

export function chainDisclaimer(chain: ChainRecord): string {
  const versionLine = `Chain reference: ${chain.chainId} · dataset entry`;
  switch (chain.verificationStatus) {
    case 'verified':
      return `${versionLine} · reviewed: ${chain.verifiedBy || 'unnamed reviewer'}, ${chain.verifiedAt || 'date unknown'}. Contact information may still be stale — verify before mailing.`;
    case 'stale':
      return `${versionLine} · review OVERDUE. Verify contact information before mailing.`;
    case 'pending-review':
      return `${versionLine} · NOT YET VERIFIED. Contact information is our best current reading from public corporate sources. Verify before mailing.`;
    case 'draft':
      return `${versionLine} · draft entry, not for user delivery.`;
  }
}
